# PRD: c8y-cygen — Agentic generation of Cumulocity Cypress E2E tests

- **Status:** Drafted from the locked design doc (`genarate-tests-with-agent.md`) + team interview.
- **Date:** 2026-07-09
- **Working name:** `c8y-cygen`
- **Home:** a new **subpackage of the `cumulocity-cypress` library** (`packages/c8y-cygen/`, sibling to the existing `packages/pact-runner/`), reusing that repo's build/test tooling and shared auth code. Published under the **Cumulocity-IoT** GitHub org.
- **Companion docs:** `doc/genarate-tests-with-agent.md` (design rationale), `doc/cumulocity-ui-e2e-conventions.md` (house-style scouting report), `cumulocity-ui`'s `e2e-tests.instructions.md` (the verbatim house rules).

---

## Problem Statement

Nobody on the team enjoys writing Cypress E2E tests, so they don't get written. Producing one test today is slow and fiddly in exactly the ways that make it easy to skip:

- **Designing the scenario** means thinking through business requirements, edge cases, and the Cumulocity-specific setup each test needs (create a managed object for a device, post its measurements/alarms/events, wire `beforeEach`/`afterEach`).
- **Implementing it step by step** is slow even with Cypress Studio, because every iteration replays the whole flow from the top (login, navigate, prior steps) before you can see the next step. Waiting on page loads dominates.
- **Adding assertions and intercepts** — intercepting API calls to assert on them or to mock responses (device offline, forced error, pinned measurement value) — is manual and tedious, and Studio is weak here.

The friction is high enough that E2E coverage is routinely skipped. Worse, the slow parts are precisely the parts an LLM-without-eyes cannot do well: they depend on **ground truth about the running application** — the real rendered DOM, the actual `[data-cy]` selectors present, and the real network traffic. Source code alone is insufficient, because rendered output ≠ source.

The developer needs a way to go from an approved, plain-language scenario to a reviewed, green, house-style Cypress spec without hand-writing the tedious middle.

## Solution

A tool, `c8y-cygen`, that turns an **approved scenario** into a **runnable, house-style Cypress spec** — correct selectors, setup/teardown, intercepts, and assertions — by giving an agent a **live browser as its source of ground truth**.

When the feature is complete:

- A developer runs one command against a scenario and comes back to a **green Cypress spec plus a diff to review**. The human stays in the loop at the *cheap* stages (approving a markdown scenario, reading the final diff), not the expensive stage (hand-writing test code).
- The agent explores the real app through a **persistent, authenticated Playwright session**: it reads the accessibility tree, enumerates real `[data-cy]` selectors, walks the scenario against the live app, and captures real Cumulocity REST responses — inspecting **incrementally**, without replaying the flow from the top on every step.
- The shipped artifact is **pure Cypress**. Playwright is the agent's eyes at generation time only — a dev-time dependency of the generator, never in the app's `package.json`, the test suite, or CI. This directly answers "we don't want another test technology."
- Captured REST responses are **frozen into `cy.intercept` + fixtures** as a by-product of exploration, so a mocked test is deterministic and needs no tenant at run time; the developer never hand-builds a mocked device.
- The output is **indistinguishable from a hand-written test** and passes code review on the first read, because the repo's Cypress conventions are injected verbatim as hard constraints.
- After emitting a spec the agent **runs it headless and self-heals to green**, fixing the real cause of failures — with guardrails that stop it from "passing" a test by weakening or deleting an assertion.

The MVP proves the explore→generate→self-heal→diff loop against one known-good oracle flow. Scenario auto-drafting, integration-style output, GitHub/Jira context resolution, and a Claude Code skill adapter are designed here as **roadmap phases** that reuse the same engine.

## User Stories

### Core generation loop (MVP)

