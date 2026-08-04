#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as readline from "node:readline/promises";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import {
  parseScenario,
  ScenarioParseError,
  type ScenarioStyle,
} from "./scenario/scenarioContract.js";
import { createAuthSession, AuthSessionError } from "./auth/authSession.js";
import { launchBrowserSession } from "./browser/browserTools.js";
import {
  runSelfHealLoop,
  DEFAULT_MAX_SELF_HEAL_ATTEMPTS,
  type SelfHealVerdict,
} from "./agent/selfHeal.js";
import { DEFAULT_MODEL, DEFAULT_MAX_ITERATIONS } from "./agent/agentLoop.js";
import { freezeFixture } from "./fixture/fixtureFreezer.js";
import type { StagedFixture } from "./agent/tools.js";

/** cumulocity-ui-e2e's own convention; .github/instructions/* symlinks to .claude/rules/*. */
const DEFAULT_HOUSE_RULES_RELATIVE = ".github/instructions/e2e-tests.instructions.md";
/**
 * __dirname (this file compiles to CJS - no "type": "module" in package.json)
 * points at wherever this file actually lives (dist/ when installed, src/ when
 * run via `tsx`) - either way prompts/ is a sibling directory, so this must
 * NOT be resolved relative to process.cwd(), which is the caller's directory,
 * not this package's.
 */
const DEFAULT_DOMAIN_NOTES_PATH = path.resolve(__dirname, "../prompts/domain-notes.md");

function parseArgs(argv: string[]) {
  return yargs(hideBin(argv))
    .scriptName("c8y-cygen")
    .usage(
      "$0 --scenario <path> --app-repo <path> --base-url <url> [options]\n\n" +
        "Explores a live Cumulocity app and generates a house-style Cypress E2E spec " +
        "from a *.scenario.md, self-healing to green before it's done."
    )
    .options({
      scenario: {
        type: "string",
        demandOption: true,
        describe: "Path to a *.scenario.md file (the fixed scenario contract).",
      },
      "app-repo": {
        type: "string",
        demandOption: true,
        describe: "Path to the checked-out target app repo, e.g. a cumulocity-ui-e2e checkout.",
      },
      "base-url": {
        type: "string",
        demandOption: true,
        describe: "Cumulocity tenant base URL, e.g. https://mytenant.eu-latest.cumulocity.com",
      },
      username: {
        type: "string",
        default: process.env.C8Y_USERNAME,
        describe: "Falls back to $C8Y_USERNAME. Never hardcode this in a script.",
      },
      password: {
        type: "string",
        default: process.env.C8Y_PASSWORD,
        describe: "Falls back to $C8Y_PASSWORD. Never hardcode this in a script.",
      },
      tenant: {
        type: "string",
        default: process.env.C8Y_TENANT,
        describe: "Explicit tenant id, if the base URL's tenant differs from the login tenant.",
      },
      tfa: { type: "string", describe: "TOTP code, if the account requires 2FA." },
      "house-rules": {
        type: "string",
        describe: `Defaults to <app-repo>/${DEFAULT_HOUSE_RULES_RELATIVE}.`,
      },
      "domain-notes": {
        type: "string",
        default: DEFAULT_DOMAIN_NOTES_PATH,
        describe: "c8y-cygen's own Cumulocity domain cheat sheet.",
      },
      style: {
        choices: ["mocked", "integration"] as const,
        describe:
          "Overrides/pre-answers the scenario's own Style field - skips the interactive prompt.",
      },
      model: { type: "string", default: DEFAULT_MODEL },
      "max-iterations": {
        type: "number",
        default: DEFAULT_MAX_ITERATIONS,
        describe: "Per-attempt exploration safety net (tool-call turns).",
      },
      "max-self-heal-attempts": {
        type: "number",
        default: DEFAULT_MAX_SELF_HEAL_ATTEMPTS,
      },
      headless: { type: "boolean", default: true },
      oracle: {
        type: "string",
        describe: "Diff the generated spec against this file once the run finishes.",
      },
      "anthropic-api-key": {
        type: "string",
        default: process.env.ANTHROPIC_API_KEY,
        describe: "Falls back to $ANTHROPIC_API_KEY.",
      },
    })
    .strict()
    .help()
    .parseSync();
}

async function resolveStyle(
  cliStyle: ScenarioStyle | undefined,
  scenarioStyle: ScenarioStyle | null
): Promise<ScenarioStyle> {
  if (cliStyle) return cliStyle;
  if (scenarioStyle) return scenarioStyle;

  if (!process.stdin.isTTY) {
    throw new Error(
      "No --style given, the scenario has no Style field, and this is not an " +
        'interactive terminal. Pass --style mocked|integration, or add a "## Style" ' +
        "section to the scenario."
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("Style for this run - mocked or integration? [mocked]: "))
      .trim()
      .toLowerCase();
    if (answer === "" || answer === "mocked") return "mocked";
    if (answer === "integration") return "integration";
    throw new Error(`Unrecognized style "${answer}" - expected "mocked" or "integration".`);
  } finally {
    rl.close();
  }
}

/**
 * freezeFixture() is deliberately unreachable from the agent (see tools.ts) -
 * this is the one place it's ever called, and only after a human has seen the
 * raw content and explicitly said yes. Non-interactive runs never auto-freeze
 * anything; a skipped fixture leaves its cy.intercept referencing a file that
 * doesn't exist yet, which is a visible, honest failure rather than a silent
 * write of unreviewed captured data.
 */
