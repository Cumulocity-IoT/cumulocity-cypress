// FROZEN ORACLE — NOT EXECUTED FROM THIS PACKAGE.
//
// This is a read-only reference copy, used only as the M7 diff target for the MVP
// proof-of-loop. It is an extract (not the full file) of:
//
//   Source repo:   cumulocity-ui-e2e
//   Source path:   cypress/e2e/dataAndControlTeam/events.cy.ts
//   Extracted:     the 'Verify the event for a device shows respective event details'
//                  test, lines 75-114 of the source at the time of extraction, plus
//                  the surrounding describe/beforeEach/eventObj it depends on.
//   Frozen on:     2026-07-13
//
// Do not "fix" this file to make it pass here — it is deliberately inert. If the real
// source file changes, re-freeze this copy deliberately and note the new extraction
// date above.

import * as dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);

describe(
  'Tests for device events',
  { tags: ['@deviceManagementTeam', '@dataAndControlTeam'] },
  () => {
    const deviceName = 'e2eDeviceToTestEvents';

    const eventObj = {
      source: {
        id: ''
      },
      type: 'c8y_LocationUpdate',
      text: 'Location update',
      c8y_Position: {
        lat: 52.534925,
        lng: 17.582658
      },
      time: dayjs().format('YYYY-MM-DDTHH:mm:ssZ')
    };

    beforeEach(() => {
      cy.login(Cypress.env('username'), Cypress.env('password'));
    });

    it(
      'Verify the event for a device shows respective event details',
      { tags: '@requiresBackend' },
      () => {
        const newDeviceName = `${deviceName}${Cypress._.now()}`;
        cy.createDevice({ name: newDeviceName });
        cy.getDeviceIdByName(newDeviceName).then((deviceId: any) => {
          const updateEvent = Cypress._.clone(eventObj);
          updateEvent.source.id = deviceId;
          cy.request('/event/events', 'POST', updateEvent);
          cy.visitAndWaitUntilPageLoad(
            `/apps/devicemanagement/index.html#/device/${deviceId}/events`,
            false
          );
          cy.get('c8y-tabs-outlet').should('be.visible');
          cy.get('[data-cy="c8y-events-list--timeline-item"]').first().click();
          cy.get('[data-cy="c8y-event-details--source-wrapper"]')
            .should('contain.text', newDeviceName);
          cy.get('[data-cy="c8y-event-details--time-wrapper"]')
            .invoke('text')
            .then(text => {
              expect(dayjs(text).diff(dayjs().utc(), 'minutes')).to.be.within(-3, 3);
            });
          cy.get('[data-cy="c8y-event-details--type-wrapper"]').should('contain.text', eventObj.type);
          cy.get('[data-cy="c8y-event-details--creation-time-wrapper"]')
            .invoke('text')
            .then(text => {
              expect(dayjs(text).diff(dayjs().utc(), 'minutes')).to.be.within(-3, 3);
            });

          cy.get('[data-cy="event-details-custom-data-item"]')
            .should('have.length.at.least', 1);
          cy.get('[data-cy="event-details-custom-data"]')
            .invoke('text')
            .then(text => {
              expect(text).to.include(`${eventObj.c8y_Position.lat}`);
              expect(text).to.include(`${eventObj.c8y_Position.lng}`);
            });
        });
      }
    );
  }
);