1. As a **frontend developer**, I want to point the tool at an approved `*.scenario.md` and get back a green Cypress spec, so that I don't hand-write the tedious middle.
2. As a **developer**, I want the tool to log in to the tenant exactly the way `cumulocity-cypress` does (OAI-Secure), so that explore-time auth matches test-time auth and there is no fragile login-form automation.
3. As a **developer**, I want the agent to read the real rendered DOM and enumerate the actual `[data-cy]` selectors, so that generated selectors are real, not hallucinated.
4. As a **developer**, I want the agent to walk the scenario steps against a single **persistent** browser session, so that it inspects incrementally and I'm not waiting on a full replay per step.
5. As a **developer**, I want the agent to capture the real Cumulocity REST responses it sees during exploration, so that realistic mocks are produced automatically.
6. As a **developer**, I want the generated spec to obey the house rules (selector hierarchy, team tag, `cy.visitAndWaitUntilPageLoad`, no `cy.wait(number)`, no `it.only`, unique names via `Cypress._.now()`, cascade cleanup), so that it passes review on the first read.
7. As a **developer**, I want the tool to run the spec headless and fix real failures until it's green, so that I receive a passing test, not a draft.
8. As a **reviewer**, I want the only code review I do to be the final diff, so that my time goes to judgment, not to line-by-line authoring.

### Output style (prompted per run)

9. As a **developer**, I want the tool to ask me at the start of a run whether I want a **mocked** or **integration** spec, so that I choose deliberately rather than inherit a silent default.
10. As a **developer without run-time tenant access**, I want a **mocked** spec (`cy.intercept` + captured fixtures) that is deterministic and runs with no tenant, so that the test is adoptable team-wide.
11. As a **developer wanting realism**, I want an **integration** spec that does real `cy.request` setup/cleanup against a tenant in `beforeEach`/`afterEach`, so that the test exercises the real API.
12. As a **developer**, I want a scenario to be able to pre-declare its `Style` so the tool skips the prompt when the choice is already made, so that scripted/batch runs aren't blocked on an interactive question.

### Anti-gaming guardrails

13. As a **reviewer**, I want every "Expected Outcome" in the scenario to map to at least one `.should(...)` in the spec or the run to **hard-fail**, so that the agent cannot reach green by dropping assertions.
14. As a **reviewer**, I want the agent to be able to *propose* a change to an assertion's semantics only as a **flagged note for my review**, never silently applied, so that I catch reinterpretations.
15. As a **developer**, I want the scenario's Expected Outcomes treated as immutable inputs passed separately from the code, so that they can't be edited to fit a broken test.

### Auth & exploration safety

16. As a **developer**, I want the explorer to create test data with unique names (`Cypress._.now()`-style) and cascade-delete it after exploration, so that I can safely explore against my own tenant without leaving residue.
17. As a **developer**, I want exploration failures mid-setup to still trigger cleanup (`failOnStatusCode: false` cascade delete), so that a crashed run doesn't leak managed objects.
18. As a **security-conscious developer**, I want the tool to refuse to write captured fixtures until I've explicitly confirmed, so that customer data / PII / internal hostnames from real responses aren't committed unreviewed.
19. As a **developer**, I want tenant credentials and the `ANTHROPIC_API_KEY` to come from env / secret store and never be committed, and the generated spec to use `Cypress.env(...)` per house rules, so that secrets don't leak.

### Scenario contract

20. As a **developer**, I want a fixed structured-markdown scenario format (Objective, Preconditions, Setup, Steps, Expected Outcomes, optional Style), so that hand-written scenarios today are not throwaway when Stage 1 automation lands.
21. As a **developer**, I want the tool to fail clearly if a scenario is missing required sections, so that I fix the input rather than get a confusing generation.

### Failure modes

