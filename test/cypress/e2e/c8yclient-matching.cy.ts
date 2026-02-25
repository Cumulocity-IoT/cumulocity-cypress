import { ICurrentTenant } from "@c8y/client";
import {
  initRequestStub,
  stubResponses,
  getConsolePropsForLogSpy,
} from "../support/testutils";
import {
  C8yDefaultPact,
  C8yDefaultPactMatcher,
  C8yPactMatcher,
} from "cumulocity-cypress/c8ypact";
import {
  C8yAjvJson6SchemaMatcher,
  C8yAjvSchemaMatcher,
} from "cumulocity-cypress/contrib/ajv";

/** Accepts every match — used to isolate cursor/call-count assertions from content checks. */
class AcceptAllMatcher implements C8yPactMatcher {
  match(): boolean {
    return true;
  }
}

describe("c8yclient matching", () => {
  const auth = { user: "admin", password: "mypassword", tenant: "t12345678" };

  beforeEach(() => {
    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_PLUGIN_LOADED", undefined);
    Cypress.env("C8Y_C8YCLIENT_TIMEOUT", undefined);

    Cypress.c8ypact.schemaMatcher = new C8yAjvJson6SchemaMatcher();
    C8yDefaultPactMatcher.schemaMatcher = Cypress.c8ypact.schemaMatcher;
    C8yDefaultPactMatcher.options = undefined;
    Cypress.c8ypact.config.matchSchemaAndObject = undefined;

    Cypress.c8ypact.matcher = new C8yDefaultPactMatcher();
    Cypress.c8ypact.current = null;
    Cypress.c8ypact.config.failOnMissingPacts = true;
    Cypress.c8ypact.config.ignore = false;
    Cypress.c8ypact.on = {};

    initRequestStub();
    stubResponses([
      new window.Response(JSON.stringify({ name: "t12345678" }), {
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

  afterEach(() => {
    C8yDefaultPactMatcher.options = undefined;
    Cypress.c8ypact.config.matchSchemaAndObject = undefined;
    Cypress.c8ypact.config.strictMatching = undefined;
    Cypress.c8ypact.current = null;
  });

  context("schema matching", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    };

    it("should use schema for matching response", () => {
      const spy = cy.spy(Cypress.c8ypact.schemaMatcher!, "match");
      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(spy).to.have.been.calledOnce;
        });
    });

    it("should fail if schema does not match response", (done) => {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("data/name must be number");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
        schema: {
          type: "object",
          properties: { name: { type: "number" } },
        },
      });
    });

    it("should support schema reference", (done) => {
      const openapi = {
        openapi: "3.0.0",
        info: { title: "MySpec", version: "1.0.0" },
        components: {
          schemas: {
            CurrentTenant: {
              type: "object",
              properties: { name: { type: "number" } },
            },
          },
        },
      };

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("data/name must be number");
        done();
      });

      const matcher = new C8yAjvSchemaMatcher();
      matcher.ajv.addSchema(openapi, "MySpec");
      Cypress.c8ypact.schemaMatcher = matcher;

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
        schema: { $ref: "MySpec#/components/schemas/CurrentTenant" },
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

  context("object matching", () => {
    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", "apply");
    });

    it("should call matcher.match and advance cursor when pact record exists", () => {
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(nextSpy).to.have.been.calledOnce;
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

    it("should not call matcher when pact mode is not apply", () => {
      Cypress.env("C8Y_PACT_MODE", "mock");

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(nextSpy).to.not.have.been.called;
          expect(matchSpy).to.not.have.been.called;
        });
    });

    it("should fail with helpful error when no pact is loaded", (done) => {
      Cypress.c8ypact.current = null;
      Cypress.c8ypact.config.failOnMissingPacts = true;

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Invalid pact or no records found");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current());
    });

    it("should not fail when no pact is loaded and failOnMissingPacts is false", () => {
      Cypress.c8ypact.current = null;
      Cypress.c8ypact.config.failOnMissingPacts = false;

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(matchSpy).to.not.have.been.called;
        });
    });

    it("should not fail when pact has no more records and failOnMissingPacts is false", () => {
      Cypress.c8ypact.config.failOnMissingPacts = false;

      // pact has 0 records but matching runs
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);

      cy.getAuth(auth)
        // first call exhausts the single record; second call returns null record → no error
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(nextSpy).to.have.been.calledTwice;
        });
    });

    it("should use options.record directly and not call nextRecord", () => {
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      const explicitRecord = { request: {}, response: {} } as any;
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: { status: 999 } } as any],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          record: explicitRecord,
        })
        .then(() => {
          // nextRecord must not be called — the explicit record is used directly
          expect(nextSpy).to.not.have.been.called;
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

  });

  context("matchSchemaAndObject", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
    };

    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", "apply");
    });

    it("should call both schema and object matching via static options", () => {
      Cypress.c8ypact.config.matchSchemaAndObject = true;

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce; // schema validated
          expect(nextSpy).to.have.been.calledOnce; // pact cursor advanced
          expect(matchSpy).to.have.been.calledOnce; // object match invoked
        });
    });

    it("should call only schema matching when matchSchemaAndObject is disabled", () => {
      Cypress.c8ypact.config.matchSchemaAndObject = false;

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          // cursor is always advanced when schema is provided so subsequent calls stay in sync
          expect(nextSpy).to.have.been.calledOnce;
          expect(matchSpy).to.not.have.been.called;
        });
    });

    it("should default matchSchemaAndObject to false when neither global config nor per-call option is set", () => {
      // afterEach resets config.matchSchemaAndObject to undefined, so it is unset here.
      // The ?? chain falls through to getConfigValue("matchSchemaAndObject", false) === false.
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(nextSpy).to.have.been.calledOnce;
          // object matching must NOT run — matchSchemaAndObject defaults to false
          expect(matchSpy).to.not.have.been.called;
        });
    });

    it("should fail object matching when schema passes but response body differs", (done) => {
      Cypress.c8ypact.config.matchSchemaAndObject = true;

      // pact expects a different name than the stub returns ({ name: "t12345678" })
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ response: { body: { name: "other-name" } } } as any],
        {} as any,
        "test"
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Pact validation failed!");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
        schema,
        strictMatching: false,
      });
    });

    it("should honour instance-level options.matchSchemaAndObject", () => {
      // No static options set — instance option drives the behaviour
      Cypress.c8ypact.matcher = new C8yDefaultPactMatcher(
        {},
        { matchSchemaAndObject: true }
      );
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher!, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(nextSpy).to.have.been.calledOnce;
          // C8yDefaultPactMatcher.match() is recursive — called for root + sub-objects
          expect(matchSpy).to.have.been.called;
        });
    });

    it("should enable matchSchemaAndObject via per-call option overriding default false", () => {
      // global config is unset (false), but per-call option enables it
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          matchSchemaAndObject: true,
        })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(nextSpy).to.have.been.calledOnce;
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

    it("should disable matchSchemaAndObject via per-call option overriding global true", () => {
      // global config is true, but per-call option disables it
      Cypress.c8ypact.config.matchSchemaAndObject = true;

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          matchSchemaAndObject: false,
        })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          // per-call false wins — no object match, but cursor is still advanced
          expect(nextSpy).to.have.been.calledOnce;
          expect(matchSpy).to.not.have.been.called;
        });
    });

    it("should prefer per-call option over instance-level option", () => {
      // instance says true, but per-call says false
      Cypress.c8ypact.matcher = new C8yDefaultPactMatcher(
        {},
        { matchSchemaAndObject: true }
      );
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          matchSchemaAndObject: false,
        })
        .then(() => {
          // cursor is always advanced when schema is provided so subsequent calls stay in sync
          expect(nextSpy).to.have.been.calledOnce;
        });
    });

    it("should fail with missing pact error when matchSchemaAndObject is true and no pact is loaded", (done) => {
      Cypress.c8ypact.current = null;
      Cypress.c8ypact.config.failOnMissingPacts = true;

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Invalid pact or no records found");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
        schema,
        matchSchemaAndObject: true,
      });
    });
  });

  context("strictMatching", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
    };

    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
    });

    it("should pick up strictMatching=true from global config when no per-call option is set", () => {
      Cypress.c8ypact.config.strictMatching = true;

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(schemaSpy.getCall(0).args[2]).to.equal(true);
        });
    });

    it("should default strictMatching to false when global config is unset", () => {
      // config.strictMatching is undefined — getConfigValue returns undefined, so === true is false
      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(schemaSpy.getCall(0).args[2]).to.equal(false);
        });
    });

    it("should use per-call strictMatching=true overriding unset global config", () => {
      // global is unset (false), per-call option forces strict
      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          strictMatching: true,
        })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(schemaSpy.getCall(0).args[2]).to.equal(true);
        });
    });

    it("should use per-call strictMatching=false overriding global config true", () => {
      Cypress.c8ypact.config.strictMatching = true;

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          schema,
          strictMatching: false,
        })
        .then(() => {
          expect(schemaSpy).to.have.been.calledOnce;
          expect(schemaSpy.getCall(0).args[2]).to.equal(false);
        });
    });
  });

  context("ignorePact option", () => {
    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", "apply");

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );
    });

    it("should default to false and run pact matching", () => {
      // ignorePact not set → defaults to false from defaultClientOptions() → matching runs
      const matchSpy = cy.spy(Cypress.c8ypact.matcher!, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

    it("should skip pact matching when set to true", () => {
      const matchSpy = cy.spy(Cypress.c8ypact.matcher!, "match").log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current!, "nextRecord").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          ignorePact: true,
        })
        .then(() => {
          expect(nextSpy).to.not.have.been.called;
          expect(matchSpy).to.not.have.been.called;
        });
    });

    it("should prefer per-call ignorePact=true over loaded pact and apply mode", () => {
      // pact record would cause a failure if matched — but ignorePact suppresses it entirely
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ response: { status: 999 } } as any],
        {} as any,
        "test"
      );

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          ignorePact: true,
        })
        .then((resp) => {
          expect(resp.status).to.eq(200);
        });
    });
  });

  context("failOnPactValidation option", () => {
    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", "apply");
    });

    it("should default to true and throw on pact record mismatch", (done) => {
      // failOnPactValidation not set → defaults to true from defaultClientOptions() → throws
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ response: { status: 999 } } as any],
        {} as any,
        "test"
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Pact validation failed!");
        done();
      });

      cy.getAuth(auth).c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
        strictMatching: false,
      });
    });

    it("should not throw on pact mismatch when set to false", () => {
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ response: { status: 999 } } as any],
        {} as any,
        "test"
      );

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          failOnPactValidation: false,
          strictMatching: false,
        })
        .then((resp) => {
          expect(resp.status).to.eq(200);
        });
    });

    it("should prefer per-call failOnPactValidation=false over the true default", () => {
      // Even with a catastrophic mismatch (wrong status AND wrong body), the error is suppressed
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ response: { status: 404, body: { error: "not found" } } } as any],
        {} as any,
        "test"
      );

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), {
          failOnPactValidation: false,
        })
        .then((resp) => {
          expect(resp.status).to.eq(200);
        });
    });
  });

  context("array responses", () => {
    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", "apply");
    });

    it("should call nextRecord once per response in array", () => {
      // No tenant in auth → stub[0] = currentTenant, stub[1] + stub[2] = API calls
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
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

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient((c) => [
          c.inventory.detail(1, { withChildren: false }),
          c.inventory.detail(2, { withChildren: false }),
        ])
        .then((responses) => {
          expect(responses).to.have.lengthOf(2);
          // cursor advanced and matcher called once per individual response
          expect(nextSpy).to.have.been.calledTwice;
          expect(matchSpy).to.have.been.calledTwice;
        });
    });

    it("should fail with record-index error when records are exhausted before array ends", (done) => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
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

      // only 1 record for 2 responses
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Record with index 1 not found");
        done();
      });

      cy.getAuth({ user: "admin", password: "mypassword" }).c8yclient((c) => [
        c.inventory.detail(1, { withChildren: false }),
        c.inventory.detail(2, { withChildren: false }),
      ]);
    });

    it("should not fail when records are exhausted and failOnMissingPacts is false", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
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

      Cypress.c8ypact.config.failOnMissingPacts = false;
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      // only 1 record for 2 array responses
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: {}, response: {} } as any],
        {} as any,
        "test"
      );

      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient((c) => [
          c.inventory.detail(1, { withChildren: false }),
          c.inventory.detail(2, { withChildren: false }),
        ])
        .then((responses) => {
          expect(responses).to.have.lengthOf(2);
          // first response matched, second silently skipped
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

    it("should validate schema for each response in array", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "1" }), {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "2" }), {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      const itemSchema = {
        type: "object",
        properties: { id: { type: "string" } },
      };
      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient(
          (c) => [
            c.inventory.detail(1, { withChildren: false }),
            c.inventory.detail(2, { withChildren: false }),
          ],
          { schema: itemSchema }
        )
        .then(() => {
          // schema match called once per response, not once for the whole array
          expect(schemaSpy).to.have.been.calledTwice;
        });
    });

    it("should run both schema and object matching per item when matchSchemaAndObject is true", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "1" }), {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "2" }), {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      const itemSchema = {
        type: "object",
        properties: { id: { type: "string" } },
      };

      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient(
          (c) => [
            c.inventory.detail(1, { withChildren: false }),
            c.inventory.detail(2, { withChildren: false }),
          ],
          { schema: itemSchema, matchSchemaAndObject: true }
        )
        .then((responses) => {
          expect(responses).to.have.lengthOf(2);
          // schema validated once per response
          expect(schemaSpy).to.have.been.calledTwice;
          // pact cursor advanced once per response
          expect(nextSpy).to.have.been.calledTwice;
          // object matcher invoked once per response
          expect(matchSpy).to.have.been.calledTwice;
        });
    });

    it("should fail schema on second array item when it does not match schema", (done) => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "1" }), {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        // second item has a number instead of string — should fail schema
        new window.Response(JSON.stringify({ id: 99 }), {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      const itemSchema = {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      };

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("data/id must be string");
        done();
      });

      cy.getAuth({ user: "admin", password: "mypassword" }).c8yclient(
        (c) => [
          c.inventory.detail(1, { withChildren: false }),
          c.inventory.detail(2, { withChildren: false }),
        ],
        { schema: itemSchema }
      );
    });

    it("should fail object matching on second array item when matchSchemaAndObject is true", (done) => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "1" }), {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "2" }), {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      const itemSchema = {
        type: "object",
        properties: { id: { type: "string" } },
      };

      // second pact record deliberately has wrong status to trigger object mismatch
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { response: { status: 201 } } as any,
          { response: { status: 999 } } as any,
        ],
        {} as any,
        "test"
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Pact validation failed!");
        done();
      });

      cy.getAuth({ user: "admin", password: "mypassword" }).c8yclient(
        (c) => [
          c.inventory.detail(1, { withChildren: false }),
          c.inventory.detail(2, { withChildren: false }),
        ],
        {
          schema: itemSchema,
          matchSchemaAndObject: true,
          strictMatching: false,
        }
      );
    });

    it("should cycle through requestId-tagged records in order, matching each array response to the correct record", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "first" }), {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "second" }), {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          {
            request: {},
            response: { status: 201, body: { id: "first" } },
            options: { requestId: "rid" },
          } as any,
          {
            request: {},
            response: { status: 202, body: { id: "second" } },
            options: { requestId: "rid" },
          } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient(
          (c) => [
            c.inventory.detail(1, { withChildren: false }),
            c.inventory.detail(2, { withChildren: false }),
          ],
          { requestId: "rid" }
        )
        .then((responses) => {
          expect(responses).to.have.lengthOf(2);

          // nextRecord called once per array item, each time forwarding the requestId
          expect(nextSpy).to.have.been.calledTwice;
          expect(nextSpy.getCall(0).args[0]).to.equal("rid");
          expect(nextSpy.getCall(1).args[0]).to.equal("rid");

          expect(matchSpy).to.have.been.calledTwice;
          // first response matched against first tagged record
          expect(matchSpy.getCall(0).args[1]).to.deep.include({
            response: { status: 201, body: { id: "first" } },
          });
          // second response matched against second tagged record — cursor advanced correctly
          expect(matchSpy.getCall(1).args[1]).to.deep.include({
            response: { status: 202, body: { id: "second" } },
          });
        });
    });

    it("should skip untagged records and cycle through requestId-tagged records in pact order for array responses", () => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "first" }), {
          status: 201,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response(JSON.stringify({ id: "second" }), {
          status: 202,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          // index 0: untagged — must never be used when requestId is given
          {
            request: {},
            response: { status: 999, body: { id: "wrong" } },
          } as any,
          {
            request: {},
            response: { status: 201, body: { id: "first" } },
            options: { requestId: "rid" },
          } as any,
          {
            request: {},
            response: { status: 202, body: { id: "second" } },
            options: { requestId: "rid" },
          } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient(
          (c) => [
            c.inventory.detail(1, { withChildren: false }),
            c.inventory.detail(2, { withChildren: false }),
          ],
          { requestId: "rid" }
        )
        .then((responses) => {
          expect(responses).to.have.lengthOf(2);

          expect(nextSpy).to.have.been.calledTwice;
          expect(nextSpy.getCall(0).args[0]).to.equal("rid");
          expect(nextSpy.getCall(1).args[0]).to.equal("rid");

          expect(matchSpy).to.have.been.calledTwice;
          // first response matched against first tagged record (not the untagged one at index 0)
          expect(matchSpy.getCall(0).args[1]).to.deep.include({
            response: { status: 201, body: { id: "first" } },
          });
          // second response matched against second tagged record
          expect(matchSpy.getCall(1).args[1]).to.deep.include({
            response: { status: 202, body: { id: "second" } },
          });
        });
    });

    it("should fail for array responses when requestId yields no matching pact records", (done) => {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456" }), {
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

      // No records tagged with "rid" — nextRecord("rid") returns null
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      Cypress.once("fail", (err) => {
        // pact is not empty but no record matches the requestId → index error
        expect(err.message).to.contain("Record with index 0 not found");
        done();
      });

      cy.getAuth({ user: "admin", password: "mypassword" }).c8yclient(
        (c) => [
          c.inventory.detail(1, { withChildren: false }),
          c.inventory.detail(2, { withChildren: false }),
        ],
        { requestId: "rid" }
      );
    });
  });

  context("mixed schema and object matching in sequence", () => {
    beforeEach(() => {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", "apply");
    });

    it("should advance cursor for schema-only call so subsequent object-matching call uses the next record", () => {
      // Two sequential c8yclient calls:
      //   call 1 — schema only (matchSchemaAndObject=false) → consumes record[0] without object-matching
      //   call 2 — object matching (no schema)              → consumes record[1]
      // Verify: nextRecord called twice, schemaSpy once, matchSpy once
      const schema = {
        type: "object",
        properties: { name: { type: "string" } },
      };

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        // schema-only: validates against schema, advances cursor
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        // object-matching: should see record[1], not record[0]
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(nextSpy).to.have.been.calledTwice;
          expect(schemaSpy).to.have.been.calledOnce;
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

    it("should advance cursor for object-matching call so subsequent schema-only call sees the next pact position", () => {
      // Two sequential c8yclient calls:
      //   call 1 — object matching (no schema) → consumes record[0]
      //   call 2 — schema only                 → consumes record[1] (without object-matching)
      // Verify: nextRecord called twice, matchSpy once, schemaSpy once
      const schema = {
        type: "object",
        properties: { name: { type: "string" } },
      };

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        // object-matching first
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        // schema-only second — cursor should already be at record[1]
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .then(() => {
          expect(nextSpy).to.have.been.calledTwice;
          expect(matchSpy).to.have.been.calledOnce;
          expect(schemaSpy).to.have.been.calledOnce;
        });
    });

    it("should advance cursor correctly for three sequential calls: object, schema-only, object", () => {
      // Three sequential c8yclient calls with 3 pact records:
      //   call 1 — object matching → record[0]
      //   call 2 — schema only     → record[1] (cursor advanced, no object-match)
      //   call 3 — object matching → record[2]
      // Verify: nextRecord called three times, matchSpy twice, schemaSpy once
      stubResponses([
        new window.Response(JSON.stringify({ name: "t12345678" }), {
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
        new window.Response("{}", {
          status: 203,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      const schema = {
        type: "object",
        properties: { name: { type: "string" } },
      };

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const schemaSpy = cy
        .spy(Cypress.c8ypact.schemaMatcher!, "match")
        .log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(nextSpy).to.have.been.calledThrice;
          expect(schemaSpy).to.have.been.calledOnce;
          expect(matchSpy).to.have.been.calledTwice;
        });
    });

    it("should not run object matching on schema-only call even when pact record at that position has a mismatched status", () => {
      // Ensures the schema-only call silently advances past a "bad" pact record
      // (status 999 would fail object matching) and does NOT throw.
      // The subsequent object-matching call then receives the next (good) record.
      const schema = {
        type: "object",
        properties: { name: { type: "string" } },
      };

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          // record[0]: bad status that would fail object matching
          { request: {}, response: { status: 999 } } as any,
          // record[1]: used by the second (object-matching) call
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      const nextSpy = cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

      cy.getAuth(auth)
        // call 1: schema only — advances cursor past record[0] without validating
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        // call 2: object matching — receives record[1] and succeeds (AcceptAllMatcher)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current())
        .then(() => {
          expect(nextSpy).to.have.been.calledTwice;
          // AcceptAllMatcher called only for the second request
          expect(matchSpy).to.have.been.calledOnce;
        });
    });

    it("should report correct record index error when schema-only calls exhaust the pact before an object-matching call", (done) => {
      // 2 schema-only calls consume both pact records; the 3rd call (object matching)
      // finds no record and should report index 2 in the error message.
      stubResponses([
        new window.Response(JSON.stringify({ name: "t12345678" }), {
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
        new window.Response("{}", {
          status: 203,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);

      const schema = {
        type: "object",
        properties: { name: { type: "string" } },
      };

      Cypress.c8ypact.current = new C8yDefaultPact(
        [
          { request: {}, response: {} } as any,
          { request: {}, response: {} } as any,
        ],
        {} as any,
        "test"
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Record with index 2");
        done();
      });

      cy.getAuth(auth)
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        .c8yclient<ICurrentTenant>((c) => c.tenant.current(), { schema })
        // both records exhausted by schema calls — this object-matching call fails
        .c8yclient<ICurrentTenant>((c) => c.tenant.current());
    });
  });
});
