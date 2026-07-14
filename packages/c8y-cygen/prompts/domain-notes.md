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

## `cy.request()`

- The target app typically overrides `cy.request()` to auto-inject Cumulocity auth
  headers. Do not pass an explicit auth object for platform endpoints — it can
  conflict with the override.