22. As a **developer**, I want a clear error if OAI-Secure login fails (bad creds, wrong tenant, unreachable base URL), so that I can distinguish an auth problem from a generation problem.
23. As a **developer**, I want a clear message if the app lacks `[data-cy]` coverage for a step, together with the fallback selector the agent chose, so that I know where selector brittleness was introduced and can improve `data-cy` coverage in the app.
24. As a **developer**, I want the self-heal loop to stop after a bounded number of attempts and hand me the last failure (error + screenshot) if it cannot reach green, so that a run terminates instead of looping forever.
25. As a **developer**, I want the run to hard-fail with a list of unmatched Expected Outcomes if the assertion-trace check fails, so that I know exactly which outcome has no assertion.

### Roadmap actors & stories

26. As a **developer**, I want the tool to draft a `*.scenario.md` from a change summary and let me approve/edit it, so that "thinking of scenarios" is also accelerated. *(Roadmap: Stage 1.)*
27. As a **developer**, I want to hand the tool a **PR number** and have it pull the PR (title/body/diff) and the linked Jira ticket (`[MTM-xxxxx]` parsed from the title) as change context, so that I don't assemble context by hand. *(Roadmap: GitHub+Jira REST adapter.)*
28. As a **Claude Code user**, I want to drive the same engine from a Claude Code skill (using the already-available GitHub/Atlassian MCPs for context), so that I don't manage a separate API key. *(Roadmap: skill adapter.)*
29. As a **security-conscious developer**, I want captured fixtures automatically scrubbed/anonymized, so that redaction isn't a manual confirmation step. *(Roadmap: redaction automation.)*
30. As a **developer on a Basic-auth tenant**, I want the explorer to support Basic auth as well as OAI-Secure, so that the tool works against all target environments. *(Roadmap.)*

## Implementation Decisions

### Delivery form & architecture

- **Harness-agnostic engine + standalone Node CLI (primary).** The core engine — auth, browser tools, network capture, fixture freezing, spec writing, Cypress runner, self-heal loop, scenario parsing, change-context resolution, assertion-trace check — is independent of what drives the agent loop. The MVP ships a **standalone Node CLI** driven by the **Anthropic TypeScript SDK Tool Runner** (`client.beta.messages.toolRunner`): it calls the model, executes the tools, feeds results back, and loops until done. No external agent harness.
- **The tool lives as a subpackage of `cumulocity-cypress`** (`packages/c8y-cygen/`, mirroring `packages/pact-runner/`). This is a deliberate simplification over a fully standalone repo: the subpackage **imports the shared OAI-Secure login directly** (`src/shared/oauthlogin.ts`) instead of replicating it, and reuses the library's Jest/`@swc/jest`/`memfs` test harness for the pure modules.
  - *Rationale:* the hard part is the tool surface + engine (a persistent authenticated Playwright session with network capture, the fixture/intercept shaping, the runner, the guardrails) — identical no matter what drives the loop. The loop driver is the thin, swappable part. A standalone CLI is exactly the "one command, walk away, come back to green" UX the adoption goal calls for, and the team confirmed a raw `ANTHROPIC_API_KEY` is obtainable.
- **Claude Code skill adapter is a documented roadmap option**, not the MVP, because the team uses a mix (Claude Code + Copilot) and a CLI works regardless of which assistant a dev prefers. The skill would be a second `AgentLoopDriver` adapter reusing the same engine and tools.
- **MCP delivery form is dropped.** Registry approval feasibility is uncertain and the CLI needs nothing an MCP would provide. Where MCP-style capabilities are useful (GitHub/Jira context), the CLI reaches the underlying **REST APIs directly** with env tokens — the same architectural move already used for Cumulocity auth.
- **Runtime target is the dev laptop** for now. CI-triggered generation is explicitly out of scope (it raises secrets/auth/tenant-write constraints that the MVP does not take on).

### Agent runtime & model

- **Model is a config field.** Start on **`claude-sonnet-4-6`** (adaptive thinking, `effort: high`); escalate to **`claude-opus-4-8`** via a one-line config switch if quality requires. Tune cost/quality empirically.
- **Prompts are authored as markdown files** loaded at init, not inline strings, to keep prompt engineering separate from code.

### Ground truth & exploration

