import {
  C8yDefaultPactRunner,
  C8yDefaultPact,
  C8yDefaultPactRecord,
  getOptionsFromEnvironment,
} from "cumulocity-cypress/c8ypact";
import {
  basicAuthorization,
  stubEnv,
  url as _url,
} from "cypress/support/testutils";

const { _ } = Cypress;

describe("pact runner", () => {
  let runner: C8yDefaultPactRunner;

  const testToken =
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJPbmxpbmUgSldUIEJ1aWxkZXIiLCJpYXQiOjE3NTU5Nzc0NzUsImV4cCI6MTc4NzUxMzQ3NSwiYXVkIjoid3d3LmV4YW1wbGUuY29tIiwic3ViIjoianJvY2tldEBleGFtcGxlLmNvbSIsInhzcmZUb2tlbiI6IjIzNG5tMjM0bm0yMzQyMzQiLCJ0ZW4iOiJ0MTIzNDU2NyIsInVzZXIiOiJ0b2tlbnVzZXIiLCJiYXNlVXJsIjoiaHR0cHM6Ly9teXRlc3QuYzh5LmlvIn0.wKGIxJrUnT0NNyd198mfxegV6kncYsNFhGa6MFSSKCE";
  const serverXsrfToken = "pQWAHZQfhLRcDVqVsCjV";
  const serverAuthorizationCookie = "eyJhbGciOiJ";

  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TOKEN", undefined);
    Cypress.env("C8Y_TENANT", "t1234567");
    Cypress.env("C8Y_PACT_RUNNER_AUTH", undefined);
    Cypress.env("C8Y_PACT_MODE", "apply");
    runner = new C8yDefaultPactRunner();
  });

  context("getOptionsFromEnvironment", () => {
    it("should get runner options from environment - BasicAuth", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "BasicAuth",
      });
      const options = getOptionsFromEnvironment();
      expect(options.authType).to.eq("BasicAuth");
    });

    it("should get runner options from environment - CookieAuth", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "CookieAuth",
      });
      const options = getOptionsFromEnvironment();
      expect(options.authType).to.eq("CookieAuth");
    });

    it("should get runner options from environment - BearerAuth", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "BearerAuth",
      });
      const options = getOptionsFromEnvironment();
      expect(options.authType).to.eq("BearerAuth");
    });

    it("should handle case insensitive auth type - 1", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "bearerauth",
      });
      const options = getOptionsFromEnvironment();
      expect(options.authType).to.eq("bearerauth");
    });

    it("should handle case insensitive auth type - 2", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "BASICAUTH",
      });
      const options2 = getOptionsFromEnvironment();
      expect(options2.authType).to.eq("BASICAUTH");
    });

    it("should return undefined for invalid auth type", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "InvalidAuth",
      });
      const options = getOptionsFromEnvironment();
      expect(options.authType).to.be.undefined;
    });

    it("should get methods from environment", () => {
      stubEnv({
        C8Y_PACT_RUNNER_METHODS: "GET,POST",
      });
      const options = getOptionsFromEnvironment();
      expect(options.methods).to.deep.eq(["get", "post"]);
    });

    it("should get paths from environment", () => {
      stubEnv({
        C8Y_PACT_RUNNER_PATHS: "/inventory,/user",
      });
      const options = getOptionsFromEnvironment();
      expect(options.paths).to.deep.eq(["/inventory", "/user"]);
    });

    it("should handle array input for methods", () => {
      stubEnv({
        C8Y_PACT_RUNNER_METHODS: ["GET", "POST", "DELETE"],
      });
      const options = getOptionsFromEnvironment();
      expect(options.methods).to.deep.eq(["get", "post", "delete"]);
    });

    it("should handle array input for paths", () => {
      stubEnv({
        C8Y_PACT_RUNNER_PATHS: ["/alarm", "/event"],
      });
      const options = getOptionsFromEnvironment();
      expect(options.paths).to.deep.eq(["/alarm", "/event"]);
    });

    it("should prefer token over username/password when both available", () => {
      stubEnv({
        testuser_token: testToken,
        testuser_username: "testuser",
        testuser_password: "testpass",
      });

      cy.getAuth("testuser").then((auth) => {
        // Token should be present, username/password should be undefined
        expect(auth?.token).to.eq(testToken);
        expect(auth?.userAlias).to.eq("testuser");
      });
    });
  });

  describe("authentication handling", () => {
    // response mock. might be required for record matching in cy.c8yclient
    const responseMock = {
      status: 200,
      body: { tenant: "test-tenant" },
    };

    it("should use BearerAuth when token is available and no type is specified", () => {
      stubEnv({
        beareruser_token: testToken,
        beareruser_username: "beareruser",
        beareruser_password: "shouldBeIgnored",
      });
      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
            },
            responseMock,
            {},
            { userAlias: "beareruser" }
          ),
        ],
        {
          id: "bearer-test",
          title: ["Bearer Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "bearer-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );
      runner.runTest(pact, { authType: "BearerAuth" });

      cy.wait("@userRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property(
            "authorization",
            "Bearer " + testToken
          );
        });
    });

    it("should use BasicAuth when username and password are available and no type is specified", () => {
      stubEnv({
        basicuser_username: "basicuser",
        basicuser_password: "basicpass",
      });
      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
            },
            responseMock,
            {},
            { user: "basicuser", userAlias: "basicuser" }
          ),
        ],
        {
          id: "basic-test",
          title: ["Basic Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "basic-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );
      runner.runTest(pact, { authType: "BasicAuth" });

      cy.wait("@userRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property(
            "authorization",
            basicAuthorization("basicuser", "basicpass", "t1234567")
          );
        });
    });

    it("should use record authType when no options.authType is provided", () => {
      stubEnv({
        recorduser_username: "recorduser",
        recorduser_password: "recordpass",
      });
      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
              headers: { Authorization: "Basic test123" },
            },
            responseMock,
            {},
            { user: "recorduser", userAlias: "recorduser", type: "BasicAuth" }
          ),
        ],
        {
          id: "record-auth-test",
          title: ["Record Auth Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "record-auth-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );

      runner.runTest(pact); // No authType option

      cy.wait("@userRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property(
            "authorization",
            basicAuthorization("recorduser", "recordpass", "t1234567")
          );
        });
    });

    it("should prioritize C8Y_PACT_RUNNER_AUTH over record authType", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "BearerAuth",
        envuser_token: testToken,
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
              headers: { Authorization: "Basic shouldBeIgnored" },
            },
            responseMock,
            {},
            { user: "envuser", userAlias: "envuser", type: "BasicAuth" }
          ),
        ],
        {
          id: "env-auth-test",
          title: ["Env Auth Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "env-auth-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );

      runner.runTest(pact); // No options, should use env variable

      cy.wait("@userRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property(
            "authorization",
            "Bearer " + testToken
          );
        });
    });

    it("should prioritize options.authType over C8Y_PACT_RUNNER_AUTH", () => {
      stubEnv({
        C8Y_PACT_RUNNER_AUTH: "BasicAuth",
        optionuser_token: testToken,
        optionuser_username: "optionuser",
        optionuser_password: "optionpass",
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
            },
            responseMock,
            {},
            { user: "optionuser", userAlias: "optionuser" }
          ),
        ],
        {
          id: "option-auth-test",
          title: ["Option Auth Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "option-auth-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );
      runner.runTest(pact, { authType: "BearerAuth" }); // Should override env

      cy.wait("@userRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property(
            "authorization",
            "Bearer " + testToken
          );
        });
    });

    it("should handle CookieAuth with login", () => {
      stubEnv({
        cookieuser_username: "cookieuser",
        cookieuser_password: "cookiepass",
      });
      Cypress.session.clearAllSavedSessions();

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
              headers: { "X-XSRF-TOKEN": serverXsrfToken },
            },
            responseMock,
            {},
            { user: "cookieuser", userAlias: "cookieuser", type: "CookieAuth" }
          ),
        ],
        {
          id: "cookie-auth-test",
          title: ["Cookie Auth Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "cookie-auth-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );

      runner.runTest(pact, { authType: "CookieAuth" });
      cy.wait("@userRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property("x-xsrf-token", serverXsrfToken);
        });

      cy.getCookie("authorization").then((cookie) => {
        expect(cookie?.value).to.eq(serverAuthorizationCookie);
      });
      cy.getCookie("XSRF-TOKEN").then((cookie) => {
        expect(cookie?.value).to.eq(serverXsrfToken);
      });
    });

    it("should handle multiple users with different auth types", () => {
      stubEnv({
        user1_token: testToken,
        user1_username: "user1",
        user2_username: "user2",
        user2_password: "pass2",
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
            },
            responseMock,
            {},
            { userAlias: "user1" }
          ),
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
            },
            responseMock,
            {},
            { userAlias: "user2" }
          ),
        ],
        {
          id: "multi-user-test",
          title: ["Multi User Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "multi-user-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );

      runner.runTest(pact);

      cy.get("@userRequest.all").should("have.length", 2);
      // first request should have Bearer token, second should have Basic auth
      cy.get("@userRequest.all").then((calls: any) => {
        expect(calls[0].request.headers).to.have.property(
          "authorization",
          "Bearer " + testToken
        );
        expect(calls[1].request.headers).to.have.property(
          "authorization",
          basicAuthorization("user2", "pass2", "t1234567")
        );
      });
    });

    it("should fail for missing auth of configured type", (done) => {
      stubEnv({
        user2_username: "user2",
        user2_password: "pass2",
      });

      cy.once("fail", (err) => {
        expect(err.message).to.include(
          "Bearer auth configured for request, but token not found for user2."
        );
        done();
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/user/currentUser`,
            },
            responseMock,
            {},
            // Missing auth type, no token configured for user2, should throw error
            { userAlias: "user2", type: "BearerAuth" }
          ),
        ],
        {
          id: "fail-user-test",
          title: ["Fail User Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "fail-user-test"
      );

      cy.intercept("GET", "**/user/currentUser*", responseMock).as(
        "userRequest"
      );
      runner.runTest(pact);
    });

    it("should handle devicebootstrap special case", () => {
      stubEnv({
        devicebootstrap_username: "devicebootstrap",
        devicebootstrap_password: "devicepass",
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "POST",
              url: `${Cypress.config().baseUrl}/devicecontrol/deviceCredentials`,
              body: { id: "device123" },
            },
            {
              status: 201,
              body: { username: "device_test", password: "devicepassword" },
            },
            {},
            { user: "anyuser", userAlias: "anyuser" }
          ),
        ],
        {
          id: "devicebootstrap-test",
          title: ["Devicebootstrap Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "devicebootstrap-test"
      );

      cy.intercept("POST", "**/devicecontrol/deviceCredentials*", {
        statusCode: 201,
        body: { username: "device_test", password: "devicepassword" },
      }).as("deviceRequest");

      runner.runTest(pact, { authType: "BasicAuth" });

      cy.wait("@deviceRequest").then(() => {
        // Verify device credentials were stored in environment
        expect(Cypress.env("device_test_username")).to.eq("device_test");
        expect(Cypress.env("device_test_password")).to.eq("devicepassword");
      });
    });

    it("should use basic auth with global username and password", () => {
      stubEnv({
        C8Y_USERNAME: "globaluser",
        C8Y_PASSWORD: "globalpass",
      });
      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
            },
            responseMock,
            {}
            // No auth specified
          ),
        ],
        {
          id: "no-auth-test",
          title: ["No Auth Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "no-auth-test"
      );

      cy.intercept("GET", "**/tenant/currentTenant*", responseMock).as(
        "tenantRequest"
      );

      runner.runTest(pact, { authType: "BasicAuth" });

      cy.wait("@tenantRequest")
        .its("request.headers")
        .should((headers) => {
          expect(headers).to.have.property(
            "authorization",
            basicAuthorization("globaluser", "globalpass", "t1234567")
          );
        });
    });

    it("should throw if no authorization is provided", (done) => {
      cy.once("fail", (err) => {
        expect(err.message).to.include("Missing authentication.");
        done();
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
            },
            responseMock,
            {}
            // No auth specified
          ),
        ],
        {
          id: "no-auth-test",
          title: ["No Auth Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "no-auth-test"
      );

      cy.intercept("GET", "**/tenant/currentTenant*", responseMock).as(
        "tenantRequest"
      );
      runner.runTest(pact); // No auth type, no user
    });
  });

  describe("matching records ", () => {
    it("should throw if response and record do not match", (done) => {
      cy.once("fail", (err) => {
        expect(err.message).to.include("Pact validation failed!");
        done();
      });

      stubEnv({
        C8Y_TOKEN: testToken,
      });

      const pact = new C8yDefaultPact(
        [
          new C8yDefaultPactRecord(
            {
              method: "GET",
              url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
            },
            {
              status: 401,
              body: { error: "Unauthorized" },
            },
            {}
          ),
        ],
        {
          id: "no-match-test",
          title: ["No Match Test"],
          baseUrl: Cypress.config().baseUrl!,
        },
        "no-match-test"
      );

      cy.intercept("GET", "**/tenant/currentTenant*", {
        statusCode: 200,
        body: { name: "test-tenant" },
      }).as("tenantRequest");
      runner.runTest(pact);
    });
  });
});
