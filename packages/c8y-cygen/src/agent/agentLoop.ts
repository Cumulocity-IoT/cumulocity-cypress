import Anthropic from "@anthropic-ai/sdk";
import { assembleSystemPrompt } from "../prompt/promptAssembly.js";
import { buildAgentTools } from "./tools.js";
import type { BrowserTools } from "../browser/browserTools.js";
import type { Scenario } from "../scenario/scenarioContract.js";

/**
 * Deliberate MVP choice (adaptive thinking, effort: high) - escalate to
 * claude-opus-4-8 if quality requires it. One config field, tuned empirically.
 */
export const DEFAULT_MODEL = "claude-sonnet-5";
export const DEFAULT_MAX_ITERATIONS = 30;

export interface GenerationLoopOptions {
  scenario: Scenario;
  browser: BrowserTools;
  /** Path to the checked-out target app repo (e.g. cumulocity-ui-e2e). */
  appRepoPath: string;
  /** The target app's own house-rules instructions file, read live. */
  houseRulesPath: string;
  /** c8y-cygen's own prompts/domain-notes.md. */
  domainNotesPath: string;
  model?: string;
  /** Safety net on the exploration loop; self-heal (M6) layers its own bound on top. */
  maxIterations?: number;
  anthropicApiKey?: string;
  /**
   * Called with each message as the loop produces it (assistant turn, tool
   * results fed back, next assistant turn, ...) - the only way to observe
   * intermediate progress, since runGenerationLoop itself resolves once with
   * the final message.
   */
  onMessage?: (message: Anthropic.Beta.Messages.BetaMessage) => void;
}

export class AgentLoopError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentLoopError";
  }
}

/**
 * Drives an already-constructed Tool Runner to completion and returns its
 * final message. `client.beta.messages.toolRunner(...)` only BUILDS a
 * BetaToolRunner - it is an async iterable that does nothing until iterated;
 * each iteration is one turn of the actual loop (assistant response -> tool
 * execution -> tool results fed back -> next assistant turn), repeating until
 * the model stops calling tools or max_iterations is hit. This function is
 * what actually runs that loop; kept separate from runGenerationLoop below so
 * it can be unit tested against a fake async-iterable runner, with no
 * Anthropic API call involved.
 */
export async function runToolRunnerToCompletion<TMessage>(
  runner: AsyncIterable<TMessage>,
  onMessage?: (message: TMessage) => void
): Promise<TMessage> {
  let finalMessage: TMessage | undefined;
  for await (const message of runner) {
    onMessage?.(message);
    finalMessage = message;
  }
  if (finalMessage === undefined) {
    throw new AgentLoopError(
      "Tool Runner completed without producing any messages."
    );
  }
  return finalMessage;
}

/**
 * Wires AuthSession/BrowserTools (M1-M2), ScenarioContract (M3), PromptAssembly,
 * and the tool surface together, then drives the Anthropic Tool Runner loop to
 * completion. This is the M4 mechanical wiring: the agent can explore, write a
 * spec, and run it - not yet the smart iterate-on-failure self-heal loop (M6)
 * or fixture capture/redaction (M5).
 *
 * Our tools are all client-side/custom (no server-side tools like web_search
 * or code_execution), so stop_reason "pause_turn" - the server-tool iteration
 * cap - should not occur here; this does not handle resuming a paused turn.
 */
export async function runGenerationLoop(
  options: GenerationLoopOptions
): Promise<Anthropic.Beta.Messages.BetaMessage> {
  const style = options.scenario.style ?? "mocked";

  const systemPrompt = await assembleSystemPrompt({
    houseRulesPath: options.houseRulesPath,
    domainNotesPath: options.domainNotesPath,
    style,
  });

  const client = new Anthropic({ apiKey: options.anthropicApiKey });
  const tools = buildAgentTools(options.browser, options.appRepoPath);

  const runner = client.beta.messages.toolRunner({
    model: options.model ?? DEFAULT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    max_iterations: options.maxIterations ?? DEFAULT_MAX_ITERATIONS,
    system: systemPrompt,
    tools,
    messages: [
      { role: "user", content: renderScenarioAsTask(options.scenario, style) },
    ],
  });

  return runToolRunnerToCompletion(runner, options.onMessage);
}

/**
 * Exported so the self-heal loop (agent/selfHeal.ts) can render the same
 * initial task turn without duplicating this formatting.
 */
export function renderScenarioAsTask(scenario: Scenario, style: string): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  const numbered = (items: string[]) =>
    items.map((item, i) => `${i + 1}. ${item}`).join("\n");

  return [
    scenario.title ? `# Scenario: ${scenario.title}` : "# Scenario",
    `Style for this run: ${style}`,
    "## Objective",
    scenario.objective,
    "## Preconditions",
    list(scenario.preconditions),
    "## Setup",
    list(scenario.setup),
    "## Steps",
    numbered(scenario.steps),
    "## Expected Outcomes (immutable - every one must map to a concrete assertion)",
    numbered(scenario.expectedOutcomes),
  ].join("\n\n");
}