- **The live browser is the backbone.** Video and screenshots-only were rejected: video discards selectors/DOM/network; screenshots are lossy for selector work versus the accessibility tree + `[data-cy]` enumeration.
- **Explore with Playwright, emit Cypress.** Playwright is a **dev-time dependency of the generator only** — never in the app under test, its `package.json`, or CI.
- **Persistent session, incremental inspection.** The agent advances the scenario step-by-step in one browser session and inspects the DOM incrementally rather than replaying from the top.

### Authentication

- **MVP: OAI-Secure only.** The explorer replicates the `cumulocity-cypress` flow in Node: `POST /tenant/oauth/token` with `grant_type=PASSWORD`, capture the auth + `XSRF-TOKEN` cookies, inject them into the Playwright browser context. Explore-time auth is thus identical to test-time auth; no login-form automation.
- **Basic auth** is deferred, added later behind the same `AuthSession` interface.
- Credentials come from env / secret store; the generated spec uses `Cypress.env('username')` / `Cypress.env('password')`.

### Output styles

- **Prompted per run.** At the start of a run the CLI asks **mocked vs integration**. A scenario's optional `Style` field pre-answers the prompt (enables non-interactive/batch runs).
  - **mocked:** explore live, emit `cy.intercept` + captured fixtures. Deterministic, runs with no tenant.
  - **integration:** emit real `cy.request` setup/cleanup against a tenant in `beforeEach`/`afterEach`.

### Anti-gaming guardrails (self-heal)

- **Expected Outcomes are immutable inputs**, passed separately from the code.
- **Hybrid guardrail:**
  - **Assertion-trace check hard-fails** — every Expected Outcome must map to at least one `.should(...)` in the spec, or the run fails even if Cypress is green.
  - **Semantic reinterpretations are soft-flagged** — the agent may *propose* an assertion-semantics change but must emit it as a flagged note for human review; it must never silently apply it.
- **Bounded self-heal** — the loop stops after a fixed attempt budget and returns the last failure (error + screenshot) if it cannot reach green.

### Fixture safety (redaction)

- **Redaction automation is deferred**, but the tool **blocks writing/committing captured fixtures until the human explicitly confirms**. The CLI warns that captured responses may contain customer data / PII / internal hostnames. Automatic scrubbing is a roadmap item.

### Exploration tenant policy

- **Any tenant + unique names + reliable cleanup.** Exploration may create managed objects/measurements against whatever tenant credentials are provided; it uses `Cypress._.now()`-style unique names and cascade-deletes (`?cascade=true`, `failOnStatusCode: false`) in teardown. No dedicated disposable tenant is required. Mocked-style final tests never touch the tenant again.

### House style

- The repo's Cypress conventions (`e2e-tests.instructions.md`: selector hierarchy `[data-cy]` → role/title → element selector, intercept patterns, `cy.request` setup, team tag `{ tags: '@teamName' }`, `cy.visitAndWaitUntilPageLoad` default, cascade cleanup, unique names, no `cy.wait(number)`, no committed `it.only`) are injected **verbatim into the system prompt as hard constraints**, together with the Cumulocity domain context.

### Change context (Stage 0/1)

- **MVP: `.md`-file adapter only.** A `ChangeContextResolver` accepts a change-summary markdown path (e.g. the `c8y-review-guide` output).
- **Roadmap: GitHub+Jira REST adapter.** Accept a PR number, fetch PR title/body/diff via the GitHub REST API (env token or `gh`), parse `[MTM-xxxxx]` from the title, fetch the Jira ticket via the Jira REST API. Same `ChangeContextResolver` interface. In a future skill adapter the same context comes from the available MCPs.

### Cost / caching (deferred optimization)

- Not optimized prematurely. When addressed: prompt-cache the stable prefix (system prompt + house rules + domain doc), keep volatile content (DOM snapshots, network dumps) after the last cache breakpoint, and trim snapshots to the interactive accessibility subtree rather than full HTML.

## Module Design

