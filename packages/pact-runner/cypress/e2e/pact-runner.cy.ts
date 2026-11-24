import {
  C8yDefaultPact,
  C8yDefaultPactMatcher,
  getOptionsFromEnvironment,
} from "cumulocity-cypress/c8ypact";
import { C8yAjvJson6SchemaMatcher } from "cumulocity-cypress/contrib";

import { register as registerCypressGrep } from "@cypress/grep";
registerCypressGrep();

const { _ } = Cypress;

beforeEach(() => {
  Cypress.session.clearAllSavedSessions();
  Cypress.c8ypact.schemaMatcher = new C8yAjvJson6SchemaMatcher();
  if (Cypress.c8ypact.schemaMatcher != null) {
    C8yDefaultPactMatcher.schemaMatcher = Cypress.c8ypact.schemaMatcher;
  }
});

// Cypress 16 removed Cypress.env(). Reads like c8yEnv() of cumulocity-cypress, which
// the installed version might not have yet: Cypress.expose() first, Cypress.env() for
// variables that are not exposed. cypress.config.ts exposes _pacts.
function envValue(key: string): any {
  const cypress = Cypress as any;
  if (typeof cypress.expose === "function") {
    const exposed = cypress.expose();
    if (exposed != null && key in exposed) return exposed[key];
  }
  if (typeof cypress.env !== "function") return undefined;
  try {
    return cypress.env(key);
  } catch {
    // Cypress 15.10+ throws if allowCypressEnv is false
    return undefined;
  }
}

const pacts: string[] = envValue("_pacts");
if (!pacts || !_.isArray(pacts) || _.isEmpty(pacts)) {
  throw new Error("No pact records to run.");
}

const options = getOptionsFromEnvironment();
const pactObjects = pacts.map((item) => C8yDefaultPact.from(item));
Cypress.c8ypact.pactRunner?.run(pactObjects, options);
