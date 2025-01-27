import {
  BasicAuth,
  BearerAuth,
  Client,
  ICurrentTenant,
  IManagedObject,
  IResult,
} from "@c8y/client";
import {
  expectC8yClientRequest,
  getConsolePropsForLogSpy,
  initRequestStub,
  stubEnv,
  stubResponse,
  stubResponses,
} from "../support/testutils";
import {
  defaultClientOptions,
  isArrayOfFunctions,
} from "../../../src/lib/commands/c8yclient";
import {
  isIResult,
  isWindowFetchResponse,
  toCypressResponse,
  isCypressError,
  C8yDefaultPactMatcher,
  isCypressResponse,
} from "cumulocity-cypress/c8ypact";

import {
  C8yAjvJson6SchemaMatcher,
  C8yAjvSchemaMatcher,
} from "cumulocity-cypress/contrib/ajv";

const { _, sinon } = Cypress;

declare global {
  interface Window {
    fetchStub: Cypress.Agent<sinon.SinonStub>;
  }
}

describe("c8yclient", () => {
  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_PLUGIN_LOADED", undefined);
    Cypress.env("C8Y_C8YCLIENT_TIMEOUT", undefined);

    Cypress.c8ypact.schemaMatcher = new C8yAjvJson6SchemaMatcher();
    C8yDefaultPactMatcher.schemaMatcher = Cypress.c8ypact.schemaMatcher;

    initRequestStub();
    stubResponses([
      new window.Response(JSON.stringify({ name: "t123456789" }), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
      new window.Response("{}", {
        status: 201,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
      new window.Response("{}", {
        status: 202,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    ]);
  });

  context("general", function () {
    it("should return client without clientFn", function () {
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t12345678" })
        .c8yclient()
        .then((client) => {
          expect(client).not.to.be.undefined;
          expect(client.core.tenant).to.equal("t12345678");
        });
    });

    it("should return client without clientFn and get current tenant", function () {
      stubResponse(
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        })
      );

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient()
        .then((client) => {
          expect(client).not.to.be.undefined;
          expect(client.core.tenant).to.equal("t123456");
        });
    });
  });

  context("response object", () => {
    it("should return cy.request response object", () => {
      // pass tenant in C8yAuthOptions or there will be 2 requests
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t1234" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current())
        .then((response) => {
          expect(response.status).to.eq(200);
          expect(response.body).to.not.be.undefined;
          expect(response.body.name).to.eq("t123456789");
          expect(response.requestHeaders).to.not.be.empty;
          expect(response.headers).to.not.be.empty;
          expect(response.statusText).to.eq("OK");
          expect(response.isOkStatusCode).to.eq(true);
          expect(response.duration).to.not.be.undefined;
        });
    });
  });

  context("authentication", () => {
    const requestOptions = {
      url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
      auth: { user: "admin", password: "mypassword", tenant: "t1234" },
      headers: { UseXBasic: true },
    };

    it("should use auth from previous subject", () => {
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t1234" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current())
        .then((response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest(requestOptions);
        });
    });

    it("should use wrapped auth from previous subject", () => {
      cy.wrap({ user: "admin", password: "mypassword", tenant: "t1234" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current())
        .then((response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest(requestOptions);
        });
    });

    it(
      "should update auth of restored client",
      { auth: { user: "admin", password: "mypassword", tenant: "t1234" } },
      () => {
        const bootstrap = {
          user: "bootstrap",
          password: "bootstrapassword",
          tenant: "t1234",
        };
        const recreateStub = (status: number) => {
          window.fetchStub.reset();
          stubResponse(
            new window.Response("{}", {
              status: status,
              statusText: "OK",
              headers: { "content-type": "application/json" },
            })
          );
        };

        recreateStub(200);
        cy.c8yclient<ICurrentTenant>((client) => client.tenant.current()).then(
          (response) => {
            expect(response.status).to.eq(200);
            expectC8yClientRequest(requestOptions);
            recreateStub(201);
          }
        );
        cy.getAuth(bootstrap)
          .c8yclient<ICurrentTenant>((client) => client.tenant.current())
          .then((response) => {
            expect(response.status).to.eq(201);
            expectC8yClientRequest({ ...requestOptions, auth: bootstrap });
            recreateStub(202);
          });

        cy.c8yclient<ICurrentTenant>((client) => client.tenant.current()).then(
          (response) => {
            expect(response.status).to.eq(202);
            expectC8yClientRequest(requestOptions);
          }
        );
      }
    );

    it("should use auth from options", () => {
      stubEnv({ C8Y_TENANT: "t1234" });
      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
        auth: new BearerAuth("mytoken"),
      }).then((response) => {
        expect(response.status).to.eq(200);
        expectC8yClientRequest({
          headers: {
            Authorization: "Bearer mytoken",
          },
          url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
        });
      });
    });

    it("should use auth from options and overwrite cookie", () => {
      stubEnv({ C8Y_TENANT: "t1234" });
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");
      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
        auth: new BearerAuth("mytoken"),
      }).then((response) => {
        expect(response.status).to.eq(200);
        expectC8yClientRequest({
          headers: {
            Authorization: "Bearer mytoken",
          },
          url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
        });
      });
    });

    it("should prefer CookieAuth over C8Y_USERNAME env variables", () => {
      stubEnv({
        C8Y_TENANT: "t1234",
        C8Y_USERNAME: "admin",
        C8Y_PASSWORD: "password",
      });
      const token = "fsETfgIBdAnEyOLbADTu22";
      cy.setCookie("XSRF-TOKEN", token);
      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current()).then(
        (response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest({
            headers: {
              "X-XSRF-TOKEN": token,
            },
            url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
          });
        }
      );
    });

    it("should use client from options", () => {
      const expectedOptions = _.cloneDeep(requestOptions);
      expectedOptions.auth = {
        user: "admin12",
        password: "password",
        tenant: "t12345",
      };
      const client = new Client(new BasicAuth(expectedOptions.auth));

      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
        client,
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(_.get(response.requestHeaders, "X-XSRF-TOKEN")).to.be.undefined;
        expectC8yClientRequest(expectedOptions);
      });
    });

    it("useAuth should not overwrite auth from client in options", () => {
      const expectedOptions = _.cloneDeep(requestOptions);
      expectedOptions.auth = {
        user: "admin12",
        password: "password",
        tenant: "t12345",
      };
      const client = new Client(new BasicAuth(expectedOptions.auth));

      cy.useAuth({ user: "test", password: "test", tenant: "t287364872364" });
      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
        client,
      }).then((response) => {
        expectC8yClientRequest(expectedOptions);
      });
    });

    it("getAuth should not overwrite auth from client in options", () => {
      const expectedOptions = _.cloneDeep(requestOptions);
      const cAuth = { user: "admin12", password: "password", tenant: "t1" };
      const client = new Client(new BasicAuth(cAuth));

      const auth = { user: "test", password: "test", tenant: "t287364872364" };
      expectedOptions.auth = auth;
      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
          client,
        })
        .then((response) => {
          expectC8yClientRequest(expectedOptions);
        });
    });

    it("should not use basic auth if cookie auth is available", () => {
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");

      const expectedOptions = _.cloneDeep(_.omit(requestOptions, "auth"));
      _.extend(expectedOptions.headers, {
        "X-XSRF-TOKEN": "fsETfgIBdAnEyOLbADTu22",
      });

      stubEnv({ C8Y_TENANT: "t1234" });
      cy.useAuth({ user: "admin", password: "mypassword" });
      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current()).then(
        (response) => {
          expect(response.status).to.eq(200);
          // Client uses both, Basic and Cookie auth, if available
          expect(_.get(response.requestHeaders, "X-XSRF-TOKEN")).not.to.be
            .undefined;
          expect(_.get(response.requestHeaders, "Authorization")).to.be
            .undefined;

          expectC8yClientRequest(expectedOptions);
        }
      );
    });

    it("should prefer basic auth over cookie if basic auth is previousSubject", () => {
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");

      const expectedOptions = _.cloneDeep(requestOptions);
      // BasicAuth also adds X-XSRF-TOKEN header
      _.extend(expectedOptions.headers, {
        "X-XSRF-TOKEN": "fsETfgIBdAnEyOLbADTu22",
      });

      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t1234" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current())
        .then((response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest(expectedOptions);
        });
    });

    it("should use cookie with undefined wrapped previous subject", () => {
      Cypress.env("C8Y_TENANT", "t1234");
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");

      const expectedOptions = _.cloneDeep(_.omit(requestOptions, "auth"));
      _.extend(expectedOptions.headers, {
        "X-XSRF-TOKEN": "fsETfgIBdAnEyOLbADTu22",
      });

      cy.wrap(undefined)
        .c8yclient<ICurrentTenant>((client) => client.tenant.current())
        .then((response) => {
          expect(response.status).to.eq(200);
          // Client uses both, Basic and Cookie auth, if available
          expect(_.get(response.requestHeaders, "X-XSRF-TOKEN")).not.to.be
            .undefined;
          expect(_.get(response.requestHeaders, "Authorization")).to.be
            .undefined;

          expectC8yClientRequest(expectedOptions);
        });
    });

    it("should force basic auth if preferBasicAuth is enabled", () => {
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");

      // Client uses both, Basic and Cookie auth if both are present
      // see BasicAuth.getFetchOptions()
      const expectedOptions = _.cloneDeep(requestOptions);
      _.extend(expectedOptions.headers, {
        "X-XSRF-TOKEN": "fsETfgIBdAnEyOLbADTu22",
      });

      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t1234" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
          preferBasicAuth: true,
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest(expectedOptions);
        });
    });

    it("should use tenant from environment", () => {
      Cypress.env("C8Y_TENANT", "t1234");

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((client) => {
          expect(client.core.tenant).to.equal("t1234");
          return client.tenant.current();
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          expectC8yClientRequest(requestOptions);
        });
    });

    it("should use tenant from client authentication", () => {
      Cypress.env("C8Y_TENANT", undefined);

      const expectedOptions = [
        {
          url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
          auth: { user: "admin", password: "mypassword" },
          headers: { UseXBasic: true },
        },
        {
          url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
          auth: { user: "admin", password: "mypassword" },
          headers: { UseXBasic: true },
        },
      ];

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((client) => {
          expect(client.core.tenant).to.eq("t123456789");
          return client.tenant.current();
        })
        .then((response) => {
          expect(response.status).to.eq(201);
          expectC8yClientRequest(expectedOptions);
        });
    });

    it("should use cookie auth from xsrf token without tenant", () => {
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu");
      const expectedOptions = [
        {
          url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
          headers: {
            UseXBasic: true,
            "X-XSRF-TOKEN": "fsETfgIBdAnEyOLbADTu",
          },
        },
        {
          url: `${Cypress.config().baseUrl}/tenant/currentTenant`,
          headers: {
            UseXBasic: true,
            "X-XSRF-TOKEN": "fsETfgIBdAnEyOLbADTu",
          },
        },
      ];
      cy.c8yclient<ICurrentTenant>((client) => {
        expect(client.core.tenant).to.eq("t123456789");
        return client.tenant.current();
      }).then((response) => {
        expect(response.status).to.eq(201);
        expect(_.get(response.requestHeaders, "Authorization")).to.be.undefined;
        expectC8yClientRequest(expectedOptions);
      });
    });

    it("fails with error if no auth or cookie is provided", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Missing authentication");
        expect(window.fetchStub).to.not.have.been.called;
        done();
      });

      cy.c8yclient<ICurrentTenant>((client) => client.tenant.current());
    });
  });

  context("debug logging", () => {
    it("should log username of basic auth and cookie auth users", () => {
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");
      Cypress.env("C8Y_LOGGED_IN_USER", "testuser");

      cy.spy(Cypress, "log").log(false);

      cy.getAuth({ user: "admin3", password: "mypassword", tenant: "t12345" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current())
        .then((response) => {
          const spy = Cypress.log as sinon.SinonSpy;
          const consoleProps = getConsolePropsForLogSpy(spy, "c8yclient");
          expect(consoleProps.CookieAuth).to.eq(
            "XSRF-TOKEN fsETfgIBdAnEyOLbADTu22 (testuser)"
          );
          expect(consoleProps.BasicAuth).to.eq(
            "Basic dDEyMzQ1L2FkbWluMzpteXBhc3N3b3Jk (t12345/admin3)"
          );
        });
    });
  });

  context("schema matching", () => {
    const schema = {
      schema: {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
        },
      },
    };

    const auth = {
      user: "admin",
      password: "mypassword",
      tenant: "t12345678",
    };

    it("should use schema for matching response", () => {
      const spy = cy.spy(Cypress.c8ypact.schemaMatcher!, "match");
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "t12345678" })
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(spy).to.have.been.calledOnce;
        });
    });

    it("should fail if schema does not match response", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Matching schema failed. Error:");
        expect(err.message).to.contain("data/name must be number");
        done();
      });

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema: {
            type: "object",
            properties: {
              name: {
                type: "number",
              },
            },
          },
        })
        .then(() => {
          // @ts-expect-error
          const spy = Cypress.c8ypact.matcher.schemaMatcher
            .match as sinon.SinonSpy;
          expect(spy).to.have.been.calledOnce;
        });
    });

    it("should use schema if pact mode is disabled with default schema matcher", () => {
      Cypress.env("C8Y_PACT_MODE", undefined);
      expect(Cypress.c8ypact.isEnabled()).to.be.false;

      cy.stub(Cypress.c8ypact, "schemaMatcher").value(undefined);
      const logSpy: sinon.SinonSpy = cy.spy(Cypress, "log").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          schemaMatcher: undefined,
        })
        .then(() => {
          const props = getConsolePropsForLogSpy(logSpy, "c8ymatch");
          expect(props?.matcher).to.not.be.undefined;
          expect(props.matcher.constructor.name).to.eq(
            C8yAjvSchemaMatcher.prototype.constructor.name
          );
        });
    });

    it("should use custom schema matcher if pact mode is disabled", () => {
      Cypress.env("C8Y_PACT_MODE", undefined);
      expect(Cypress.c8ypact.isEnabled()).to.be.false;
      const logSpy: sinon.SinonSpy = cy.spy(Cypress, "log").log(false);
      cy.stub(Cypress.c8ypact, "schemaMatcher").returns(undefined);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          schemaMatcher: new C8yAjvJson6SchemaMatcher(),
        })
        .then(() => {
          const props = getConsolePropsForLogSpy(logSpy, "c8ymatch");
          expect(props?.matcher).to.not.be.undefined;
          expect(props.matcher.constructor.name).to.eq(
            C8yAjvJson6SchemaMatcher.prototype.constructor.name
          );
        });
    });
  });

  context("chaining of c8yclient requests", () => {
    beforeEach(() => {
      Cypress.env("C8Y_TENANT", "t123456789");
    });

    it("should recreate client instance when chaining", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(201);
        });
    });

    it("should create client for chain and query current tenant", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      Cypress.env("C8Y_TENANT", undefined);
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          expect(c.core.tenant).to.equal("t123456");
          return c.inventory.detail(1, { withChildren: false });
        })
        .c8yclient<IManagedObject>((c, response) => {
          expect(response.status).to.eq(200);
          expect(c.core.tenant).to.equal("t123456");
          return c.inventory.detail(2, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(201);
        });
    });

    it("should create client for chain with tenant from env", () => {
      stubResponses([
        new window.Response("{}", {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      Cypress.env("C8Y_TENANT", "t123456");
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          expect(c.core.tenant).to.equal("t123456");
          return c.inventory.detail(1, { withChildren: false });
        })
        .c8yclient<IManagedObject>((c, response) => {
          expect(response.status).to.eq(200);
          expect(c.core.tenant).to.equal("t123456");
          return c.inventory.detail(2, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(201);
        });
    });

    it("should pass result of previous client request as optional argument", () => {
      Cypress.env("C8Y_TENANT", undefined);
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient((c) => c.tenant.current())
        .c8yclient(
          (c, tenantResponse: Cypress.Response<IResult<ICurrentTenant>>) => {
            expect(tenantResponse).to.not.be.undefined;
            expect(tenantResponse.status).to.eq(201);
            return c.inventory.detail(1, { withChildren: false });
          }
        )
        .then((response) => {
          expect(response.status).to.eq(202);
        });
    });

    it("should work with array of service functions", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient([
          (c) => c.tenant.current(),
          (c, tenantResponse) => {
            expect(tenantResponse).to.not.be.undefined;
            expect(tenantResponse.status).to.eq(200);
            return c.inventory.detail(1, { withChildren: false });
          },
        ])
        .then((response) => {
          expect(response.status).to.eq(201);
        });
    });

    it("should save client in state", () => {
      Cypress.env("C8Y_TENANT", undefined);
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      cy.setCookie("XSRF-TOKEN", "abcdefgh12345");
      cy.c8yclient<ICurrentTenant>((c) => c.tenant.current());
      cy.c8yclient((c) => {
        expect(c.core.tenant).to.equal("t123456");
        return c.inventory.detail(1, { withChildren: false });
      }).then((response) => {
        expect(response.status).to.eq(201);
      });
    });
  });

  context("promise array client functions", () => {
    beforeEach(() => {
      // Cypress.env("C8Y_TENANT", "t123456789");
    });

    it("should resolve array of promises from service function", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 203,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      cy.getAuth({
        user: "admin",
        password: "mypassword",
      })
        .c8yclient((c) => [
          c.inventory.detail(1, { withChildren: false }),
          c.inventory.detail(2, { withChildren: false }),
        ])
        .then((response) => {
          expect(response).to.not.be.empty;
          expect(response).to.have.lengthOf(2);
          expect(response[0].status).to.eq(202);
          expect(response[1].status).to.eq(203);
        });
    });
  });

  context("error responses", () => {
    const error = {
      error: "userManagement/Forbidden",
      message: "authenticated user's tenant different from the one in URL path",
      info: "https://www.cumulocity.com/guides/reference/rest-implementation//#a-name-error-reporting-a-error-reporting",
    };

    beforeEach(() => {
      Cypress.env("C8Y_TENANT", "t123456789");
    });

    it("should catch and process Cumulocity error response", (done) => {
      stubResponse(
        new window.Response(JSON.stringify(error), {
          status: 404,
          statusText: "Not found",
          headers: { "content-type": "application/json" },
        })
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with");
        expect(err.message).to.contain('"error": "userManagement/Forbidden"');
        expect(window.fetchStub).to.have.been.calledOnce;
        done();
      });

      cy.getAuth({
        user: "admin",
        password: "mypassword",
      }).c8yclient<ICurrentTenant>((client) => client.tenant.current());
    });

    it("should catch and process generic error response", (done) => {
      stubResponse(
        new window.Response("Resource not found!!!", {
          status: 404,
          statusText: "Not found",
          headers: { "content-type": "application/text" },
        })
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with");
        expect(err.message).to.contain("Resource not found!!!");
        expect(window.fetchStub).to.have.been.calledOnce;
        done();
      });

      cy.getAuth({
        user: "admin",
        password: "mypassword",
      }).c8yclient<ICurrentTenant>((client) => client.tenant.current());
    });

    it("should not throw on 404 response with failOnStatusCode false", () => {
      stubResponse(
        new window.Response(JSON.stringify(error), {
          status: 404,
          statusText: "Not found",
          headers: { "content-type": "application/json" },
        })
      );

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((client) => client.tenant.current(), {
          failOnStatusCode: false,
        })
        .then((response) => {
          expect(response.status).to.eq(404);
          expect(response.statusText).to.eq("Not found");
          expect(response.headers).to.deep.eq({
            "content-type": "application/json",
          });
        });
    });

    // https://github.com/Cumulocity-IoT/cumulocity-cypress/issues/1
    it("should wrap client authentication errors into CypressError", (done) => {
      stubResponse(
        new window.Response(
          "Error occurred while trying to proxy: localhost:9000/tenant/currentTenant",
          {
            status: 504,
            statusText: "Gateway Timeout",
          }
        )
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with: 504");
        expect(err.message).to.contain("Gateway Timeout");
        expect(err.message).to.contain(
          "Error occurred while trying to proxy: localhost:9000/tenant/currentTenant"
        );
        expect(window.fetchStub).to.have.been.calledOnce;
        done();
      });

      cy.getAuth({
        user: "admin",
        password: "mypassword",
      }).c8yclient<ICurrentTenant>((client) => client.tenant.current());
    });
  });

  context("fetch responses", () => {
    const requestOptions = {
      url: `${Cypress.config().baseUrl}/user/t123456789/groupByName/business`,
      auth: { user: "admin", password: "mypassword", tenant: "t123456789" },
      headers: { UseXBasic: true },
    };
    beforeEach(() => {
      Cypress.env("C8Y_TENANT", "t123456789");
    });

    it("should return cy.request response object", () => {
      stubResponse(
        new window.Response(JSON.stringify({ name: "t123456789" }), {
          status: 200,
          statusText: "OK",
          headers: {},
        })
      );

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => {
          expect(c.core.tenant).to.not.be.undefined;
          return c.core.fetch(
            "/user/" + c.core.tenant + "/groupByName/business"
          );
        })
        .then((response) => {
          expect(window.fetchStub).to.have.been.calledOnce;
          expect(response.status).to.eq(200);
          expect(response.body).to.not.be.undefined;
          expect(response.body.name).to.eq("t123456789");
          expect(response.requestHeaders).to.not.be.empty;
          expect(response.headers).to.not.be.empty;
          expect(response.statusText).to.eq("OK");
          expect(response.isOkStatusCode).to.eq(true);
          expect(response.duration).to.not.be.undefined;
          expectC8yClientRequest(requestOptions);
        });
    });
  });

  context("timeout", () => {
    const user = { user: "admin", password: "mypwd", tenant: "t1234" };

    it("should use cypress responseTimeout as default timeout", () => {
      expect(defaultClientOptions().timeout).to.eq(
        Cypress.config().responseTimeout
      );
    });

    it("should fail with timeout", (done) => {
      Cypress.env("C8Y_C8YCLIENT_TIMEOUT", 1000);
      expect(defaultClientOptions().timeout).to.eq(1000);

      stubResponse(
        new window.Response(JSON.stringify({ name: "t123456789" }), {
          status: 200,
          statusText: "OK",
          headers: {},
        }),
        0,
        4000
      );

      const start = Date.now();

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("timed out after waiting");
        expect(Date.now() - start)
          .to.be.lessThan(2000)
          .and.greaterThan(990);
        done();
      });

      cy.getAuth(user).c8yclient<ICurrentTenant>((c) => {
        return c.tenant.current();
      });
    });

    it("should not fail with timeout", () => {
      Cypress.env("C8Y_C8YCLIENT_TIMEOUT", 3000);
      expect(defaultClientOptions().timeout).to.eq(3000);

      stubResponse(
        new window.Response(JSON.stringify({ name: "t123456789" }), {
          status: 200,
          statusText: "OK",
          headers: {},
        }),
        0,
        2000
      );

      const start = Date.now();
      cy.getAuth(user)
        .c8yclient<ICurrentTenant>((c) => {
          return c.tenant.current();
        })
        .then((response) => {
          expect(response.status).to.eq(200);
          expect(Date.now() - start)
            .to.be.lessThan(3000)
            .and.greaterThan(2000);
        });
    });
  });

  context("fetch requests", () => {
    beforeEach(() => {
      Cypress.env("C8Y_TENANT", "t123456789");
      stubResponse(
        new window.Response(JSON.stringify({ test: "test" }), {
          status: 299,
          statusText: "OK",
          headers: {},
        })
      );
    });

    it("should remove content-type from tenant/currentTenant request", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => {
          return c.tenant.current();
        })
        .then((response) => {
          expect(response.status).to.eq(299);
          expect(response.requestHeaders).to.not.have.property("content-type");
        });
    });

    it("should add missing content-type if request has body", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => {
          return c.core.fetch("/inventory/managedObjects", {
            method: "POST",
            body: JSON.stringify({ name: "test" }),
          });
        })
        .then((response) => {
          expect(response.status).to.eq(299);
          expect(response.requestHeaders).to.have.property(
            "content-type",
            "application/json"
          );
        });
    });

    it("should not overwrite content-type if request has body", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => {
          return c.core.fetch("/inventory/managedObjects", {
            method: "POST",
            body: JSON.stringify({ name: "test" }),
            headers: {
              "content-type": "application/xml",
            },
          });
        })
        .then((response) => {
          expect(response.status).to.eq(299);
          expect(response.requestHeaders).to.have.property(
            "content-type",
            "application/xml"
          );
        });
    });

    it("should not add content-type if request has no body", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => {
          return c.core.fetch("/inventory/managedObjects", {
            method: "POST",
          });
        })
        .then((response) => {
          expect(response.status).to.eq(299);
          expect(response.requestHeaders).to.not.have.property(
            "content-type",
            "application/json"
          );
        });
    });

    it("should not add content-type for get requests without body", () => {
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<ICurrentTenant>((c) => {
          return c.core.fetch("/inventory/managedObjects", {
            method: "GET",
          });
        })
        .then((response) => {
          expect(response.status).to.eq(299);
          expect(response.requestHeaders).to.not.have.property(
            "content-type",
            "application/json"
          );
        });
    });
  });

  context("toCypressResponse", () => {
    it("should not fail for undefined response", () => {
      const response = toCypressResponse(
        // @ts-expect-error
        undefined,
        0,
        {},
        "http://example.com"
      );
      expect(response).to.be.undefined;
    });

    // could / should be extended. toCypressResponse() is base of all c8yclient features
    it("should return a Cypress.Response when given a Partial<Response>", () => {
      const partialResponse: Partial<Response> = {
        status: 200,
        ok: true,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        data: {},
        requestBody: { id: "10101" },
        method: "PUT",
      };

      const response = toCypressResponse(
        partialResponse,
        1234,
        {},
        "http://example.com"
      );
      expect(response).to.have.property("status", 200);
      expect(response).to.have.property("isOkStatusCode", true);
      expect(response).to.have.property("statusText", "OK");
      expect(response).to.have.property("headers").that.is.an("object");
      expect(response).to.have.property("duration", 1234);
      expect(response).to.have.property("url", "http://example.com");
      expect(response)
        .to.have.property("allRequestResponses")
        .that.is.an("array");
      expect(response?.body).to.deep.eq({});
      expect(response?.requestBody).to.deep.eq({ id: "10101" });
      expect(response).to.have.property("method", "PUT");
    });

    it("should return responseObject Cypress.Response", () => {
      const r: IResult<any> = {
        res: new window.Response(JSON.stringify({ name: "t1234" }), {
          status: 404,
          statusText: "Error",
          headers: { "content-type": "application/json" },
        }),
        data: {},
      };

      r.res.responseObj = {
        status: 404,
        statusText: "Error",
        isOkStatusCode: false,
        requestBody: {},
        method: "PUT",
        duration: 0,
        url: "http://example.com",
        body: {},
      };

      const response = toCypressResponse(r, 0, {}, "http://example.com");
      expect(response).to.have.property("status", 404);
      expect(response).to.have.property("isOkStatusCode", false);
      expect(response).to.have.property("statusText", "Error");
      expect(response).to.have.property("duration", 0);
      expect(response).to.have.property("url", "http://example.com");
      expect(response?.body).to.deep.eq({});
      expect(response?.requestBody).to.deep.eq({});
      expect(response).to.have.property("method", "PUT");
    });

    it("should use responseObj and include method", () => {
      const obj = {
        res: new window.Response(JSON.stringify({ name: "t1234" }), {
          status: 200,
          statusText: "OK",
        }),
        data: {
          id: "abc123124",
        },
      };
      obj.res.responseObj = {
        method: "POST",
        status: 201,
        isOkStatusCode: true,
        statusText: "Created",
      };

      const response = toCypressResponse(obj, 0, {}, "http://example.com");
      expect(response).to.have.property("method", "POST");
      expect(response).to.have.property("status", 201);
    });
  });

  context("c8yclient typeguards", () => {
    const windowResponse = new window.Response(
      JSON.stringify({ name: "t1234" }),
      {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }
    );

    const cypressResponse: Cypress.Response<any> = {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: {},
      duration: 0,
      url: "http://example.com",
      allRequestResponses: [],
      isOkStatusCode: true,
      requestHeaders: {},
    };

    const iResultObject: IResult<any> = {
      data: {},
      res: windowResponse,
    };

    it("isCypressResponse validates undefined and empty", () => {
      expect(isCypressResponse(undefined)).to.be.false;
      expect(isCypressResponse({})).to.be.false;
    });

    it("isCypressResponse validates complete response object", () => {
      expect(isCypressResponse(cypressResponse)).to.be.true;
    });

    it("isCypressResponse does not validate partial response object", () => {
      const response: Partial<Cypress.Response<any>> = {
        status: 200,
        url: "http://example.com",
        allRequestResponses: [],
        isOkStatusCode: true,
        requestHeaders: {},
      };

      expect(isCypressResponse(response)).to.be.false;
    });

    it("isCypressResponse does not validate window.Response and IResult", () => {
      expect(isCypressResponse(windowResponse)).to.be.false;
      expect(isCypressResponse(iResultObject)).to.be.false;
    });

    it("isWindowFetchResponse validates undefined end empty", () => {
      expect(isWindowFetchResponse(undefined)).to.be.false;
      expect(isWindowFetchResponse({})).to.be.false;
    });

    it("isWindowFetchResponse validates complete response object", () => {
      expect(isWindowFetchResponse(windowResponse)).to.be.true;
    });

    it("isWindowFetchResponse does not validate Cypress.Response and IResult", () => {
      expect(isWindowFetchResponse(cypressResponse)).to.be.false;
      expect(isWindowFetchResponse(iResultObject)).to.be.false;
    });

    it("isIResult validates undefined and empty", () => {
      expect(isIResult(undefined)).to.be.false;
      expect(isIResult({})).to.be.false;
    });

    it("isIResult validates complete IResult object", () => {
      expect(isIResult(iResultObject)).to.be.true;
    });

    it("isIResult does not validate with incomplete res object", () => {
      const response: IResult<any> = {
        data: {},
        // @ts-expect-error
        res: {
          status: 200,
          statusText: "OK",
        },
      };

      expect(isIResult(response)).to.be.false;
    });

    it("isIResult does not validate Cypress.Response and window.Response", () => {
      expect(isIResult(cypressResponse)).to.be.false;
      expect(isIResult(windowResponse)).to.be.false;
    });

    it("isArrayOfFunctions validates undefined and empty", () => {
      // @ts-expect-error
      expect(isArrayOfFunctions(undefined)).to.be.false;
      expect(isArrayOfFunctions([])).to.be.false;
    });

    it("isArrayOfFunctions validates array of functions", () => {
      // @ts-expect-error
      expect(isArrayOfFunctions([() => {}, () => {}])).to.be.true;
      // @ts-expect-error
      expect(isArrayOfFunctions([() => {}, "test"])).to.be.false;
    });

    it("isCypressError validates error object with name CypressError", () => {
      const error = new Error("test");
      error.name = "CypressError";
      expect(isCypressError(error)).to.be.true;
    });

    it("isCypressError does not validate error object without name", () => {
      const error = new Error("test");
      expect(isCypressError(error)).to.be.false;
    });

    it("isCypressError validates undefined and empty", () => {
      expect(isCypressError(undefined)).to.be.false;
      expect(isCypressError(null)).to.be.false;
      expect(isCypressError({})).to.be.false;
    });
  });
});
