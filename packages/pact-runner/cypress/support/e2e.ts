import "cumulocity-cypress/lib/commands/";
import "cumulocity-cypress/c8ypact";
import "cumulocity-cypress/lib/commands/oauthlogin";

before(() => {
  // cache tenant id in C8Y_TENANT
  cy.getAuth("admin").getTenantId({ ignorePact: true });
  cy.getAuth("admin").getSystemVersion({ ignorePact: true });
});