> Naming is indicative; interfaces are described by responsibility and contract, not signatures.

### ScenarioContract
- **Responsibility:** parse and validate a `*.scenario.md` into a structured object.
- **Interface:** input = scenario markdown; output = `{ objective, preconditions, setup, steps, expectedOutcomes, style? }`. Failure mode: clear error listing missing/malformed required sections. `expectedOutcomes` is surfaced separately so it can be treated as an immutable input downstream.
- **Stability:** the section set is stable (team-wide contract); the parser internals are volatile.
- **Tested:** yes.

### AssertionTraceChecker
- **Responsibility:** enforce the anti-gaming gate — map every Expected Outcome to ≥1 `.should(...)` in the generated spec.
- **Interface:** input = `expectedOutcomes` + spec source; output = `{ ok, unmatched[] }`. `ok = false` → the run hard-fails with the unmatched list.
- **Stability:** interface stable; matching heuristics volatile.
- **Tested:** yes.

### AuthSession
- **Responsibility:** obtain authenticated session cookies for injection into Playwright.
- **Interface:** input = base URL + credentials; output = `{ authCookies, xsrfToken }`. MVP is a thin wrapper that **reuses `cumulocity-cypress`'s shared `oauthLogin`** (subpackage import, not a reimplementation) and hands the resulting cookies to the Playwright context; Basic auth is a later implementation behind the same interface, riding on the shared layer's existing multi-auth support. Failure mode: distinct error for bad creds / wrong tenant / unreachable base URL.
- **Stability:** interface stable; auth-flow implementations grow.
- **Tested:** yes.

### NetworkCapture → FixtureFreezer
- **Responsibility:** capture matching request/response pairs during exploration and shape them into `cy.intercept` declarations + fixture JSON; enforce the redaction/confirm gate before anything is written.
- **Interface:** `capture(pattern) → RequestResponse[]`; `freeze(name, json) → path`, which **refuses to write until human-confirmed** (MVP) and is the seam where automatic redaction lands later.
- **Stability:** capture/shape interface stable; redaction internals volatile.
- **Tested:** yes (the intercept/fixture shaping and the confirm-gate behavior are deterministic).

### ChangeContextResolver
- **Responsibility:** produce change context for scenario drafting from a configurable source.
- **Interface:** `resolve(source) → ChangeContext`. MVP ships the `.md`-file adapter; GitHub+Jira REST adapter is roadmap; both satisfy one interface.
- **Stability:** interface stable; adapters added over time.
- **Tested:** yes (md-file adapter parsing).

### CypressRunner
- **Responsibility:** run a spec headless and report the outcome for the self-heal loop.
- **Interface:** `run(spec) → { pass, failures, screenshotPath }`.
- **Stability:** interface stable; output parsing volatile with Cypress versions.
- **Tested:** yes (the run-output parsing).

### BrowserTools
- **Responsibility:** expose the agent's eyes and hands over a persistent, authenticated Playwright session.
- **Interface:** the agent tool surface — `browser_navigate(path)`, `browser_snapshot()` (trimmed accessibility tree), `list_data_cy()`, `browser_click/type(...)`, `capture_network(pattern)`. Hides Playwright and cookie injection.
- **Stability:** persistent-session + a11y-snapshot contract stable; the set of tools may grow.
- **Tested:** no for MVP (browser-bound integration). *Note:* the snapshot-trimming and `list_data_cy` extraction logic are testable against the static HTML apps already in `cumulocity-cypress` `test/cypress/app/` — captured as a roadmap test opportunity, not MVP.

### PromptAssembly
- **Responsibility:** assemble the system prompt — house rules + conventions + domain doc, verbatim — as the stable (later cacheable) prefix, plus the style branch (mocked/integration).
- **Interface:** inputs = rule/domain markdown files + style; output = system prompt.
- **Tested:** no (thin wiring).

