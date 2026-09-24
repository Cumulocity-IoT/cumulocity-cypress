# Cumulocity UI E2E Testing Conventions

A scouting report of house-style Cypress patterns from `cumulocity-ui/cypress/`.

## 1. Directory/File Layout

```
cypress/
├── e2e/                          # E2E tests organized by team
│   ├── appEnablementTeam/        # ~29 specs
│   ├── authentication/           # ~25 specs
│   ├── dataAndControlTeam/       # ~30 specs
│   ├── deviceManagementTeam/     # (shared with dataAndControl)
│   ├── lpwanIntegrationTeam/     # ~7 specs
│   ├── lwm2mOpcuaTeam/           # Small set
│   ├── platformTeam/             # ~12 specs
│   └── betaTests/                # Experimental specs
├── component/                    # Component tests (mount-based)
├── support/
│   ├── commands.ts               # Custom Cypress commands (login, createDevice, etc.)
│   ├── e2e.ts                    # E2E global setup (login, tenant info, hooks)
│   ├── component.ts              # Component test setup (cumulocity-cypress pact)
│   └── helpers/
│       ├── deviceList.ts
│       ├── deviceGridConfig.ts
│       └── deviceDashboard.ts
├── fixtures/                     # ~53 directories + JSON fixtures
│   ├── c8ypact/                  # Pact recordings for component tests
│   ├── administration/
│   ├── authentication/
│   ├── cockpit/
│   ├── devicemanagement/
│   └── *.json                    # Shared mocked responses (currentUser.json, roles.json, etc.)
├── snapshots/
│   ├── base/                     # Baseline screenshots for visual regression
│   ├── actual/                   # Current run output
│   └── diff/                     # Visual diffs
├── .eslintrc.json                # Cypress/Mocha ESLint config
└── contributing.md               # Contributing guide (in repo)
```

**Key convention:** Tests live in `e2e/<teamName>/`, organized by feature area. Specs are named `<feature>.cy.ts`.

## 2. Authentication

**Login method:** Custom command `cy.login(username, password, acceptCookieBanner?, blockGainsight?)`.

**Implementation** (support/commands.ts:208–249):
- Uses `cy.session()` to cache auth across tests
- Calls `/tenant/oauth` with `grant_type: 'PASSWORD'`
- Wraps credentials from `Cypress.env('username')` / `Cypress.env('password')`
- Accepts cookie banner via localStorage intercept
- Blocks Gainsight analytics by default

**Credentials source:**
- CLI: `--env username=<user>,password=<pass>`
- `cypress.env.json`: `{"admin_username": "...", "admin_password": "..."}`
- **Never hardcoded**

**Usage pattern:**
```typescript
beforeEach(() => {
  cy.login(Cypress.env('username'), Cypress.env('password'));
});
```

**Tenant ID extraction** (support/e2e.ts:32–45):
- Global `before()` hook fetches `/tenant/currentTenant` and stores in `Cypress.env('tenantId')`
- Auto-available in all tests

## 3. Selectors

**Hierarchy:** `data-cy` > `[title]` / `[role]` > component element name > CSS class (as fallback).

**Pattern for `data-cy`:** `<component>--<element>-<detail>`
- Double hyphen (`--`) separates component from element
- Single hyphens connect element type with descriptive details

**Examples from specs:**
```typescript
cy.get('[data-cy="c8y-navigator-node--expander"]')          // Navigation expander
cy.get('[data-cy="c8y-events-list--timeline-item"]')        // Event timeline item
cy.get('[data-cy="c8y-event-details--source-wrapper"]')     // Event detail section
cy.get('[data-cy="c8y-event-details--type-wrapper"]')       // Event type field
cy.get('[data-cy="event-details-custom-data"]')             // Custom data container

cy.get('[title="License management"]')                      // Fallback for titled elements
cy.get('c8y-tabs-outlet')                                   // Component element selector
```

**Rule:** Avoid `.my-layout-class` selectors unless the class is intentional public API. ESLint does not enforce `data-cy` priority, but the e2e-tests.instructions.md recommends it strongly.

## 4. Intercepts & Fixtures

**Typical `cy.intercept()` patterns:**

```typescript
// Simple mock for alarms endpoint
cy.intercept({
  pathname: '/alarm/alarms',
  query: { source: '12345' }
}).as('spyAlarmsEndpoint');
cy.wait('@spyAlarmsEndpoint');

// Dynamic response based on request state
cy.intercept({ pathname: '/event/events' }, request => mockEvents(request, []));

// Pathname + query matching
cy.intercept({
  pathname: '/inventory/managedObjects',
  query: { pageSize: '5' }
}, { managedObjects: [] });
```

