# Cumulocity domain notes for c8y-cygen

Generator-owned cheat sheet, injected into the system prompt alongside the target
app's own house rules (read live from `--app-repo`, never vendored here). Distilled
from `../../doc/cumulocity-ui-e2e-conventions.md`. Update this file when a new gotcha
is discovered during a generation run — it is meant to accumulate.

## Authentication

- Cumulocity's OAI-Secure flow: `POST /tenant/oauth[?tenant_id=...]` with
  `grant_type=PASSWORD`, `username`, `password` (and optional `tfa_code`) as
  `application/x-www-form-urlencoded` body. Response carries the auth cookie and an
  `XSRF-TOKEN` cookie. No SSO form, no MFA form to automate.
- The explorer replicates this in Node (via `cumulocity-cypress`'s shared `oauthLogin`)
  and injects the resulting cookies into the Playwright browser context. Explore-time
  auth is identical to test-time auth (`cy.login()` performs the same flow client-side).

## Selectors

- Hierarchy: `[data-cy]` → `[role]`/`[title]` → element/component selector → CSS class
  (last resort, only if the class is stable/intentional public API).
- `data-cy` pattern: `<component>--<element>-<detail>` (double hyphen separates
  component from element; single hyphens connect element type to descriptive detail).
- Always prefer `[data-cy]` even if surrounding/older specs in the target app mix
  patterns — the app team is actively migrating toward it.
- **A component's `[data-cy]` value can differ per rendered branch** (e.g. a widget
  that shows a different `data-cy` in "Grid" vs "List" display mode). If a scenario
  step changes state (a toggle, a mode switch, opening a different dialog) *after*
  you've already observed a selector, re-verify with `list_data_cy`/`browser_snapshot`
  in the new state rather than reusing the old selector — it may no longer match, or
  may now match something unrelated left over from before the change. When an
  assertion is meant to hold across such a change (e.g. "the same items are still
  there after switching modes"), prefer a selector that's stable across the branches
  (an attribute prefix match, `[data-cy^="component--element-"]`, or a class applied
  unconditionally in the template) over the exact value from one specific branch.
- **Don't derive a "did X render" check from a data-driven value.** E.g. an icon
  input can arrive in more than one shape (a CSS-class-style string vs. a plain
  icon-font name) — asserting a class computed from that value (like
  `i.${iconName}`) only holds for one shape. Assert against a class the template
  applies unconditionally instead (read the component's own `.html` to find one),
  or just check the element `.should('be.visible')` without keying off the data.

## Page load & navigation

- `cy.visitAndWaitUntilPageLoad()` is the default — it waits up to 20s for an Angular
  page-load event. Bare `cy.visit()` is only for cases that intentionally skip that
  wait; don't use it by default.

## Intercepts & fixtures

- Never emit `cy.wait(<number>)`. Use `cy.wait('@alias')` or rely on `.should()`
  retrying.
- Pact recordings (`c8ypact`) are **component-test only** — never emit pact syntax in
  an E2E spec.
- Query-parameter matching on intercepts: `cy.intercept({ pathname, query }, ...)`.

## Setup & teardown

- Unique names via `` `${prefix}${Cypress._.now()}` `` — millisecond timestamp, stable
  within a single run (not a UUID).
- Cascade delete in `afterEach`: `DELETE /inventory/managedObjects/{id}?cascade=true`
  with `failOnStatusCode: false` — required so a mid-test failure doesn't mask the real
  error behind a cleanup 404.
- Clone shared template objects before mutating (`Cypress._.cloneDeep(...)`) — reusing
  one object across cases silently mutates all of them.
- Event timestamps must be `YYYY-MM-DDTHH:mm:ssZ` (ISO 8601, UTC `Z`) — other formats
  fail date-diff assertions.

## Team tags

- Every `describe` must carry `{ tags: '@teamName' }` from the app's valid team-tag
  set. Not lint-enforced but treated as a hard rule — omitting it breaks CI grep
  filters.

## Visibility vs. presence

- A size-constrained container (fixed height/width, `overflow: hidden`, a compact
  card/panel/cell) is not guaranteed to simultaneously show every item of an
  arbitrarily long list without scrolling — items past its rendered area exist in
  the DOM but are effectively 0×0, i.e. not `.should('be.visible')`. This is normal
  layout behavior, not a bug, whenever a scenario's data set size isn't fixed by the
  scenario itself.
- The same component can render in more than one context with different size
  constraints (e.g. an editing/preview surface vs. its final saved/real placement) —
  an assertion that "every item is visible" holds in one context does not
  automatically transfer to the other.
- When a data set might exceed a container's rendered size, prefer asserting DOM
  presence/content (`.should('have.length', n)`, `.should('have.attr', 'href', ...)`)
  over strict `.should('be.visible')` on every item, unless the scenario specifically
  cares about what's visible without scrolling.

## `cy.request()`

- The target app typically overrides `cy.request()` to auto-inject Cumulocity auth
  headers. Do not pass an explicit auth object for platform endpoints — it can
  conflict with the override.
