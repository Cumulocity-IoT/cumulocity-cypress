# ADR-0001: Agentic generation of Cumulocity Cypress E2E tests

- **Status:** Proposed (design locked for a first slice; not yet built)
- **Date:** 2026-06-27
- **Audience:** Frontend developers, QA, and reviewing agents
- **Working name:** `c8y-cygen`
- **Intended home:** new tool inside / alongside a `cumulocity-ui`-based repo, published under the **Cumulocity-IOT** GitHub org (originally prototyped standalone against a small `test-app`).

> This document is written to be read cold. It captures the problem, the options we
> weighed, the decisions we made, and *why*, plus the open questions we want the team
> and a second reviewing agent to challenge before we commit engineering time.

---

## 1. Context & problem

Nobody on the team enjoys writing Cypress E2E tests, so they don't get written. The
work is slow and fiddly, and the slow parts are exactly the parts an LLM-without-eyes
cannot do well. Writing one test today means:

1. **Designing scenarios** — thinking through business requirements, technical detail,
   edge cases, and the **Cumulocity-specific setup** each test needs (e.g. create a
   managed object representing a device, post measurements/alarms/events it emitted,
   wire `beforeEach`/`afterEach` for setup and teardown).
2. **Implementing step by step** — slow even with Cypress Studio, because every
   iteration replays the whole flow from the top (login, navigate, prior steps) before
   you can see the next one. Waiting on page loads dominates.
3. **Adding assertions and intercepts** — Studio is weak here. Intercepting API calls to
   assert on them, or to **modify responses** (mock a device offline, force an error,
   pin a measurement value), is manual and tedious.

The friction is high enough that E2E coverage is routinely skipped. The goal is a tool
that collapses steps 2–3 (and later 1) so that producing a reviewed, green Cypress spec
is cheap enough that developers actually do it.

### Why this is hard for an LLM

Every painful part of step 3 reduces to the agent needing **ground truth about the
running application**: the real rendered DOM, the actual `[data-cy]` selectors present,
and the real network traffic to intercept. Source code alone is insufficient — rendered
output ≠ source. So the central design question is: *what is the agent's source of
ground truth?*

---

## 2. Goals and non-goals

**Goals**

- Turn an **approved scenario** into a **runnable, house-style Cypress spec** with
  correct selectors, setup/teardown, intercepts, and assertions.
- Keep a **human in the loop at the cheap stage** (reviewing a plain-language scenario
  and a final diff), not the expensive stage (hand-writing test code).
- Output indistinguishable from a hand-written test — passes code review on first read.
- Be **adoptable**: one command, walk away, come back to a green spec to review.

**Non-goals (for now)**

