import { ICurrentTenant } from "@c8y/client";
import {
  initRequestStub,
  stubResponse,
  stubResponses,
} from "../support/testutils";
import { defaultClientOptions } from "../../../src/lib/commands/c8yclient";

const { _ } = Cypress;
const auth = { user: "admin", password: "mypassword", tenant: "t12345678" };

describe("c8yclient options", () => {
  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_C8YCLIENT_TIMEOUT", undefined);

    initRequestStub();
    stubResponses([
      new window.Response(JSON.stringify({ name: "t12345678" }), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    ]);
  });

  context("defaultClientOptions", () => {
    it("should have log set to true by default", () => {
      expect(defaultClientOptions().log).to.equal(true);
    });

    it("should use C8Y_C8YCLIENT_TIMEOUT env as timeout when set", () => {
      Cypress.env("C8Y_C8YCLIENT_TIMEOUT", 7500);
      expect(defaultClientOptions().timeout).to.eq(7500);
    });

    it("should use cypress responseTimeout as default timeout", () => {
      expect(defaultClientOptions().timeout).to.eq(
        Cypress.config().responseTimeout
      );
    });

    it("should have failOnStatusCode set to true by default", () => {
      expect(defaultClientOptions().failOnStatusCode).to.equal(true);
    });

    it("should have preferBasicAuth set to false by default", () => {
      expect(defaultClientOptions().preferBasicAuth).to.equal(false);
    });

    it("should have skipClientAuthentication set to false by default", () => {
      expect(defaultClientOptions().skipClientAuthentication).to.equal(false);
    });

    it("should have ignorePact set to false by default", () => {
      expect(defaultClientOptions().ignorePact).to.equal(false);
    });

    it("should have failOnPactValidation set to true by default", () => {
      expect(defaultClientOptions().failOnPactValidation).to.equal(true);
    });

    it("should have schema set to undefined by default", () => {
      expect(defaultClientOptions().schema).to.be.undefined;
    });

    it("should not include strictMatching in defaultClientOptions so global config can take effect via ?? chain", () => {
      // strictMatching is intentionally absent from defaultClientOptions() so the
      // ?? chain in c8ymatch.ts can fall through to getConfigValue("strictMatching").
      // If it were set to false here, _.defaults() would fix it and block the global.
      expect(defaultClientOptions()).to.not.have.property("strictMatching");
    });

    it("should not include matchSchemaAndObject in defaultClientOptions so global config can take effect via ?? chain", () => {
      // Same reasoning as strictMatching — must be absent so the ?? chain reaches
      // instanceMatcher?.options?.matchSchemaAndObject and then getConfigValue().
      expect(defaultClientOptions()).to.not.have.property("matchSchemaAndObject");
    });
  });

  context("failOnStatusCode", () => {
    it("should throw by default on a 4xx response (default true)", (done) => {
      stubResponse(
        new window.Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "application/json" },
        })
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with: 404");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current());
    });

    it("should throw by default on a 5xx response (default true)", (done) => {
      stubResponse(
        new window.Response(JSON.stringify({ error: "Server error" }), {
          status: 500,
          statusText: "Internal Server Error",
          headers: { "content-type": "application/json" },
        })
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with: 500");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current());
    });

    it("should throw on a 401 response (default true)", (done) => {
      stubResponse(
        new window.Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          statusText: "Unauthorized",
          headers: { "content-type": "application/json" },
        })
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with: 401");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current());
    });

    it("should not throw on 5xx when per-call option overrides default true", () => {
      stubResponse(
        new window.Response(JSON.stringify({ error: "Server error" }), {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "content-type": "application/json" },
        })
      );

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          failOnStatusCode: false,
        })
        .then((resp) => {
          expect(resp.status).to.eq(503);
          expect(resp.isOkStatusCode).to.eq(false);
        });
    });

    it("should not affect 2xx responses regardless of failOnStatusCode value", () => {
      // failOnStatusCode: false should not change behaviour for successful 200 responses
      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          failOnStatusCode: false,
        })
        .then((resp) => {
          expect(resp.status).to.eq(200);
          expect(resp.isOkStatusCode).to.eq(true);
        });
    });
  });

  context("log", () => {
    it("should create a c8yclient log entry by default (log: true)", () => {
      const logSpy = cy.spy(Cypress, "log").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          const c8yclientLogs = logSpy
            .getCalls()
            .filter((call: any) => call.args?.[0]?.name === "c8yclient");
          expect(c8yclientLogs.length).to.be.greaterThan(0);
        });
    });

    it("should suppress c8yclient log entry when log option is set to false", () => {
      const logSpy = cy.spy(Cypress, "log").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { log: false })
        .then(() => {
          const c8yclientLogs = logSpy
            .getCalls()
            .filter((call: any) => call.args?.[0]?.name === "c8yclient");
          expect(c8yclientLogs).to.have.length(0);
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

    it("should use per-call timeout overriding env variable (per-call > env > Cypress.config)", () => {
      // env sets a 500 ms global; the 1000 ms delayed stub would fail under that.
      // Passing { timeout: 3000 } per-call wins over the env global and the request succeeds.
      Cypress.env("C8Y_C8YCLIENT_TIMEOUT", 500);
      expect(defaultClientOptions().timeout).to.eq(500);

      stubResponse(
        new window.Response(JSON.stringify({ name: "t1234" }), {
          status: 200,
          statusText: "OK",
          headers: {},
        }),
        0,
        1000
      );

      const start = Date.now();
      cy.getAuth(user)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { timeout: 3000 })
        .then((response) => {
          expect(response.status).to.eq(200);
          expect(Date.now() - start)
            .to.be.greaterThan(990)
            .and.lessThan(3000);
        });
    });
  });

  context("preferBasicAuth", () => {
    beforeEach(() => {
      Cypress.env("C8Y_TENANT", "t12345678");
      cy.setCookie("XSRF-TOKEN", "testxsrftoken");
    });

    it("should use cookie auth when no explicit basic auth credentials are provided", () => {
      // When no explicit auth is passed (cy.wrap(undefined)), only the cookie is
      // available — the request carries X-XSRF-TOKEN but no Authorization header.
      cy.wrap(undefined)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then((response) => {
          expect(_.get(response.requestHeaders, "X-XSRF-TOKEN")).to.eq(
            "testxsrftoken"
          );
          expect(_.get(response.requestHeaders, "Authorization")).to.be
            .undefined;
        });
    });

    it("should send basic auth Authorization header when preferBasicAuth is true with explicit credentials", () => {
      // With preferBasicAuth: true and explicit credentials from getAuth(),
      // BasicAuth is selected and the Authorization header is present even though
      // a cookie is also available.
      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          preferBasicAuth: true,
        })
        .then((response) => {
          expect(_.get(response.requestHeaders, "Authorization")).to.contain(
            "Basic "
          );
        });
    });
  });

  context("skipClientAuthentication", () => {
    const authNoTenant = { user: "admin", password: "mypassword" };

    it("should default to false and perform tenant lookup when no tenant is provided", () => {
      // Without tenant, an extra GET /tenant/currentTenant is made to resolve it.
      // Two stubs needed: one for the auth lookup, one for the actual call.
      stubResponses([
        new window.Response(JSON.stringify({ name: "t12345678" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ name: "t12345678" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      cy.getAuth(authNoTenant)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(window.fetchStub).to.have.callCount(2);
        });
    });

    it("should skip tenant lookup when skipClientAuthentication is true", () => {
      // Only the actual request is made — no auth-resolution preflight.
      cy.getAuth(authNoTenant)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          skipClientAuthentication: true,
        })
        .then(() => {
          expect(window.fetchStub).to.have.callCount(1);
        });
    });
  });
});

