# c8y-cygen

Agentic generator of Cumulocity Cypress E2E specs. Explores a live, authenticated
Cumulocity app with Playwright, captures real selectors and network traffic, and emits
a house-style Cypress spec — then runs it headless and self-heals to green.

See `../../doc/PRD-c8y-cygen.md` and `../../doc/genarate-tests-with-agent.md` for the
full design and rationale. This package is the MVP build described there.

## Status

All milestones M0–M7 are implemented: auth, browser exploration, scenario parsing,
prompt assembly + Tool Runner loop, fixture capture/freeze with a redaction-confirm
gate, the bounded self-heal loop with the assertion-trace hard gate, and the `c8y-cygen`
CLI below. The one thing not yet done in this environment is the live run: driving the
CLI against a real tenant and a real `ANTHROPIC_API_KEY` to confirm the agent actually
reproduces or improves on the frozen oracle end to end (PRD "First slice" - the MVP's
real definition of done). Everything short of that live call has real (non-mocked)
verification - see each module's `.spec.ts` and the milestone history.

## Usage

```bash
npx tsx src/cli.ts \
  --scenario test/oracle/events.scenario.md \
  --app-repo /path/to/cumulocity-ui-e2e \
  --base-url https://mytenant.eu-latest.cumulocity.com \
  --username "$C8Y_USERNAME" --password "$C8Y_PASSWORD" \
  --oracle test/oracle/events.cy.oracle.ts
```

`--style` is optional if the scenario has its own `Style` field (as the oracle scenario
does); otherwise it's prompted for interactively, or required via the flag when running
non-interactively. Captured fixtures are never written without an explicit `y` at the
confirm prompt this CLI shows after the run - see "Fixture safety" in the PRD.

## Architecture at a glance

- **Playwright is a dev-time dependency of this generator only.** It explores the live
  app; it never appears in the target app's `package.json`, test suite, or CI. The
  shipped artifact is pure Cypress.
- **The target application is external, passed by path.** This package does not bundle
  its own Cypress project. `CypressRunner` shells out to the *target app repo's own*
  installed Cypress (e.g. a `cumulocity-ui-e2e` checkout) to run generated specs, so
  generated tests get the app's real `cy.login`, `cy.createDevice`, fixtures, and
  `cypress.config.ts` for free.
- **House rules are read live, not vendored.** The target app's own
  `e2e-tests.instructions.md` (or equivalent) is loaded at runtime from the app-repo
  path and injected verbatim into the system prompt, so it can never drift from what
  the app actually enforces. `prompts/domain-notes.md` in *this* package is a separate,
  generator-owned cheat sheet of Cumulocity-specific gotchas (curated once, versioned
  with this tool).

## Local development

This package depends on `cumulocity-cypress` (the parent library) as a normal npm
dependency. To develop against local, unpublished changes to the parent library,
mirror the `packages/pact-runner` workflow:

```bash
# from the repo root
npm run yalc:publish
# then, from packages/c8y-cygen
npm run package:dev
```

## Directory layout

```
src/            generator source (M1+)
prompts/        generator-owned prompt assets (domain-notes.md, etc.)
test/oracle/    frozen MVP proof-of-loop fixtures — see below
```

## The MVP oracle

The MVP's definition of done (PRD §"First slice") is: given
`test/oracle/events.scenario.md`, the generator produces a green, mocked Cypress spec
for the same flow that reproduces or improves on the hand-written test frozen at
`test/oracle/events.cy.oracle.ts`.

- **Source of the oracle:** `cumulocity-ui-e2e/cypress/e2e/dataAndControlTeam/events.cy.ts`,
  the `'Verify the event for a device shows respective event details'` test
  (lines 75–114 as of 2026-07-13).
- **`events.cy.oracle.ts`** is a frozen, read-only reference copy — it is never executed
  from this package. It exists purely as the diff target for M7.
- **`events.scenario.md`** is a hand-written scenario in the fixed contract format
  (PRD §7) describing that same flow, style-neutral (works for either `mocked` or
  `integration`), used as the input to the generator.
