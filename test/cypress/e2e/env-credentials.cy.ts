import { C8yAuthOptions } from "cumulocity-cypress/c8ypact";
import { c8yEnv } from "cumulocity-cypress/shared/cypressenv";
import { basicAuthorization } from "../support/testutils";

// test/cypress.config.ts configures envcredentials_username and envcredentials_password
// in config.env, and the plugin with exposeCredentials: false. Before Cypress 15.10,
// there is no Cypress.expose() and cy.env(), and all variables are read with
// Cypress.env(), so exposeCredentials has no effect.
const describeWithExpose =
  typeof (Cypress as any).expose === "function" ? describe : describe.skip;

describeWithExpose("credentials configured in config.env", () => {
  let authInBefore: C8yAuthOptions | undefined;

  before(() => {
    cy.getAuth("envcredentials").then((auth) => {
      authInBefore = auth;
    });
  });

  it("should not expose credentials", () => {
    expect(Cypress.expose("envcredentials_password")).to.be.undefined;
    expect(Cypress.expose("envcredentials_username")).to.eq("envuser");
    expect(Cypress.expose("_c8yCredentialKeys")).to.include(
      "envcredentials_password"
    );
  });

  it("should read credentials with cy.env()", () => {
    expect(c8yEnv("envcredentials_password")).to.eq("envpassword");
    cy.getAuth("envcredentials").then((auth) => {
      expect(auth).to.deep.include({
        user: "envuser",
        password: "envpassword",
        userAlias: "envcredentials",
      });
    });
  });

  it("should read credentials in before hooks", () => {
    expect(authInBefore).to.deep.include({
      user: "envuser",
      password: "envpassword",
    });
  });

  it(
    "should prefer credentials set with Cypress.expose()",
    { expose: { envcredentials_password: "exposedpassword" } },
    () => {
      cy.getAuth("envcredentials").then((auth) => {
        expect(auth?.password).to.eq("exposedpassword");
      });
    }
  );

  it(
    "should send credentials read with cy.env()",
    { auth: "envcredentials" },
    () => {
      cy.request("/my/test/request").then((response) => {
        expect(response.body.request.auth).to.eq(
          basicAuthorization("envuser", "envpassword")
        );
      });
    }
  );
});
