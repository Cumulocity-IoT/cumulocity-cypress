import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { assembleSystemPrompt } from "../prompt/promptAssembly.js";
import { buildAgentTools, type AgentSessionRecord, type StagedFixture } from "./tools.js";
import {
  runToolRunnerToCompletion,
  renderScenarioAsTask,
  AgentLoopError,
  DEFAULT_MODEL,
  DEFAULT_MAX_ITERATIONS,
} from "./agentLoop.js";
import { runCypressSpec, type CypressRunResult } from "../cypress/cypressRunner.js";
import {
  checkAssertionTrace,
  type AssertionTraceResult,
} from "../assertion/assertionTraceChecker.js";
import type { BrowserTools } from "../browser/browserTools.js";
import type { Scenario } from "../scenario/scenarioContract.js";

export const DEFAULT_MAX_SELF_HEAL_ATTEMPTS = 3;

export type SelfHealVerdict =
  | { status: "healed" }
  | { status: "retry"; feedback: string }
  | { status: "exhausted"; feedback: string };

export interface EvaluateSelfHealAttemptInput {
  cypressResult: CypressRunResult;
  assertionTrace: AssertionTraceResult;
  /** 1-based. */
  attempt: number;
  maxAttempts: number;
}

/**
 * The hybrid guardrail (design doc "Anti-gaming guardrails"): a spec must
 * both pass Cypress AND map every Expected Outcome to a .should(...) -
 * Cypress green alone does not satisfy this, since a passing run with a
 * deleted/weakened assertion is exactly what this gate exists to catch. Pure
 * and deterministic, so it's fully unit-testable without a live agent run.
 */
export function evaluateSelfHealAttempt(
  input: EvaluateSelfHealAttemptInput
): SelfHealVerdict {
  const problems: string[] = [];

  if (!input.assertionTrace.ok) {
    problems.push(
      "Assertion-trace check failed: these Expected Outcomes have no matching " +
        ".should(...) anywhere in the spec (a passing Cypress run does not " +
        "satisfy this - add a concrete .should(...) for each, e.g. " +
        ".should((el) => { ... }) for custom logic):\n" +
        input.assertionTrace.unmatched.map((outcome) => `  - ${outcome}`).join("\n")
    );
  }

  if (!input.cypressResult.pass) {
    problems.push(formatCypressFailure(input.cypressResult));
  }

  if (problems.length === 0) {
    return { status: "healed" };
  }

  const feedback = problems.join("\n\n");
  return input.attempt >= input.maxAttempts
    ? { status: "exhausted", feedback }
    : { status: "retry", feedback };
}

/**
 * A Cypress assertion failure's diff can be enormous (e.g. asserting against
 * full page HTML) - and unlike the run_cypress tool's own output, this text
 * becomes the literal next USER TURN on a retry, permanently part of history
 * from then on. Uncapped, a single failure here can be as large as many
 * turns of normal exploration combined (observed on a live run).
 */
const MAX_ERROR_MESSAGE_CHARS = 3000;

function truncateErrorMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_CHARS) return message;
  return (
    `${message.slice(0, MAX_ERROR_MESSAGE_CHARS)}` +
    `...[truncated ${message.length - MAX_ERROR_MESSAGE_CHARS} more characters]`
  );
}

function formatCypressFailure(result: CypressRunResult): string {
  const lines = ["Cypress run failed:"];
  for (const failure of result.specFailures) {
    lines.push(
      `  - [spec] ${failure.specRelativePath || "(whole run)"}: ${truncateErrorMessage(failure.errorMessage)}`
    );
  }
  for (const failure of result.testFailures) {
    lines.push(
      `  - [test] ${failure.title.join(" > ")}: ${truncateErrorMessage(failure.errorMessage)}` +
        (failure.screenshotPath ? ` (screenshot: ${failure.screenshotPath})` : "")
    );
  }
  return lines.join("\n");
}

export interface AttemptRunResult {
  finalMessage: Anthropic.Beta.Messages.BetaMessage;
  messages: Anthropic.Beta.Messages.BetaMessageParam[];
}

export interface DriveSelfHealLoopOptions {
  initialMessages: Anthropic.Beta.Messages.BetaMessageParam[];
  maxAttempts: number;
  runAttempt: (
    messages: Anthropic.Beta.Messages.BetaMessageParam[]
  ) => Promise<AttemptRunResult>;
  /** Reads whatever side-channel state the just-completed attempt's tool calls left behind. */
  evaluateAttempt: (attempt: number) => Promise<SelfHealVerdict>;
  onAttempt?: (attempt: number, verdict: SelfHealVerdict) => void;
}

export interface DriveSelfHealLoopResult {
  attempts: number;
  verdict: SelfHealVerdict;
  finalMessage: Anthropic.Beta.Messages.BetaMessage;
}

/**
 * Generic self-heal loop driver: run an attempt, evaluate it, and either stop
 * (healed/exhausted) or feed the failure back as the next user turn and try
 * again. Takes runAttempt/evaluateAttempt as plain functions rather than
 * constructing the Anthropic client itself, so this control flow - attempt
 * counting, message-history chaining across attempts, stop conditions - is
 * unit-testable against fakes with no live API call, exactly like
 * runToolRunnerToCompletion in agentLoop.ts.
 */
export async function driveSelfHealLoop(
  options: DriveSelfHealLoopOptions
): Promise<DriveSelfHealLoopResult> {
  let messages = options.initialMessages;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    const attemptResult = await options.runAttempt(messages);
    messages = attemptResult.messages;

    const verdict = await options.evaluateAttempt(attempt);
    options.onAttempt?.(attempt, verdict);

    if (verdict.status !== "retry") {
      return { attempts: attempt, verdict, finalMessage: attemptResult.finalMessage };
    }

    messages = [...messages, { role: "user", content: verdict.feedback }];
  }

  throw new AgentLoopError(
    `Self-heal loop ran ${options.maxAttempts} attempt(s) without evaluateAttempt ever ` +
      "returning 'healed' or 'exhausted' - evaluateAttempt must mark the final attempt " +
      "as 'exhausted', not 'retry'."
  );
}