**Fixture structure:**
- JSON fixtures in `cypress/fixtures/` by domain (administration/, cockpit/, devicemanagement/)
- Shape example (`fetchMeasurementsOnDeviceResponse.json`):
  ```json
  {
    "additionParents": { "references": [], "self": "..." },
    "id": "1124",
    "name": "DeviceName",
    "c8y_IsDevice": {},
    "c8y_SupportedMeasurements": ["c8y_TemperatureMeasurement"]
  }
  ```

**Pact recordings** (component tests only, not E2E):
- Live in `cypress/fixtures/c8ypact/`
- Created with `C8Y_PACT_MODE=recording` env var
- Used via `{ auth: 'admin', c8ypact: { id: 'my-recording-id' } }` in test config
- Purpose: replay recorded HTTP sequences for deterministic component mocks

**No fixed waits:** Never use `cy.wait(<number>)`. Use `cy.wait('@alias')` or rely on `.should()` retry logic.

## 5. Setup & Teardown

**Unique naming:** `const name = 'e2eDevice${Cypress._.now()}'` — millisecond timestamp ensures uniqueness.

**Setup pattern** (from events.cy.ts:79–88):
```typescript
const newDeviceName = `${deviceName}${Cypress._.now()}`;
cy.createDevice({ name: newDeviceName });
cy.getDeviceIdByName(newDeviceName).then((deviceId: any) => {
  const event = { ...eventObj, source: { id: deviceId } };
  cy.request('/event/events', 'POST', event);  // Create event for device
  // Now test...
});
```

**Teardown pattern:**
```typescript
afterEach(() => {
  createdIds.forEach(id => {
    cy.request({
      url: `/inventory/managedObjects/${id}?cascade=true`,
      method: 'DELETE',
      failOnStatusCode: false  // Don't fail if already deleted
    });
  });
});
```

**Cascade delete:** `?cascade=true` parameter removes device + children + related data in one call.

## 6. House Rules (Lint & Style)

**ESLint rules** (cypress/.eslintrc.json):
- ✅ `mocha/no-exclusive-tests: error` — `it.only` / `describe.only` forbidden (prevents committed test filters)
- ✅ `cypress/no-pause: error` — no `cy.pause()`
- ✅ `@typescript-eslint/no-unused-vars: error` — flag dead code
- ❌ `cypress/no-force: off` — `.click({force: true})` allowed (common for hidden/disabled elements)
- ❌ `cypress/unsafe-to-chain-command: off` — chaining allowed (e.g., `cy.get().click().should()`)

**Convention rules** (e2e-tests.instructions.md):
1. Every `describe` must have `{ tags: '@teamName' }` — filters test runs by team
2. No hardcoded tenant IDs, device IDs, credentials
3. Use `cy.visitAndWaitUntilPageLoad()` by default (waits 20s for page load event)
4. Use `cy.visit()` only if skipping load check is intentional
5. No trivial tests for coverage — test meaningful user behavior

## 7. Cumulocity-Specific Custom Commands

**Auth & navigation:**
- `cy.login(username, password, acceptCookieBanner?, blockGainsight?)` — session-cached OAuth
- `cy.getTenantId(username, password)` — fetch tenant name via `/tenant/currentTenant`
- `cy.visitAndWaitUntilPageLoad(url, doA11yCheck?, selector?)` — visit + wait 20s for page load + optional axe a11y check
- `cy.visitAndVerifyContentByText(url, selector, text, doA11yCheck?)` — visit + verify element contains text

**Device management:**
- `cy.createDevice(deviceProperties: object)` — POST to `/inventory/managedObjects` with `c8y_IsDevice`
- `cy.getDeviceIdByName(deviceName, isDeviceSimulator?)` — query `/inventory/managedObjects?name=<X>`
- `cy.createMockedDevice(moProperties)` — intercept and fake device creation
- `cy.visitInfoPageAndWaitForWidgetsToLoad(deviceId, doA11yCheck?)` — navigate to device detail + wait for widgets

