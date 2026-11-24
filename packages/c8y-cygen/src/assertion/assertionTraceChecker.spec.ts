import { readFileSync } from "node:fs";
import path from "node:path";
import { checkAssertionTrace } from "./assertionTraceChecker.js";
import { parseScenario } from "../scenario/scenarioContract.js";

describe("checkAssertionTrace - synthetic cases", () => {
  it("matches an outcome via a quoted literal copied verbatim into the .should(...) call", () => {
    const result = checkAssertionTrace(
      ["The status badge shows the text `Active`."],
      `cy.get('[data-cy="status-badge"]').should('contain.text', 'Active');`
    );
    expect(result).toEqual({ ok: true, unmatched: [] });
  });

  it("matches an outcome via a decimal literal copied verbatim into the .should(...) call", () => {
    const result = checkAssertionTrace(
      ["The reading shows the value `12.34`."],
      `cy.get('[data-cy="reading"]').should('contain.text', '12.34');`
    );
    expect(result).toEqual({ ok: true, unmatched: [] });
  });

  it("matches an outcome via generic word overlap when there is no literal to copy", () => {
    const result = checkAssertionTrace(
      ["The device list is visible."],
      `cy.get('[data-cy="device-list"]').should('be.visible');`
    );
    expect(result).toEqual({ ok: true, unmatched: [] });
  });

  it("flags an outcome with zero .should(...) calls anywhere in the spec", () => {
    const result = checkAssertionTrace(
      ["The device list is visible."],
      `cy.get('[data-cy="device-list"]').invoke('text').then((text) => { expect(text).to.eq('ok'); });`
    );
    expect(result).toEqual({
      ok: false,
      unmatched: ["The device list is visible."],
    });
  });

  it("flags exactly the outcomes with no matching .should(...), leaving matched ones out of the list", () => {
    const spec = [
      `cy.get('[data-cy="device-list"]').should('be.visible');`,
      `cy.get('[data-cy="device-count"]').invoke('text').then((text) => { expect(text).to.eq('3'); });`,
    ].join("\n");

    const result = checkAssertionTrace(
      ["The device list is visible.", "Exactly three devices are shown."],
      spec
    );

    expect(result.ok).toBe(false);
    expect(result.unmatched).toEqual(["Exactly three devices are shown."]);
  });

  it("does not let a shared selector-prefix word alone count as a match", () => {
    // "c8y-event-details--*-wrapper" is shared by every selector below (the
    // same real-world pattern as the oracle test); three of them are checked
    // via .should(...), but the one the outcome is actually about is checked
    // via .then()+expect() instead. Boilerplate filtering needs >=3
    // .should(...) windows to activate (see discriminatingWords) - this must
    // still correctly flag the outcome as unmatched, not let it through on
    // "event"/"details"/"wrapper" overlap alone.
    const spec = [
      `cy.get('[data-cy="c8y-event-details--type-wrapper"]').should('contain.text', eventType);`,
      `cy.get('[data-cy="c8y-event-details--status-wrapper"]').should('contain.text', eventStatus);`,
      `cy.get('[data-cy="c8y-event-details--severity-wrapper"]').should('contain.text', eventSeverity);`,
      `cy.get('[data-cy="c8y-event-details--source-wrapper"]').invoke('text').then((text) => { expect(text).to.include(deviceName); });`,
    ].join("\n");

    const result = checkAssertionTrace(
      ["The event details show the source device name."],
      spec
    );

    expect(result.ok).toBe(false);
  });
});

describe("checkAssertionTrace - real oracle (test/oracle/events.cy.oracle.ts)", () => {
  const scenarioMd = readFileSync(
    path.resolve(process.cwd(), "test/oracle/events.scenario.md"),
    "utf-8"
  );
  const oracleSource = readFileSync(
    path.resolve(process.cwd(), "test/oracle/events.cy.oracle.ts"),
    "utf-8"
  );
  const scenario = parseScenario(scenarioMd);

  it("parses exactly 7 Expected Outcomes from the real scenario", () => {
    expect(scenario.expectedOutcomes).toHaveLength(7);
  });

  it("hard-fails the frozen oracle as written - it checks 3 outcomes via .then()+expect(), not .should(...)", () => {
    // This is a genuine, real finding, not a contrived test case: the merged
    // cumulocity-ui-e2e oracle checks the time/creation-time/lat-lng outcomes
    // with `.invoke('text').then(text => expect(...))`, which house style
    // itself discourages ("Use .should() for all assertions ... Avoid .then()
    // for assertions" - e2e-tests.instructions.md). The gate is meant to
    // force exactly this kind of fix during self-heal, even against
    // already-merged code.
    const result = checkAssertionTrace(scenario.expectedOutcomes, oracleSource);

    expect(result.ok).toBe(false);
    expect(result.unmatched).toEqual([
      scenario.expectedOutcomes[2], // time value within +/-3 minutes
      scenario.expectedOutcomes[4], // creation-time value within +/-3 minutes
      scenario.expectedOutcomes[6], // custom-data text includes lat/lng
    ]);
  });

  it("passes once those 3 assertions are rewritten as .should((el) => ...) callbacks", () => {
    const healedSource = oracleSource
      .replace(
        `cy.get('[data-cy="c8y-event-details--time-wrapper"]')
            .invoke('text')
            .then(text => {
              expect(dayjs(text).diff(dayjs().utc(), 'minutes')).to.be.within(-3, 3);
            });`,
        `cy.get('[data-cy="c8y-event-details--time-wrapper"]')
            .should((el) => {
              expect(dayjs(el.text()).diff(dayjs().utc(), 'minutes')).to.be.within(-3, 3);
            });`
      )
      .replace(
        `cy.get('[data-cy="c8y-event-details--creation-time-wrapper"]')
            .invoke('text')
            .then(text => {
              expect(dayjs(text).diff(dayjs().utc(), 'minutes')).to.be.within(-3, 3);
            });`,
        `cy.get('[data-cy="c8y-event-details--creation-time-wrapper"]')
            .should((el) => {
              expect(dayjs(el.text()).diff(dayjs().utc(), 'minutes')).to.be.within(-3, 3);
            });`
      )
      .replace(
        `cy.get('[data-cy="event-details-custom-data"]')
            .invoke('text')
            .then(text => {
              expect(text).to.include(\`\${eventObj.c8y_Position.lat}\`);
              expect(text).to.include(\`\${eventObj.c8y_Position.lng}\`);
            });`,
        `cy.get('[data-cy="event-details-custom-data"]')
            .should((el) => {
              expect(el.text()).to.include('52.534925');
              expect(el.text()).to.include('17.582658');
            });`
      );

    // Sanity check that all 3 replacements actually matched something in the
    // real file - if the oracle's formatting ever changes, this fails loudly
    // instead of silently testing against unmodified source.
    expect(healedSource).not.toBe(oracleSource);

    const result = checkAssertionTrace(scenario.expectedOutcomes, healedSource);
    expect(result).toEqual({ ok: true, unmatched: [] });
  });
});
