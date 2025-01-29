import {
  C8yDefaultPact,
  C8yDefaultPactMatcher,
} from "cumulocity-cypress/c8ypact";
import { C8yAjvJson6SchemaMatcher } from "cumulocity-cypress/contrib/ajv";

const { _ } = Cypress;

beforeEach(() => {
  Cypress.session.clearAllSavedSessions();
  Cypress.c8ypact.schemaMatcher = new C8yAjvJson6SchemaMatcher();
  C8yDefaultPactMatcher.schemaMatcher = Cypress.c8ypact.schemaMatcher;
});

const pacts: string[] = Cypress.env("_pacts");
if (!pacts || !_.isArray(pacts) || _.isEmpty(pacts)) {
  throw new Error("No pact records to run.");
}

const pactObjects = pacts.map((item) => {
  return C8yDefaultPact.from(item);
});

Cypress.c8ypact.pactRunner?.run(pactObjects);