### AgentLoopDriver
- **Responsibility:** drive the agentic loop over the tools.
- **Interface:** `run(tools, systemPrompt, model)`. MVP adapter = Anthropic SDK Tool Runner; future adapter = Claude Code skill.
- **Stability:** deliberately thin/swappable.
- **Tested:** no (integration).

### CLI
- **Responsibility:** parse flags, run the mocked/integration prompt, orchestrate the pipeline, surface errors and the final diff.
- **Interface:** command + flags (scenario path, base URL, model override, style override, etc.).
- **Tested:** no (thin; exercised via the end-to-end oracle path manually).

## Testing Decisions

- **Test external behaviour, not implementation.** Good tests here assert on the contract of the pure modules: a scenario parses into the right structure and rejects malformed input; the assertion-trace check flags exactly the unmatched Expected Outcomes; the fixture freezer refuses to write before confirmation and shapes captured responses into valid intercept/fixture pairs; OAI-Secure auth produces the expected cookies (HTTP mocked) and raises distinct errors on failure; the md change-context adapter extracts the right fields; the Cypress runner parses pass/fail/screenshot correctly from real runner output.
- **Modules with tests written (MVP):** `ScenarioContract`, `AssertionTraceChecker`, `FixtureFreezer` (incl. redaction/confirm gate), `AuthSession`, `ChangeContextResolver`, `CypressRunner` output parser.
- **Not unit-tested in MVP:** `BrowserTools`, `PromptAssembly`, `AgentLoopDriver`, `CLI` (browser-bound / thin wiring). `BrowserTools` extraction logic against `test/cypress/app/` static HTML is a roadmap test.
- **The oracle is the integration signal, not a unit test.** Success of the MVP is the agent reproducing (or improving on) the hand-written `cumulocity-ui` `events.cy.ts` device→event→timeline flow end to end, diffed against the oracle. This is a slow, tenant-touching check run manually/CI-gated, not part of the fast unit suite.
- **Prior art / references in the codebase:**
  - `cumulocity-cypress` `src/shared/oauthlogin.ts` + `oauthlogin.spec.ts` — reference for `AuthSession` and how its auth is tested.
  - `cumulocity-cypress` Jest setup (`jest.config.mjs`, `@swc/jest`, `memfs`) — the unit-test harness the pure modules should use; `memfs` is a fit for `FixtureFreezer` filesystem behavior.
  - `cumulocity-ui` `cypress/e2e/dataAndControlTeam/events.cy.ts` — the oracle and a model of house-style output.
  - `test/cypress/app/*.html` — static pages usable for `BrowserTools` extraction tests later.

## Out of Scope

- **CI-triggered generation.** MVP runs on a dev laptop only; no unattended CI runs, and the secrets/tenant-write posture that would require is not taken on.
- **Component-test generation.** E2E only for now (component tests are a plausible later direction, explicitly not in this PRD).
- **Cross-framework output.** Cypress only; no Playwright/other test artifacts are emitted.
- **MCP delivery form.** Dropped; not designed for.
- **Basic auth** and any non-OAI-Secure flow in the explorer (roadmap).
- **Automatic fixture redaction/anonymization** (roadmap; MVP gates on human confirmation instead).
- **GitHub/Jira PR-context resolution** (roadmap; MVP takes an `.md` change summary).
- **A Claude Code skill adapter** (roadmap; MVP is the standalone CLI).
- **Integration-style as the proof-of-loop.** The MVP proves the loop with a **mocked** oracle; integration output is supported (prompted) but the oracle diff target is the mocked path.
- **Replacing developer judgment on *what* to test**, and **generating tests with no human review** — both explicit non-goals.
- **Prompt caching / cost optimization** — deferred to a late step.
- **Auto-drafting scenarios (Stage 1 automation)** as MVP work — the scenario *contract* is fixed now, but drafting is a roadmap phase.

## Open Questions

