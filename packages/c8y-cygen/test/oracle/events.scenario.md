# Scenario: Device event appears with correct details in the event timeline

> MVP oracle scenario for c8y-cygen (PRD §"First slice"). Hand-written, in the fixed
> scenario contract (PRD §7), describing the same flow as the frozen oracle at
> `./events.cy.oracle.ts`. Written to be style-neutral: it should generate a valid spec
> under either `Style`, even though the frozen oracle itself happens to be
> integration-style (real `cy.createDevice`/`cy.request`, no intercepts).

## Objective

Verify that an event posted for a device shows up with the correct details when a user
opens that device's event timeline and selects the event.

## Preconditions

- An authenticated session against the target tenant (OAI-Secure login).
- The device management app is reachable at `/apps/devicemanagement/index.html`.

## Setup

- Ensure a device exists with a known, unique name (e.g. `` e2eDeviceToTestEvents${Cypress._.now()} ``).
- Ensure exactly one event exists for that device, with known field values:
  - `type`: `c8y_LocationUpdate`
  - `text`: `Location update`
  - `c8y_Position`: `{ lat: 52.534925, lng: 17.582658 }`
  - `time`: now, formatted `YYYY-MM-DDTHH:mm:ssZ` (ISO 8601, UTC `Z`)
  - `source.id`: the created device's id
- *(`integration` style: create the device via `cy.createDevice` and post the event via
  real `cy.request('/event/events', 'POST', ...)`, as in the frozen oracle.
  `mocked` style: create the device via `cy.createMockedDevice` and serve the event via
  `cy.intercept` on `/event/events` returning a frozen fixture shaped like the event
  above — discover the exact response shape and any per-event detail endpoint during
  exploration, then capture and freeze it.)*

## Steps

1. Log in.
2. Navigate to the device's events page:
   `/apps/devicemanagement/index.html#/device/{deviceId}/events`.
3. Wait for the device's tab view to load.
4. Open the first (only) item in the event timeline.

## Expected Outcomes

1. The device's event tab view is visible before interacting with the timeline.
2. The opened event's details show the source/device wrapper containing the device's
   name.
3. The opened event's details show a time value within ±3 minutes of "now" (UTC).
4. The opened event's details show the type value `c8y_LocationUpdate`.
5. The opened event's details show a creation-time value within ±3 minutes of "now"
   (UTC).
6. The opened event's details show at least one custom-data item.
7. The custom-data text includes both the posted latitude (`52.534925`) and longitude
   (`17.582658`) values.

## Style

`mocked` (default target for the MVP proof-of-loop; the scenario is written to also
support `integration` — see the Setup note above).
