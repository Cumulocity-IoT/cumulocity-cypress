import { readFile } from "node:fs/promises";
import type { ScenarioStyle } from "../scenario/scenarioContract.js";

export interface PromptAssemblyOptions {
  /**
   * Path to the TARGET APP's own house-rules instructions file (e.g.
   * cumulocity-ui-e2e's e2e-tests.instructions.md). Read live, every run -
   * never vendored into c8y-cygen - so it can never drift from what the app
   * actually enforces.
   */
  houseRulesPath: string;
  /** c8y-cygen's own bundled cheat sheet: prompts/domain-notes.md. */
  domainNotesPath: string;
  style: ScenarioStyle;
}

const ROLE_PREAMBLE = `You are an agent that turns an approved test scenario into a house-style
Cypress E2E spec for a Cumulocity IoT application.

You explore the REAL, LIVE, authenticated application through a persistent
browser session - the tools below are your eyes and hands. Use them to
discover the actual rendered DOM, the real [data-cy] selectors present, and
the real network traffic, rather than guessing. Advance the scenario's Steps
one at a time in this one session; you do not need to replay from the top
between steps.

When you have walked the scenario and understand what the real app does,
write a Cypress spec with write_spec, then verify it with run_cypress. Fix
real causes of failure (selector, timing, setup) - do not reach green by
weakening or deleting an assertion. The scenario's Expected Outcomes below
are immutable: every one of them must be verifiable by a concrete assertion
in the spec you write. If you believe an Expected Outcome's assertion should
be reinterpreted, say so explicitly as a flagged note in your final response
for a human to review - never silently change what it checks.

Concretely: every Expected Outcome must be covered by at least one
.should(...) call (use .should((el) => { ... }) for custom logic, e.g. a
date-diff check - not .invoke('text').then(text => expect(...))). This is
checked mechanically after you finish, together with a real Cypress run of
the spec you wrote. If any Expected Outcome has no matching .should(...), or
the run fails, you will be told exactly what's missing/failing and asked to
fix it and try again, up to a bounded number of attempts - a Cypress-green
run alone does not satisfy this check.

write_spec and run_cypress are for producing and verifying your one real
spec - not a scratch REPL. Do not write throwaway "probe"/"dump" specs whose
only purpose is a deliberately-failing assertion that leaks a value through
the error diff (e.g. asserting a DOM string or an id against a sentinel that
can never match) - each such run costs a full Cypress/Electron process and
real tenant writes for something answered instantly otherwise. If you need to
know what a custom command (cy.createDevice, cy.getDeviceIdByName, ...)
returns or how it behaves, use read_file on cypress/support/commands.ts (or
another existing spec) to see its real implementation. If you need a DOM
value or selector, use browser_snapshot/list_data_cy on the live page you
already have open - it is faster and does not touch the tenant.`;

const MOCKED_STYLE_INSTRUCTIONS = `Emit a MOCKED spec: use capture_network during exploration to observe the
real request/response shapes, then emit cy.intercept(...) plus fixture data
shaped like what you observed, instead of hitting the real backend. The
resulting spec must be deterministic and runnable with no tenant access at
test time. Prefer existing house-style intercept helpers (e.g.
createMockedDevice) over hand-built mocks when the target app already has
them.`;

const INTEGRATION_STYLE_INSTRUCTIONS = `Emit an INTEGRATION spec: use real setup/cleanup against the tenant (e.g.
cy.createDevice, cy.request) in beforeEach/afterEach, following the house
rules' cleanup conventions exactly (unique names, cascade delete with
failOnStatusCode: false). Do not use cy.intercept to fake backend behavior -
the point of this style is to exercise the real API.`;

export async function assembleSystemPrompt(
  options: PromptAssemblyOptions
): Promise<string> {
  const [houseRules, domainNotes] = await Promise.all([
    readFile(options.houseRulesPath, "utf-8"),
    readFile(options.domainNotesPath, "utf-8"),
  ]);

  const styleInstructions =
    options.style === "mocked"
      ? MOCKED_STYLE_INSTRUCTIONS
      : INTEGRATION_STYLE_INSTRUCTIONS;

  return [
    ROLE_PREAMBLE,
    "## House rules (verbatim from the target app - hard constraints)",
    houseRules.trim(),
    "## Cumulocity domain notes",
    domainNotes.trim(),
    `## Output style: ${options.style}`,
    styleInstructions,
  ].join("\n\n");
}