**Other:**
- `cy.acceptCookieBanner(required, functional, marketing)` — set localStorage `acceptCookieNotice`
- `cy.displayCookieBanner()` — remove localStorage to re-show banner
- `cy.mockMOsPerCurrentPage(listOfMOs, property, routeMatcher)` — paginate mock responses per request
- `cy.request()` — overwritten to add C8y auth headers (no need to pass auth object for C8y endpoints)
- `cy.compareSnapshot(id, threshold?)` — visual regression baseline/actual comparison

**Note:** Imported from `cumulocity-cypress/lib/commands` (external library) + local overrides in `support/commands.ts`.

## 8. Candidate Oracle Flows

### Smallest self-contained flow: Device creation + event assertion

**File:** `cypress/e2e/dataAndControlTeam/events.cy.ts:75–114` (40 lines, device→event→UI verify)

**Pattern:**
1. Create device with unique name via `cy.createDevice()` (generates name with `Cypress._.now()`)
2. Get device ID via `cy.getDeviceIdByName()`
3. POST event via `cy.request('/event/events', 'POST', event)`
4. Navigate to device events page
5. Assert event appears in timeline with correct details (source, time, type, custom data)

**Key assertion types:**
- Visibility: `.should('be.visible')`
- Text match: `.should('contain.text', expectedText)`
- Array length: `.should('have.length.at.least', 1)`
- Date validation: `.invoke('text').then(text => expect(dayjs(text).diff(...)).to.be.within(...))`

### Minimal E2E without backend: No events + empty state

**File:** `cypress/e2e/dataAndControlTeam/events.cy.ts:69–73` (5 lines)

**Pattern:**
1. Intercept `/event/events` with empty array
2. Visit events page
3. Assert "No events to display" message

**Simplest possible: Device info page navigation**

**File:** `cypress/e2e/platformTeam/settings/tenantLicense.cy.ts:7–12` (6 lines)

**Pattern:**
1. Login
2. Navigate to admin page
3. Expand navigator nodes via expander selectors
4. Assert menu item not visible

## 9. Surprising Conventions & Gotchas

1. **Page load check is mandatory by default:** `cy.visitAndWaitUntilPageLoad()` waits up to 20s for Angular to emit a page-load event. Using bare `cy.visit()` is only for specific cases (documented in contributing.md). Naive generation would miss this.

2. **Pact recordings are component-only (for now):** The contributing.md notes "Currently this is supported only for component testing, support for e2e will follow in future." Generating an E2E spec with pact syntax will fail.

3. **Cascade delete is implicit:** The `?cascade=true` parameter is **not** always safe in afterEach without `failOnStatusCode: false`. Tests often delete non-existent IDs if a test fails mid-setup; the flag prevents cleanup failure from masking the real error.

4. **Team tags are not optional:** Every describe block **must** have `{ tags: '@teamName' }`. Omitting this breaks CI grep filters and violates house style strictly (though not technically enforced by lint).

5. **`cy.request()` is overwritten with C8y auth:** The custom `cy.request()` in support/commands.ts:86 auto-injects C8y headers. Calling `cy.request()` without explicit auth works for platform endpoints; trying to pass OAuth tokens manually will conflict.

6. **Event timestamps must be `YYYY-MM-DDTHH:mm:ssZ` format:** Tests use `dayjs().format('YYYY-MM-DDTHH:mm:ssZ')` for event time fields. ISO8601 with UTC Z is required; other formats will cause assertion failures in date validation.

7. **No `Cypress._.cloneDeep()` needed for primitive overwrites:** Tests use `Cypress._.cloneDeep(eventObj)` before mutating shared template objects. Naive generation might reuse an object and accidentally mutate all copies.

8. **Selector stability is team-specific:** The `data-cy` pattern is enforced for new tests, but older specs may use `.class` selectors. The UI team is actively migrating to data-cy (see `contributing.md` emphasis). Agent-generated specs should **always** prefer `data-cy` even if existing specs mix patterns.

9. **`Cypress._.now()` returns milliseconds, not seconds:** Used for unique naming: `${prefix}${Cypress._.now()}`. This is deterministic per test run, not a random UUID — the same test run repeats the same timestamp. For truly unique IDs across CI runs, tests sometimes append extra suffixes.

10. **Gainsight is blocked by default in login:** The `blockGainsight: true` default in `cy.login()` intercepts `aptrinsic.com` requests. Tests that specifically need analytics events must pass `blockGainsight: false` explicitly (rare; no examples in the repo).

---

**Report date:** 2026-07-08 | **Repo commit:** cumulocity-ui-e2e (Jun 27 12:52) | **Cypress version:** 15 (from cypress.config.ts)