context("c8yclientf", () => {
  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_C8YCLIENT_TIMEOUT", undefined);

    initRequestStub();
    stubResponses([
      new window.Response(JSON.stringify({ name: "t12345678" }), {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
      }),
    ]);
  });

  it("should not throw on 4xx without any options (forces failOnStatusCode false)", () => {
    stubResponse(
      new window.Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      })
    );

    cy.getAuth(auth)
      .c8yclientf<ICurrentTenant>((c) => c.tenant.current())
      .then((resp) => {
        expect(resp.status).to.eq(404);
        expect(resp.isOkStatusCode).to.eq(false);
      });
  });

  it("should not throw on 5xx (forces failOnStatusCode false)", () => {
    stubResponse(
      new window.Response(JSON.stringify({ error: "Server error" }), {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-type": "application/json" },
      })
    );

    cy.getAuth(auth)
      .c8yclientf<ICurrentTenant>((c) => c.tenant.current())
      .then((resp) => {
        expect(resp.status).to.eq(500);
        expect(resp.isOkStatusCode).to.eq(false);
      });
  });

  it("should override per-call failOnStatusCode true and not throw", () => {
    // c8yclientf spreads { failOnStatusCode: false } last, so even an explicit
    // { failOnStatusCode: true } from the caller is overridden.
    stubResponse(
      new window.Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      })
    );

    cy.getAuth(auth)
      .c8yclientf<ICurrentTenant>((c) => c.tenant.current(), {
        failOnStatusCode: true,
      })
      .then((resp) => {
        expect(resp.status).to.eq(404);
        expect(resp.isOkStatusCode).to.eq(false);
      });
  });

  it("should return full response object with correct fields for error response", () => {
    const errorBody = { error: "Not found", message: "Resource missing" };

    stubResponse(
      new window.Response(JSON.stringify(errorBody), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      })
    );

    cy.getAuth(auth)
      .c8yclientf<ICurrentTenant>((c) => c.tenant.current())
      .then((resp) => {
        expect(resp.status).to.eq(404);
        expect(resp.statusText).to.eq("Not Found");
        expect(resp.isOkStatusCode).to.eq(false);
        expect(resp.body).to.deep.eq(errorBody);
        expect(resp.headers).to.have.property("content-type");
      });
  });

  it("should still work correctly on 2xx responses", () => {
    cy.getAuth(auth)
      .c8yclientf<ICurrentTenant>((c) => c.tenant.current())
      .then((resp) => {
        expect(resp.status).to.eq(200);
        expect(resp.isOkStatusCode).to.eq(true);
        expect(resp.body).to.deep.eq({ name: "t12345678" });
      });
  });

  it("should honour other options passed alongside the forced failOnStatusCode", () => {
    // Verify that c8yclientf only overrides failOnStatusCode, other
    // options (e.g. log) are forwarded as provided.
    stubResponse(
      new window.Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        statusText: "Not Found",
        headers: { "content-type": "application/json" },
      })
    );

    const logSpy = cy.spy(Cypress, "log").log(false);

    cy.getAuth(auth)
      .c8yclientf<ICurrentTenant>((c) => c.tenant.current(), { log: false })
      .then((resp) => {
        expect(resp.status).to.eq(404);
        // log: false means no c8yclient log entry was created
        const c8yclientLogs = logSpy
          .getCalls()
          .filter((call: any) => call.args?.[0]?.name === "c8yclient");
        expect(c8yclientLogs).to.have.length(0);
      });
  });
});
