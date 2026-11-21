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

// Cypress 16 removed Cypress.env(): read with Cypress.env() if available, otherwise with
// Cypress.expose(). configureC8yPlugin() exposes config.env, including _pacts.
function envValue(key: string): any {
  const cypress = Cypress as any;
  if (typeof cypress.env === "function") {
    try {
      const value = cypress.env(key);
      if (value !== undefined) return value;
    } catch {
      // Cypress 15.10+ throws if allowCypressEnv is false
    }
  }
  return typeof cypress.expose === "function" ? cypress.expose(key) : undefined;
}

const pacts: string[] = envValue("_pacts");
if (!pacts || !_.isArray(pacts) || _.isEmpty(pacts)) {
  throw new Error("No pact records to run.");
}

const options = getOptionsFromEnvironment();
const pactObjects = pacts.map((item) => C8yDefaultPact.from(item));
Cypress.c8ypact.pactRunner?.run(pactObjects, options);