- Replacing developer judgment on *what* to test.
- Generating tests with no human review.
- Component-test generation (focus is E2E first).
- Cross-framework support — we emit **Cypress only** (the team's standard).

---

## 3. Key insight: ground truth, and why video is the wrong source

There are only three possible sources of ground truth about the running app:

| Source | Verdict |
|---|---|
| **The code** | Insufficient — can't know rendered DOM, selectors, or network. |
| **A screen recording (video)** | Lossy — discards exactly what we need (`[data-cy]`, DOM structure, network req/resp). Asks a vision model to reverse-engineer selectors from pixels. |
| **A live browser the agent controls** | Complete — real accessibility tree, real `[data-cy]` enumeration, real network capture. |

**Decision: the live browser is the backbone.** Video is strictly dominated and was
dropped entirely. (An earlier idea — record a session and analyze it with Gemini, in the
spirit of the `10x-test-planner` tool — was considered and rejected for selector/assertion
work; it could only ever feed *scenario drafting*, never test generation.)

A secondary but important point: an agent driving a **persistent** browser session
inspects the DOM **incrementally** without replaying from the top. This directly removes
the "wait for everything to reload each step" pain that makes Cypress Studio slow.

---

## 4. Considered approaches

| Approach | Summary | Why not / why |
|---|---|---|
| **A. Video → Gemini → test plan** | Dev records a session; a vision model emits a test plan. | Rejected as the engine. Loses selectors + network. Only viable for scenario drafting, not codegen. |
| **B. Headless agent, screenshots only** | Agent runs in a headless browser and looks at screenshots. | Weaker than structured DOM. Screenshots are lossy for selector work; accessibility tree + `[data-cy]` enumeration is far more reliable and token-efficient. |
| **C. Agent drives a live browser via structured DOM, emits Cypress, self-heals** | Agent explores the real app, harvests real selectors + network, writes Cypress, runs it headless, fixes failures. | **Chosen.** Complete ground truth, incremental inspection, self-verifying output. |

### The decoupling that makes C work

> **Explore with Playwright (best-in-class agent browser control). Emit Cypress
> (the team's stack).**

The browser-automation library the agent *explores* with does **not** have to be the
framework it *writes for*. Playwright gives the agent a structured accessibility
snapshot and network introspection that are ideal for an agent; the shipped artifact is
pure Cypress. **Playwright is a dev-time dependency of the generator only — it never
enters the test suite, `package.json` of the app under test, or CI.** This directly
answers the predictable "we don't want another test technology" objection: it's the
agent's eyes, like a linter, not a test runtime.

### The mock-capture trick

While exploring against a real tenant, the agent **captures the actual Cumulocity REST
responses** (`/inventory/managedObjects`, `/measurement/measurements`, alarms, events)
and **freezes them into `cy.intercept` + fixtures**. The developer never hand-builds a
mocked device — realistic mocks are produced as a by-product of exploration, and the
final test is deterministic and needs no tenant at run time.

---

## 5. Decision: architecture

A **standalone Node CLI** (`c8y-cygen`) that drives an agent loop.

### 5.1 Agent runtime

- **Anthropic TypeScript SDK Tool Runner** (`client.beta.messages.toolRunner`) drives the
  agentic loop: it calls the model, executes our tools, feeds results back, and loops
  until done. This is the "standalone CLI that makes its own LLM calls and drives the
  browser directly" — no external agent harness.
- **Model is a config field.** Start with **`claude-sonnet-4-6`** (adaptive thinking,
  `effort: high`); escalate to **`claude-opus-4-8`** if quality requires it. The switch
  is one line of config, deliberately, so we can tune cost/quality empirically.

### 5.2 Tool surface (the agent's eyes and hands)

| Tool | Purpose | Why it matters |
|---|---|---|
| `browser_navigate(path)` | Playwright `goto` on the app base URL, authenticated | live app |
| `browser_snapshot()` | returns the **accessibility tree** (text, not pixels) | "what is actually rendered" |
| `list_data_cy()` | runs `[...document.querySelectorAll('[data-cy]')]` in-page | **exact selectors, zero hallucination** |
| `browser_click/type(...)` | advance the scenario step-by-step in one **persistent** session | no replay-from-top |
| `capture_network(pattern)` | returns recent matching request/response pairs | source for intercepts + fixtures |
| `save_fixture(name, json)` | writes `cypress/fixtures/<name>.json` | freezes the mock |
| `write_spec(path, content)` | writes `cypress/e2e/<x>.cy.ts` | the output |
| `run_cypress(spec)` | runs headless, returns pass/fail + error + failure screenshot | the **self-heal signal** |
| file reads | scenario, house rules, existing specs | context |

### 5.3 Authentication (Cumulocity-specific)

Cumulocity login (via the `cumulocity-cypress` library's `cy.getAuth(...).login()`) is
**OAI-Secure**: it `POST`s to `/tenant/oauth/token` and stores an `XSRF-TOKEN` cookie —
no SSO form, no MFA.

> The explorer **replicates this in Node** (POST `/tenant/oauth/token`, capture the auth
> + `XSRF-TOKEN` cookies, inject them into the Playwright browser context). This means
> explore-time auth is **identical to test-time auth**, and there is no fragile login-form
> automation. *(To verify against `cumulocity-ui`'s tenants — some environments use
> Basic auth or different OAuth flows; the auth helper should support both OAI-Secure and
> Basic, mirroring whatever `cumulocity-cypress` supports.)*

### 5.4 Output styles: `--style mocked | integration`

One CLI flag, one branch in the generator prompt:

- **`mocked` (default):** explore live, but emit `cy.intercept` + captured fixtures.
  Deterministic, fast, **runs with no tenant** — most adoptable team-wide (not everyone
  needs tenant access at run time).
- **`integration`:** emit real `cy.request` setup/cleanup against a tenant in
  `beforeEach`/`afterEach` using the Cumulocity domain pack. More realistic, slower,
  needs tenant access.

### 5.5 Self-heal loop and anti-gaming guardrails

After emitting a spec, the agent runs `run_cypress` and, on failure, reads the error +
screenshot and fixes the **real** cause (selector, timing, setup) — looping to green.
The classic failure mode is an agent that "passes" a test by **weakening or deleting the
assertion**. Guardrails:

- The scenario's **Expected Outcomes are immutable inputs**, passed separately from code.
- The agent **may propose** an assertion-semantics change, but must emit it as a **flagged
  note for human review** — it must not silently apply it. *(Team chose this softer policy
  over a hard prohibition.)*
- An **assertion-trace check**: every "Expected Outcome" must map to at least one
  `.should(...)` in the spec, or the run fails even if Cypress is green.

### 5.6 House style

The repo's Cypress conventions (the `e2e-tests.instructions.md` rules: selector strategy,
intercept patterns, `cy.request` setup, `afterEach` cascade cleanup, unique names via
`Cypress._.now()`, "no `cy.wait(number)`", "no `it.only` committed", etc.) are injected
**verbatim into the system prompt as hard constraints**. Selector preference:
`[data-cy]` → role/title → element selector. This is what makes output pass review on the
first read.

### 5.7 Cost / caching

- **Prompt-cache the stable prefix** (system prompt + house rules + Cumulocity domain
  doc) — it never changes within a run.
- Keep **volatile content** (DOM snapshots, network dumps) after the last cache breakpoint,
  and **trim snapshots** to the interactive accessibility subtree, not full HTML.

### 5.8 Configurable per repo

A small `c8y-cygen.config.ts` (paths to the Cypress dir, `baseUrl`, env file, tenant URL,
model) keeps the tool repo-agnostic so it can be dropped into any Cumulocity Cypress
project, not just one.

---

## 6. Pipeline & human-in-the-loop

```
Stage 0  PR / change summary (md)         ── assumed to exist
            │
Stage 1  Scenario draft  ──►  *.scenario.md      ◄── HUMAN approves/edits (cheap markdown)
            │                                         [OUT OF SCOPE for the first slice]
            │
Stage 2  EXPLORE (live browser) + GENERATE Cypress
            │   • OAI-Secure login (Node) → inject cookies into Playwright
            │   • browser_snapshot + list_data_cy  → real DOM + real selectors
            │   • walk scenario steps against the live app
            │   • capture_network → freeze fixtures (mocked) or emit cy.request (integration)
            │   • write_spec  (obeys house rules)
            │
Stage 3  SELF-HEAL: run_cypress → read failure → fix → loop to green
            │
        green spec + diff  ◄── HUMAN reviews the diff (the only code review needed)
```

Human review sits at Stage 1 (approve a markdown scenario) and at the final diff — both
cheap. The expensive middle is automated.

---

## 7. The scenario contract (Stage 1 → Stage 2 interface)

Even though Stage 1 automation is deferred, the **format** is fixed now because the whole
team will touch it. Structured markdown (inspired by `10x-test-planner`'s shape, tuned for
Cumulocity):

- **Objective**
- **Preconditions**
- **Setup** — devices / measurements / alarms / events to create
- **Steps** — user workflow
- **Expected Outcomes** — the **immutable assertions** (see §5.5)
- **Style** — `mocked | integration`

Stage 2 parses this; humans approve it. Hand-written scenarios in the first slice already
use the real format, so nothing is throwaway.

---

## 8. Technology decisions (summary)

| Decision | Choice | Rationale |
|---|---|---|
| Agent platform | Standalone Node CLI + Anthropic SDK Tool Runner | Own process, own tools, own loop; no external harness. |
| Model | `claude-sonnet-4-6` first, `claude-opus-4-8` if needed | Config-swappable; tune cost/quality empirically. |
| Browser control (explore) | **Playwright** (dev-only) | Best agent-grade DOM + network introspection; never ships. |
| Test framework (emit) | **Cypress** | Team standard; non-negotiable. |
| Default data strategy | **Mocked** (intercept + captured fixtures) | Deterministic, fast, no tenant at run time → most adoptable. |
| Alt data strategy | **Integration** (real `cy.request`) | Realism when a tenant is available. |
| Language / stack | TypeScript, `tsx`, `commander`, `zod` | Matches scaffolded `package.json`. |

Scaffolded dependencies (from `package.json`): `@anthropic-ai/sdk`, `commander`,
`playwright`, `zod`; dev: `tsx`, `typescript`, `@types/node`.

---

## 9. First slice (MVP) — what we'd build to prove the loop

Target an existing, known-good flow as a **free oracle** (originally the prototype's
`navigator-header.cy.ts`; in `cumulocity-ui`, pick an equivalent simple authenticated
page). Scope:

1. Package skeleton: CLI + `c8y-cygen.config.ts`.
2. `explore/auth.ts`: OAI-Secure login in Node → inject cookies into Playwright.
3. Browser tools: `navigate`, `snapshot`, `list_data_cy`.
4. Tool Runner loop on `claude-sonnet-4-6`.
5. A hand-written `*.scenario.md` for the oracle flow.
6. Emit a **mocked** spec, self-heal to green, **diff against the hand-written oracle**.

Success = the agent reproduces (or improves on) the hand-written spec end to end. Then we
scale to real PR scenarios, the domain pack, the `integration` style, and Stage 1.

---

## 10. Change of plan: moving into the Cumulocity-IOT org / `cumulocity-ui`

Originally prototyped standalone against a tiny `test-app`. Now moving into a
`cumulocity-ui`-based repo under the **Cumulocity-IOT** org, with proper tenant access.
This unlocks and obligates several things to revisit:

- **Real / shared test tenant** may now exist → the `integration` style and live capture
  become first-class (the prototype only had a personal tenant).
- **Existing Cypress infrastructure & conventions** in `cumulocity-ui` — align the house
  rules, selector conventions, and `data-cy` patterns to what already ships there rather
  than the prototype's `test-app` rules.
- **A domain pack may already partially exist** (`cy.login`, data-setup commands). Reuse,
  don't reinvent — wrap whatever `cumulocity-cypress` / the repo already provides.
- **CI integration** — running `run_cypress` and the assertion-trace check could become a
  CI step or a PR bot in a later iteration (explicitly a future iteration, not the PoC).
- **Auth variations** — confirm the OAI-Secure assumption holds across the org's tenants;
  support Basic auth fallback.
- **Open-source / licensing** — under a company org, decide license, visibility, and
  whether it's internal-only initially. Keep it **private until the first slice proves
  out** and tenant-specific details are scrubbed.

---

## 11. Risks, open questions, and things to challenge

These are deliberately surfaced for the team / reviewing agent to push on:

- **Sensitive data in captured fixtures.** Real tenant responses can contain customer
  data / PII / internal hostnames. Captured fixtures **must be scrubbed/anonymized**
  before being committed. Needs a redaction step and a policy. *(Important — easy to
  overlook.)*
- **Secrets handling.** `ANTHROPIC_API_KEY` and tenant credentials must come from env /
  secret store, never committed. The agent writes specs that themselves must use
  `Cypress.env(...)` per house rules.
- **Exploration writes to a real tenant** (managed objects, measurements). Requires unique
  names + reliable `afterEach` cleanup, or a disposable/test tenant. Mocked-style final
  tests don't touch the tenant again, but exploration does.
- **Flakiness vs realism.** Mocked is deterministic but can drift from the real API over
  time. Acceptable default; integration tests are the realism backstop.
- **Self-heal gaming.** §5.5 guardrails mitigate but should be reviewed — is "propose +
  flag" the right strictness, or should dropped assertions hard-fail?
- **Cost / latency.** Agentic runs with many snapshots are token-heavy; caching + snapshot
  trimming + Sonnet-first are the levers. Measure before scaling.
- **Selector robustness.** Relies on good `[data-cy]` coverage in the app; gaps force
  brittle fallbacks. May surface a need to improve `data-cy` coverage in `cumulocity-ui`.
- **Scope of Stage 1.** Auto-drafting scenarios from a PR summary is deferred — but if the
  team's *real* blocker is "thinking of scenarios," it may need to be pulled forward.
- **Maintainability.** Prompts are authored as markdown files (loaded at init), not inline
  strings, to keep prompt engineering separate from code.

---

## 12. References / prior art

- **`cumulocity-cypress`** — provides `cy.login()` / OAI-Secure auth and Cumulocity test
  helpers; the tool builds on it rather than re-implementing.
- **`10x-test-planner`** — a video→Gemini→test-plan CLI. Inspiration for *prompts-as-
  markdown*, *disk-cached expensive steps*, *tag-delimited model output*, and a *thin
  orchestrator*. Its video approach is **not** adopted for codegen (see §3).
- Cumulocity Codex / `@c8y/ngx-components` — component and design-system context for the
  app under test.

---

## 13. Decision

Adopt **Approach C**: a standalone Node CLI that drives a live browser via Playwright for
**exploration**, captures real selectors and network, and **emits self-healed Cypress
tests**, with human review at the scenario and final-diff stages. Build the first slice
against a known-good flow as an oracle before investing further.

**Status: Proposed — pending team and second-agent review.**