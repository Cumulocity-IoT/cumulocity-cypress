import { registerCypressGrep } from "cumulocity-cypress/c8yscrn/grep";

// c8yscrn (src/c8yscrn/cypress/screenshots.cy.js) registers @cypress/grep in the same
// way, when the spec is loaded. If @cypress/grep doesn't work with the installed
// Cypress version, e.g. @cypress/grep 5 with Cypress 16, which removed Cypress.env(),
// registering throws and no test of the spec runs.
registerCypressGrep();

describe("@cypress/grep", () => {
  it("should register with the installed Cypress version", () => {
    expect((Cypress as any).grep).to.be.a("function");
  });
});