async function confirmAndFreezeFixtures(
  stagedFixtures: StagedFixture[],
  appRepoPath: string
): Promise<void> {
  if (stagedFixtures.length === 0) return;

  console.log(
    `\n${stagedFixtures.length} fixture(s) were staged during this run. None have been ` +
      "written yet - captured responses may contain customer data, PII, or internal " +
      "hostnames. Review each before freezing.\n"
  );

  const interactive = Boolean(process.stdin.isTTY);
  const rl = interactive
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    for (const fixture of stagedFixtures) {
      console.log(`--- cypress/fixtures/${fixture.relativePath} ---`);
      console.log(fixture.interceptSnippet);
      console.log(JSON.stringify(fixture.content, null, 2));

      if (!rl) {
        console.log("SKIPPED (non-interactive) - freeze manually if this is safe to commit.\n");
        continue;
      }

      const answer = (await rl.question("Freeze this fixture? [y/N]: ")).trim().toLowerCase();
      if (answer === "y" || answer === "yes") {
        const result = await freezeFixture({
          appRepoPath,
          relativePath: fixture.relativePath,
          content: fixture.content,
          confirmed: true,
        });
        console.log(`Wrote ${result.absolutePath}\n`);
      } else {
        console.log(
          `Skipped - cypress/fixtures/${fixture.relativePath} was NOT written; the spec's ` +
            "cy.intercept referencing it will fail until you freeze it.\n"
        );
      }
    }
  } finally {
    rl?.close();
  }
}

/** `diff` exits 1 when the inputs differ - that's the normal case here, not a real failure. */
function printDiffAgainstOracle(specAbsolutePath: string, oracleAbsolutePath: string): void {
  console.log(`\n--- diff: generated spec vs oracle (${oracleAbsolutePath}) ---`);
  try {
    const diffOutput = execFileSync("diff", ["-u", oracleAbsolutePath, specAbsolutePath], {
      encoding: "utf-8",
    });
    console.log(diffOutput || "(no differences)");
  } catch (error) {
    const execError = error as { status?: number; stdout?: string };
    if (execError.status === 1 && typeof execError.stdout === "string") {
      console.log(execError.stdout || "(no differences)");
    } else {
      throw error;
    }
  }
}

function reportVerdict(verdict: SelfHealVerdict, attempts: number, specRelativePath?: string): void {
  if (verdict.status === "healed") {
    console.log(`\nHealed after ${attempts} attempt(s): ${specRelativePath}`);
    process.exitCode = 0;
    return;
  }
  console.error(`\nExhausted after ${attempts} attempt(s) without reaching green:\n${verdict.feedback}`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const scenarioMarkdown = readFileSync(path.resolve(args.scenario), "utf-8");
  let scenario;
  try {
    scenario = parseScenario(scenarioMarkdown);
  } catch (error) {
    if (error instanceof ScenarioParseError) {
      console.error(`Invalid scenario at ${args.scenario}:\n${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const style = await resolveStyle(args.style, scenario.style);
  const resolvedScenario = { ...scenario, style };

  const appRepoPath = path.resolve(args["app-repo"]);
  const houseRulesPath = args["house-rules"]
    ? path.resolve(args["house-rules"])
    : path.resolve(appRepoPath, DEFAULT_HOUSE_RULES_RELATIVE);

  let authSession;
  try {
    authSession = await createAuthSession(args["base-url"], {
      user: args.username ?? "",
      password: args.password ?? "",
      tenant: args.tenant,
      tfa: args.tfa,
    });
  } catch (error) {
    if (error instanceof AuthSessionError) {
      console.error(`Login failed (${error.reason}): ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const browser = await launchBrowserSession({
    baseUrl: args["base-url"],
    authSession,
    headless: args.headless,
  });

  try {
    console.log(
      `Generating a ${style} spec for "${scenario.title ?? "(untitled scenario)"}"...\n`
    );

    const result = await runSelfHealLoop({
      scenario: resolvedScenario,
      browser,
      appRepoPath,
      houseRulesPath,
      domainNotesPath: path.resolve(args["domain-notes"]),
      model: args.model,
      maxIterationsPerAttempt: args["max-iterations"],
      maxSelfHealAttempts: args["max-self-heal-attempts"],
      anthropicApiKey: args["anthropic-api-key"],
      baseUrlForCypress: args["base-url"],
      onMessage: (message) => {
        const usage = message.usage;
        console.log(
          `  [turn] stop_reason=${message.stop_reason} ` +
            `input_tokens=${usage.input_tokens} output_tokens=${usage.output_tokens} ` +
            `cache_read=${usage.cache_read_input_tokens ?? 0} cache_creation=${usage.cache_creation_input_tokens ?? 0}`
        );
      },
      onAttempt: (attempt, verdict) => {
        console.log(`\n--- attempt ${attempt}: ${verdict.status} ---`);
        if (verdict.status !== "healed") console.log(verdict.feedback);
      },
    });

    await confirmAndFreezeFixtures(result.stagedFixtures, appRepoPath);

    if (result.specRelativePath && args.oracle) {
      printDiffAgainstOracle(
        path.resolve(appRepoPath, result.specRelativePath),
        path.resolve(args.oracle)
      );
    }

    reportVerdict(result.verdict, result.attempts, result.specRelativePath);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