export interface SelfHealLoopOptions {
  scenario: Scenario;
  browser: BrowserTools;
  /** Path to the checked-out target app repo (e.g. cumulocity-ui-e2e). */
  appRepoPath: string;
  /** The target app's own house-rules instructions file, read live. */
  houseRulesPath: string;
  /** c8y-cygen's own prompts/domain-notes.md. */
  domainNotesPath: string;
  model?: string;
  /** Safety net on each attempt's exploration loop (same knob as runGenerationLoop). */
  maxIterationsPerAttempt?: number;
  /** Bound on self-heal attempts, distinct from maxIterationsPerAttempt. */
  maxSelfHealAttempts?: number;
  anthropicApiKey?: string;
  baseUrlForCypress?: string;
  onMessage?: (message: Anthropic.Beta.Messages.BetaMessage) => void;
  onAttempt?: (attempt: number, verdict: SelfHealVerdict) => void;
}

export interface SelfHealResult {
  attempts: number;
  verdict: SelfHealVerdict;
  finalMessage: Anthropic.Beta.Messages.BetaMessage;
  specRelativePath?: string;
  cypressResult?: CypressRunResult;
  assertionTrace?: AssertionTraceResult;
  /** Every stage_fixture proposal from the run - none of these are written to disk yet. */
  stagedFixtures: StagedFixture[];
}

/**
 * The real, Anthropic-API-backed wiring: builds the system prompt and tools
 * once (M4/M5), then drives driveSelfHealLoop with a real runAttempt (one
 * Tool Runner construction per attempt, chaining message history across
 * attempts via runner.params.messages - a completed BetaToolRunner can't be
 * iterated again, see BetaToolRunner.ts) and a real evaluateAttempt that
 * independently re-runs Cypress and re-checks the assertion trace against
 * whatever write_spec actually wrote (via the AgentSessionRecord side
 * channel), rather than trusting the agent's own run_cypress call or its
 * final-turn summary. Integration-only, like runGenerationLoop - not unit
 * tested here (no ANTHROPIC_API_KEY in this environment); driveSelfHealLoop
 * and evaluateSelfHealAttempt carry the tested logic.
 */
export async function runSelfHealLoop(
  options: SelfHealLoopOptions
): Promise<SelfHealResult> {
  const style = options.scenario.style ?? "mocked";
  const maxAttempts = options.maxSelfHealAttempts ?? DEFAULT_MAX_SELF_HEAL_ATTEMPTS;

  const systemPrompt = await assembleSystemPrompt({
    houseRulesPath: options.houseRulesPath,
    domainNotesPath: options.domainNotesPath,
    style,
  });

  const sessionRecord: AgentSessionRecord = { stagedFixtures: [] };
  const tools = buildAgentTools(options.browser, options.appRepoPath, sessionRecord);
  const client = new Anthropic({ apiKey: options.anthropicApiKey });

  let lastCypressResult: CypressRunResult | undefined;
  let lastAssertionTrace: AssertionTraceResult | undefined;

  const runAttempt = async (
    messages: Anthropic.Beta.Messages.BetaMessageParam[]
  ): Promise<AttemptRunResult> => {
    const runner = client.beta.messages.toolRunner({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      max_iterations: options.maxIterationsPerAttempt ?? DEFAULT_MAX_ITERATIONS,
      // cache_control on the last (only) system block caches tools + system
      // together (render order is tools -> system -> messages) - system and
      // tools are identical on every turn and every attempt, so this is a
      // pure win: full price once, ~10% price on every subsequent turn.
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools,
      messages,
    });
    const finalMessage = await runToolRunnerToCompletion(runner, options.onMessage);
    return { finalMessage, messages: runner.params.messages };
  };

  const evaluateAttempt = async (attempt: number): Promise<SelfHealVerdict> => {
    if (
      sessionRecord.lastSpecRelativePath === undefined ||
      sessionRecord.lastSpecContent === undefined
    ) {
      const feedback =
        "You have not called write_spec yet this attempt. Call write_spec with " +
        "the generated Cypress spec before finishing.";
      return attempt >= maxAttempts
        ? { status: "exhausted", feedback }
        : { status: "retry", feedback };
    }

    lastAssertionTrace = checkAssertionTrace(
      options.scenario.expectedOutcomes,
      sessionRecord.lastSpecContent
    );

    const specPath = path.resolve(
      options.appRepoPath,
      sessionRecord.lastSpecRelativePath
    );
    lastCypressResult = await runCypressSpec({
      appRepoPath: options.appRepoPath,
      specPath,
      baseUrl: options.baseUrlForCypress,
    });

    return evaluateSelfHealAttempt({
      cypressResult: lastCypressResult,
      assertionTrace: lastAssertionTrace,
      attempt,
      maxAttempts,
    });
  };

  const initialMessages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: renderScenarioAsTask(options.scenario, style) },
  ];

  const result = await driveSelfHealLoop({
    initialMessages,
    maxAttempts,
    runAttempt,
    evaluateAttempt,
    onAttempt: options.onAttempt,
  });

  return {
    attempts: result.attempts,
    verdict: result.verdict,
    finalMessage: result.finalMessage,
    specRelativePath: sessionRecord.lastSpecRelativePath,
    cypressResult: lastCypressResult,
    assertionTrace: lastAssertionTrace,
    stagedFixtures: sessionRecord.stagedFixtures,
  };
}