1. **`data-cy` coverage gaps.** The tool relies on good `[data-cy]` coverage; gaps force brittle fallbacks. *Owner: UI team.* Resolution: measure coverage on the oracle flow during MVP; surface a "selector fallback used here" report; feed gaps back as `cumulocity-ui` improvements.
2. **Redaction policy specifics.** What exactly counts as sensitive (PII fields, hostnames, tenant IDs), and what the confirm-gate must highlight. *Owner: security-minded reviewer + team.* Resolution: define a redaction spec before the roadmap automation phase; MVP surfaces raw captured content for human confirmation.
3. **MCP registry feasibility** for a future skill/context path. *Owner: whoever owns the c8y MCP registry relationship.* Resolution: not blocking — CLI uses direct REST; revisit only if the skill adapter wants MCP context.
4. **Cost / latency at scale.** Agentic runs with many snapshots are token-heavy. *Owner: tool maintainer.* Resolution: measure on the oracle before scaling; then apply caching + snapshot trimming + Sonnet-first.
5. **Is soft-flagging assertion-semantics changes strict enough** once real usage is observed, or should some reinterpretations hard-fail? *Owner: reviewers.* Resolution: start hybrid (trace-check hard-fails, semantics flagged); tighten if agents exploit the soft path.
6. **Scenario `Style` vs prompted style precedence** edge cases (e.g. scenario says mocked but the flow can't be mocked cleanly). *Owner: tool maintainer.* Resolution: scenario `Style` pre-answers the prompt; if generation reveals it's infeasible, emit a flagged note rather than silently switching.

## Further Notes

- **Pipeline & human-in-the-loop.** Stage 0 (change summary) is assumed to exist and is a prerequisite, produced independently of the test-gen decision (e.g. via `c8y-review-guide`). Stage 1 (scenario draft → `*.scenario.md`, human approves) is roadmap. Stage 2 (explore + generate) and Stage 3 (self-heal to green) are the automated middle. Human review sits at Stage 1 (approve markdown) and the final diff — both cheap.
- **Scenario contract format (fixed now):** Objective, Preconditions, Setup (devices/measurements/alarms/events to create), Steps (user workflow), Expected Outcomes (immutable assertions), Style (optional; `mocked | integration`).
- **First slice / MVP build order:** M0 scaffold the `packages/c8y-cygen/` subpackage (reuse the repo's build/test tooling) + freeze the `events.cy.ts` oracle and hand-write `events.scenario.md` → M1 `AuthSession` (thin wrapper over the shared `oauthLogin`) with cookie injection → M2 `BrowserTools` (navigate, snapshot, list_data_cy) → M3 `ScenarioContract` → M4 first vertical slice (PromptAssembly + Tool Runner loop on `claude-sonnet-4-6` + `write_spec` + `CypressRunner`) → M5 `NetworkCapture`/`FixtureFreezer` + redaction gate (mocked path) → M6 self-heal loop + `AssertionTraceChecker` → M7 CLI + oracle proof: emit a **mocked** spec, self-heal to green, diff against the hand-written `events.cy.ts` oracle. Success = the agent reproduces or improves on the oracle end to end. M8 (stretch, post-loop): drive PR-12400 (quick-links preview) as the first genuinely-new-coverage scenario — validation only, not an MVP gate.
- **Cumulocity-specific gotchas the generator must respect** (from the conventions report): `cy.visitAndWaitUntilPageLoad` by default (20s page-load wait); pact recordings are component-only (never emit pact syntax in E2E); cascade delete needs `failOnStatusCode: false`; team tags are mandatory; `cy.request()` is overwritten to auto-inject C8y auth (don't pass tokens manually); event timestamps must be `YYYY-MM-DDTHH:mm:ssZ`; `Cypress._.now()` is millisecond-based and repeats within a run.
- **References / prior art:** `cumulocity-cypress` (OAI-Secure auth + C8y test helpers — build on, don't re-implement); `@c8y/ngx-components` / Cumulocity Codex (component & design-system context); `cumulocity-ui` E2E tests (house style + oracle).
