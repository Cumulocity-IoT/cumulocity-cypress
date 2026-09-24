# Scenario: Device event appears with correct details in the event timeline

> Live-run copy of test/oracle/events.scenario.md for the first end-to-end proof.
> Only the Setup section is changed, to point exploration at a device+event already
> seeded on the real tenant for this run - everything else (Objective, Steps, Expected
> Outcomes) is unchanged from the original.
>
> This file is intentionally kept in test/oracle/ (not the ephemeral scratchpad) so it
> survives across sessions. Not committed as part of the MVP oracle contract - it's a
> per-run artifact referencing a specific seeded device id.

## Objective

Verify that an event posted for a device shows up with the correct details when a user
opens that device's event timeline and selects the event.

## Preconditions

- An authenticated session against the target tenant (OAI-Secure login).
- The device management app is reachable at `/apps/devicemanagement/index.html`.

## Setup

- For EXPLORATION ONLY: a device named `e2eDeviceToTestEvents1784664037565` (id
  `18327205`) already exists in this tenant, with exactly one event already posted on
  it (`type`: `c8y_LocationUpdate`, `text`: `Location update`, `c8y_Position`:
  `{ lat: 52.534925, lng: 17.582658 }`, `time`: recent, UTC). Navigate directly to
  `/apps/devicemanagement/index.html#/device/18327205/events` to explore its real
  rendered UI, selectors, and network traffic - do not spend turns trying to create
  this data yourself during exploration.
- For the GENERATED SPEC's own code (this is `integration` style): still create a
  FRESH device via `cy.createDevice` and post a FRESH event via real
  `cy.request('/event/events', 'POST', ...)`, exactly like the frozen oracle at
  `test/oracle/events.cy.oracle.ts` - unique name, real cleanup. Do not hardcode the
  seeded device/event ids above into the spec; they are exploration aids only and may
  not exist by the time the spec is reviewed later.
- Event field values for the generated spec's own fresh event, matching the seeded one:
  - `type`: `c8y_LocationUpdate`
  - `text`: `Location update`
  - `c8y_Position`: `{ lat: 52.534925, lng: 17.582658 }`
  - `time`: now, formatted `YYYY-MM-DDTHH:mm:ssZ` (ISO 8601, UTC `Z`)
  - `source.id`: the freshly created device's id

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

`integration` (this live-run copy targets integration style explicitly, to avoid the
known mid-loop fixture-confirmation gap in mocked style).
