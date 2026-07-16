/// <reference types="cypress" />
import { createRequire } from "node:module";
import path from "node:path";

type CypressRunFn = (
  options: Record<string, unknown>
) => Promise<
  CypressCommandLine.CypressRunResult | CypressCommandLine.CypressFailedRunResult
>;

/**
 * cypress is a devDependency of c8y-cygen purely for these type declarations
 * (CypressCommandLine, a global ambient namespace - scoped to this file via
 * the triple-slash reference above, not the project-wide tsconfig, since it
 * would otherwise collide with Jest's own global describe/it/expect) and for
 * local verification against a real Cypress run (test/fixtures/cypress-sample).
 * runCypressSpec below never imports it directly - it always resolves and
 * runs the TARGET APP's own installed Cypress.
 */

export interface CypressTestFailure {
  title: string[];
  errorMessage: string;
  screenshotPath?: string;
}

export interface CypressSpecFailure {
  specRelativePath: string;
  errorMessage: string;
}

export interface CypressRunResult {
  pass: boolean;
  testFailures: CypressTestFailure[];
  specFailures: CypressSpecFailure[];
}

export class CypressRunnerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CypressRunnerError";
  }
}

export interface RunCypressSpecOptions {
  /** Path to the checked-out target app repo whose own Cypress installation and config are used. */
  appRepoPath: string;
  /** Absolute or app-repo-relative path to the spec to run. */
  specPath: string;
  baseUrl?: string;
  env?: Record<string, string>;
}

/**
 * Shells into the target app's own installed Cypress - never a bundled one -
 * so the generated spec runs with the app's real cy.login, custom commands,
 * fixtures, and cypress.config.ts.
 */
export async function runCypressSpec(
  options: RunCypressSpecOptions
): Promise<CypressRunResult> {
  const appRepoPath = path.resolve(options.appRepoPath);
  const requireFromAppRepo = createRequire(path.join(appRepoPath, "package.json"));

  let cypressModulePath: string;
  try {
    cypressModulePath = requireFromAppRepo.resolve("cypress");
  } catch {
    throw new CypressRunnerError(
      `Could not resolve a "cypress" installation inside ${appRepoPath}. ` +
        `CypressRunner runs the target app's own Cypress, not a bundled one - ` +
        `run "npm install" in the app repo first.`
    );
  }

  const cypressModule = (await import(cypressModulePath)) as {
    run?: CypressRunFn;
    default?: { run: CypressRunFn };
  };
  const run = cypressModule.run ?? cypressModule.default?.run;
  if (!run) {
    throw new CypressRunnerError(
      `Resolved a "cypress" module at ${cypressModulePath} but it has no run() export.`
    );
  }

  const result = await run({
    project: appRepoPath,
    spec: options.specPath,
    config: options.baseUrl ? { baseUrl: options.baseUrl } : undefined,
    env: options.env,
  });

  return parseCypressRunResult(result);
}

/**
 * Pure parser - deliberately separated from runCypressSpec so it can be unit
 * tested against real captured cypress.run() output without spawning a real
 * Cypress process on every test run.
 */
export function parseCypressRunResult(
  result:
    | CypressCommandLine.CypressRunResult
    | CypressCommandLine.CypressFailedRunResult
): CypressRunResult {
  if (isFailedRunResult(result)) {
    return {
      pass: false,
      testFailures: [],
      specFailures: [{ specRelativePath: "", errorMessage: result.message }],
    };
  }

  const testFailures: CypressTestFailure[] = [];
  const specFailures: CypressSpecFailure[] = [];

  for (const run of result.runs) {
    if (run.error) {
      specFailures.push({
        specRelativePath: run.spec.relative,
        errorMessage: run.error,
      });
      continue;
    }
    for (const test of run.tests) {
      if (test.state !== "failed") continue;
      testFailures.push({
        title: test.title,
        errorMessage:
          test.displayError ?? "Cypress reported a failure with no error message.",
        screenshotPath: findScreenshotForTest(run.screenshots, test.title),
      });
    }
  }

  return {
    pass: result.totalFailed === 0 && specFailures.length === 0,
    testFailures,
    specFailures,
  };
}

function isFailedRunResult(
  result:
    | CypressCommandLine.CypressRunResult
    | CypressCommandLine.CypressFailedRunResult
): result is CypressCommandLine.CypressFailedRunResult {
  return (result as CypressCommandLine.CypressFailedRunResult).status === "failed";
}

/**
 * Cypress names auto-captured failure screenshots "<describe> -- <it> (failed).png"
 * (screenshotOnRunFailure) - there's no direct id linking a screenshot to a test.
 */
function findScreenshotForTest(
  screenshots: CypressCommandLine.ScreenshotInformation[],
  title: string[]
): string | undefined {
  const joined = title.join(" -- ");
  return screenshots.find((s) => path.basename(s.path).startsWith(joined))?.path;
}
