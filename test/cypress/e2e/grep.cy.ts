import { register as registerCypressGrep } from "@cypress/grep";

// c8yscrn (src/c8yscrn/cypress/screenshots.cy.js) and the pact runner
// (packages/pact-runner/cypress/e2e/pact-runner.cy.ts) register @cypress/grep in the
// same way, when the spec is loaded. If the installed @cypress/grep doesn't support the
// installed Cypress version, e.g. @cypress/grep 5 with Cypress 16, which removed
// Cypress.env(), registering throws and no test of the spec runs.
registerCypressGrep();

describe("@cypress/grep", () => {
  it("should register with the installed Cypress version", () => {
    expect(Cypress.grep).to.be.a("function");
  });
});
