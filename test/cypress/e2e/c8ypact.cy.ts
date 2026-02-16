import { BasicAuth, Client, IManagedObject } from "@c8y/client";
import { initRequestStub, stubEnv, stubResponses } from "../support/testutils";

import { defaultClientOptions } from "cumulocity-cypress/lib/commands/c8yclient";
import {
  C8yAjvJson6SchemaMatcher,
  C8yAjvSchemaMatcher,
} from "cumulocity-cypress/contrib/ajv";

import {
  C8yAuthentication,
  C8yClient,
  C8yDefaultPactMatcher,
  C8yPactMatcher,
  C8yDefaultPactPreprocessor,
  C8yDefaultPact,
  C8yDefaultPactRecord,
  C8yPact,
  createPactRecord,
  C8yCypressEnvPreprocessor,
  isPact,
  isPactRecord,
  getEnvVar,
  C8yPactPreprocessorDefaultOptions,
  validatePactRecordingMode,
} from "cumulocity-cypress/c8ypact";
import { getBaseUrlFromEnv } from "cumulocity-cypress/lib/utils";

const { _ } = Cypress;

class AcceptAllMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    return true;
  }
}

describe("c8ypact", () => {
  before(() => {
    // do not skip tests with unsatisfied version requirements
    Cypress.env("C8Y_IGNORE_REQUIRES_SKIP", "1");
  });

  beforeEach(() => {
    Cypress.c8ypact.config.strictMatching = true;
    Cypress.c8ypact.config.ignore = false;
    Cypress.c8ypact.schemaMatcher = new C8yAjvJson6SchemaMatcher();
    Cypress.c8ypact.preprocessor = new C8yCypressEnvPreprocessor();
    C8yDefaultPactMatcher.schemaMatcher = Cypress.c8ypact.schemaMatcher;

    Cypress.env("C8Y_USERNAME", undefined);
    Cypress.env("C8Y_PASSWORD", undefined);
    Cypress.env("C8Y_TENANT", undefined);
    Cypress.env("C8Y_LOGGED_IN_USER", undefined);
    Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", undefined);
    Cypress.env("C8Y_PACT_IGNORE", undefined);
    Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE", undefined);
    Cypress.env("C8Y_PACT_PREPROCESSOR_PATTERN", undefined);
    Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE", undefined);
    Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE_CASE", undefined);

    Cypress.env("admin_username", "admin");
    Cypress.env("admin_password", "password");

    Cypress.env("C8Y_PACT_MODE", "apply");
    Cypress.env("C8Y_PACT_RECORDING_MODE", undefined);
    Cypress.env("C8Y_BASEURL", undefined);
    Cypress.env("C8Y_HOST", undefined);
    Cypress.c8ypact.on = {};

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

  afterEach(() => {
    // delete recorded pacts after each test
    cy.task("c8ypact:remove", Cypress.c8ypact.getCurrentTestId()).then(() => {
      Cypress.c8ypact.loadCurrent().then((pact) => {
        expect(pact).to.be.null;
      });
    });
  });

  context("c8ypact setup", () => {
    it("Cypress.c8ypact should be initialized with defaults", function () {
      expect(Cypress.c8ypact).to.not.be.null.and.undefined;
      expect(Cypress.c8ypact.debugLog).to.be.false;
      expect(Cypress.c8ypact.current).to.be.null;
      expect(Cypress.c8ypact.config).to.be.a("object");
      expect(Cypress.c8ypact.config.strictMatching).to.not.be.undefined;
      expect(Cypress.c8ypact.config.failOnMissingPacts).to.not.be.undefined;
      expect(Cypress.c8ypact.config.ignore).to.be.false;

      expect(Cypress.c8ypact.getCurrentTestId).to.be.a("function");
      expect(Cypress.c8ypact.isRecordingEnabled).to.be.a("function");
      expect(Cypress.c8ypact.isMockingEnabled).to.be.a("function");
      expect(Cypress.c8ypact.savePact).to.be.a("function");
      expect(Cypress.c8ypact.getConfigValue).to.be.a("function");
      expect(Cypress.c8ypact.getConfigValues).to.be.a("function");
      expect(Cypress.c8ypact.preprocessor).to.be.a("object");
      expect(Cypress.c8ypact.pactRunner).to.be.a("object");
      expect(Cypress.c8ypact.matcher).to.be.a("object");
      expect(Cypress.c8ypact.schemaMatcher).to.not.be.undefined;
      expect(Cypress.c8ypact.recordingMode).to.be.a("function");
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
    });

    it("semver should be defined", function () {
      expect(Cypress.semver).to.not.be.undefined;
    });

    it("should not be enabled if pact mode is undefined", function () {
      stubEnv({ C8Y_PACT_MODE: undefined });
      expect(Cypress.c8ypact.isEnabled()).to.be.false;
    });

    it("should use disabled if unsupported pact mode", function () {
      stubEnv({ C8Y_PACT_MODE: "xyz" });
      // validation is happeing in validatePactRecordingMode
      expect(Cypress.c8ypact.mode()).to.eq("xyz");
    });

    it("should not be enabled if plugin is not loaded", function () {
      stubEnv({ C8Y_PLUGIN_LOADED: undefined });
      expect(Cypress.c8ypact.isEnabled()).to.be.false;
    });

    it("should have recording disabled if pact mode is undefined", function () {
      stubEnv({ C8Y_PACT_MODE: undefined });
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;
    });

    it("should use recording mode from env variable", function () {
      stubEnv({ C8Y_PACT_RECORDING_MODE: "new" });
      expect(Cypress.c8ypact.recordingMode()).to.eq("new");
    });

    it(
      "should use recording mode from config",
      {
        c8ypact: {
          recordingMode: "new",
        },
      },
      function () {
        expect(Cypress.c8ypact.recordingMode()).to.eq("new");
      }
    );

    it("should throw for unsupported recording modes", function (done) {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Unsupported recording mode");
        done();
      });
      stubEnv({ C8Y_PACT_RECORDING_MODE: "xyz" });
      validatePactRecordingMode(Cypress.c8ypact.recordingMode());
    });

    it("should use default recording mode for unssuported values", function () {
      stubEnv({ C8Y_PACT_RECORDING_MODE: undefined });
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
    });

    it(
      "should use ignore annotation configured for the test",
      { c8ypact: { ignore: true } },
      function () {
        expect(Cypress.c8ypact.isEnabled()).to.be.false;
        expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;

        stubEnv({ C8Y_PACT_IGNORE: "false" });
        expect(Cypress.c8ypact.isEnabled()).to.be.false;
        expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;

        Cypress.c8ypact.config.ignore = false;
        expect(Cypress.c8ypact.isEnabled()).to.be.false;
        expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;
      }
    );

    it("should work without ignore annotation configured for the test", function () {
      expect(Cypress.c8ypact.isEnabled()).to.be.true;
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;

      Cypress.c8ypact.config.ignore = true;
      expect(Cypress.c8ypact.isEnabled()).to.be.false;
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;
      Cypress.c8ypact.config.ignore = false;

      stubEnv({ C8Y_PACT_IGNORE: "true" });
      expect(Cypress.c8ypact.isEnabled()).to.be.false;
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;
    });
  });

  context("c8ypact env variables", () => {
    it("should use env variable as is", function () {
      stubEnv({ C8Y_BASEURL: "http://mytenant.cumulocity.com" });
      expect(getEnvVar("C8Y_BASEURL")).to.eq("http://mytenant.cumulocity.com");
      expect(getBaseUrlFromEnv()).to.eq("http://mytenant.cumulocity.com");
    });

    it("should use env variable with C8Y_HOST", function () {
      stubEnv({ C8Y_HOST: "http://mytenant.cumulocity.com" });
      expect(getEnvVar("C8Y_HOST")).to.eq("http://mytenant.cumulocity.com");
      expect(getBaseUrlFromEnv()).to.eq("http://mytenant.cumulocity.com");
    });

    it("should use env variable with CYPRESS_ prefix", function () {
      stubEnv({ CYPRESS_baseurl: "http://mytenant.cumulocity.com" });
      expect(getEnvVar("BASEURL")).to.eq("http://mytenant.cumulocity.com");
      expect(getEnvVar("C8Y_BASEURL")).to.eq("http://mytenant.cumulocity.com");
      expect(getBaseUrlFromEnv()).to.eq("http://mytenant.cumulocity.com");
    });

    it("should use camelCase env variable without prefix", function () {
      stubEnv({ pactMode: "recording" });
      expect(getEnvVar("PACT_MODE")).to.eq("recording");
    });
  });

  context(
    "c8ypact id annotations",
    { c8ypact: { id: "test_suite_id" } },
    function () {
      it("should use id from suite annotation", function () {
        expect(Cypress.c8ypact.getCurrentTestId()).to.equal("test_suite_id");
      });

      it(
        "should use id from test annotation",
        { c8ypact: { id: "test_case_id" } },
        function () {
          expect(Cypress.c8ypact.getCurrentTestId()).to.equal("test_case_id");
        }
      );

      it(
        "should use config values from test annotation",
        {
          c8ypact: {
            strictMocking: false,
            strictMatching: false,
            recordingMode: "new",
            ignore: true,
            consumer: "test_consumer",
            producer: "test_producer",
            log: true,
          },
        },
        function () {
          expect(Cypress.c8ypact.getConfigValue("strictMocking")).to.be.false;
          expect(Cypress.c8ypact.getConfigValue("strictMatching")).to.be.false;
          expect(Cypress.c8ypact.recordingMode()).to.eq("new");
        }
      );
    }
  );

  const modes = ["record", "apply", "mock", "disabled"];
  for (const mode of modes) {
    context(`c8ypact current - ${mode}`, function () {
      const pact = new C8yDefaultPact(
        [{ request: { url: "test" } }] as any,
        {
          id: "12345",
          tenant: "t987654321",
          baseUrl: "http://mytenant.cumulocity.com",
        },
        "test"
      );

      let loadSpy: sinon.SinonSpy;
      let loadCalls = 0;

      const cmd = (cmd: string) => {
        return [cmd, Cypress.c8ypact.getCurrentTestId(), { log: false }];
      };

      // stub in before as this is called before beforeEach of c8ypact
      before(() => {
        stubEnv({ C8Y_PACT_MODE: mode });
        Cypress.c8ypact.debugLog = false;

        loadSpy = cy.stub(cy, "task").callsFake((name: string) => {
          if (name === "c8ypact:get" && loadCalls === 0) {
            loadCalls++;
            return cy.wrap(pact);
          } else if (name === "c8ypact:resolve") {
            return cy.wrap(pact);
          } else {
            return cy.wrap(null);
          }
        });
      });

      if (mode === "record") {
        it("should load existing pact and init current", function () {
          expect(loadSpy).to.be.calledThrice;
          expect(loadSpy).to.be.calledWith(...cmd("c8ypact:remove"));
          expect(loadSpy).to.be.calledWith(...cmd("c8ypact:get"));
          expect(loadSpy).to.be.calledWith("c8ypact:resolve", pact, {
            log: false,
          });
          expect(Cypress.c8ypact.current).to.deep.eq(pact);
          expect(isPact(Cypress.c8ypact.current)).to.be.true;
        });
      } else if (mode === "disabled") {
        it("should load existing pact and init current", function () {
          expect(loadSpy).to.not.be.called;
        });
      } else {
        it("should load existing pact and init current", function () {
          expect(loadSpy).to.be.calledTwice;
          expect(loadSpy).to.be.calledWith(...cmd("c8ypact:get"));
          expect(loadSpy).to.be.calledWith("c8ypact:resolve", pact, {
            log: false,
          });
          expect(Cypress.c8ypact.current).to.deep.eq(pact);
          expect(Cypress.env("C8Y_TENANT")).to.eq(pact.info.tenant);
          expect(Cypress.env("C8Y_BASEURL")).to.eq(pact.info.baseUrl);
          expect(isPact(Cypress.c8ypact.current)).to.be.true;
        });
      }
    });
  }

  context("C8yDefaultPactRecord", function () {
    it("from() should create C8yDefaultPactRecord from Cypress.Response", function () {
      const response: Cypress.Response<any> = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "t123456789" },
        duration: 100,
        requestHeaders: { "content-type": "application/json2" },
        requestBody: { id: "abc123124" },
        allRequestResponses: [],
        isOkStatusCode: false,
        method: "PUT",
        url: "http://localhost:4200",
      };

      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.response.status).to.equal(200);
      expect(pactRecord.response.statusText).to.equal("OK");
      expect(pactRecord.response.headers).to.deep.equal({
        "content-type": "application/json",
      });
      expect(pactRecord.response.body).to.deep.equal({ name: "t123456789" });
      expect(pactRecord.response.duration).to.equal(100);
      expect(pactRecord.request.url).to.equal("http://localhost:4200");
      expect(pactRecord.request.method).to.equal("PUT");
      expect(pactRecord.request.body).to.deep.equal({ id: "abc123124" });
      expect(pactRecord.request.headers).to.deep.equal({
        "content-type": "application/json2",
      });

      expect(_.has(pactRecord, "auth")).to.be.false;
      expect(_.has(pactRecord, "options")).to.be.false;
      expect(_.has(pactRecord, "createdObject")).to.be.false;
    });

    it("from() should not have undefined properties", function () {
      const response: Cypress.Response<any> = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "t123456789" },
        requestHeaders: { "content-type": "application/json2" },
        allRequestResponses: [],
        isOkStatusCode: false,
        method: "PUT",
        duration: 100,
        url: "http://localhost:4200",
        $body: undefined,
      };
      const pactRecord = C8yDefaultPactRecord.from(response);
      expect("body" in pactRecord.request).to.be.false;
      expect("$body" in pactRecord.request).to.be.false;
    });

    it("from() should create from cloned source objects", function () {
      // @ts-expect-error
      const obj: Cypress.Response<any> = {
        body: {
          id: "12312312",
        },
      };
      const pact = C8yDefaultPactRecord.from(obj);
      obj.body.test = "test";
      // c8ymatch should not modify obj when preprocessing
      expect(obj.body.test).to.eq("test");
      expect(pact.response.body.test).to.be.undefined;
    });

    it("from() should create C8yDefaultPactRecord without optional properties if undefined", function () {
      // @ts-expect-error
      let response: Cypress.Response<any> = {};
      let pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.response).to.deep.equal({});
      expect(pactRecord.request).to.deep.equal({});
      expect(_.has(pactRecord, "auth")).to.be.false;
      expect(_.has(pactRecord, "options")).to.be.false;
      expect(_.has(pactRecord, "createdObject")).to.be.false;

      // @ts-expect-error
      response = Cypress.Response<any> = {
        status: 200,
        requestBody: "test",
      };
      pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.response).to.deep.equal({ status: 200 });
      expect(pactRecord.request).to.deep.equal({ body: "test" });
      expect(_.has(pactRecord, "auth")).to.be.false;
      expect(_.has(pactRecord, "options")).to.be.false;
      expect(_.has(pactRecord, "createdObject")).to.be.false;
    });

    it("from() should create C8yDefaultPactRecord with auth", function () {
      Cypress.env("C8Y_LOGGED_IN_USER", "admin");
      Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", "alias");

      // @ts-expect-error
      let response: Cypress.Response<any> = {};
      let pactRecord = createPactRecord(response, undefined, {
        loggedInUser: Cypress.env("C8Y_LOGGED_IN_USER"),
        loggedInUserAlias: Cypress.env("C8Y_LOGGED_IN_USER_ALIAS"),
      });
      expect(pactRecord.auth).to.deep.equal({
        user: "admin",
        userAlias: "alias",
        type: "CookieAuth",
      });
    });

    it("from() should use C8yClient auth", function () {
      // setting env variables to ensure client auth overrides env auth
      Cypress.env("C8Y_LOGGED_IN_USER", "admin");
      Cypress.env("C8Y_LOGGED_IN_USER_ALIAS", "alias");
      const auth: C8yAuthentication & { userAlias?: string } = new BasicAuth({
        user: "admin2",
        password: "mypassword",
      });
      auth.userAlias = "alias2";
      const client: C8yClient = {
        _auth: auth,
        _client: new Client(auth),
      };
      // @ts-expect-error
      let response: Cypress.Response<any> = {};
      let pactRecord = createPactRecord(response, client);
      expect(pactRecord.auth).to.deep.equal({
        user: "admin2",
        userAlias: "alias2",
        type: "BasicAuth",
      });
    });

    it("from() should create C8yDefaultPactRecord with createdObject", function () {
      // @ts-expect-error
      const response: Cypress.Response<any> = {
        method: "POST",
        body: {
          id: "12312312",
        },
      };
      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.createdObject).to.equal("12312312");
    });

    it("from() should create C8yDefaultPactRecord with createdObject from location header", function () {
      // @ts-expect-error
      const response: Cypress.Response<any> = {
        method: "POST",
        headers: {
          location:
            Cypress.config().baseUrl + "/inventory/managedObjects/12312312",
        },
      };
      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.createdObject).to.equal("12312312");
    });

    it("from() should create C8yDefaultPactRecord with createdObject from location header with query params", function () {
      // @ts-expect-error
      const response: Cypress.Response<any> = {
        method: "POST",
        headers: {
          Location:
            Cypress.config().baseUrl +
            "/inventory/managedObjects/12312312?withChildren=true",
        },
      };
      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.createdObject).to.equal("12312312");
    });

    it("toCypressResponse() should create Response from record", function () {
      const response: Cypress.Response<any> = {
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "t123456789" },
        duration: 100,
        requestHeaders: { "content-type": "application/json2" },
        requestBody: { id: "abc123124" },
        allRequestResponses: [],
        isOkStatusCode: true,
        method: "PUT",
        url: "http://localhost:4200",
      };

      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.toCypressResponse()).to.deep.equal(response);
    });

    it("toCypressResponse() should create Response without adding defaults", function () {
      // @ts-expect-error
      const response: Cypress.Response<any> = {
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: { name: "t123456789" },
        duration: 100,
        requestHeaders: { "content-type": "application/json2" },
        requestBody: { id: "abc123124" },
        method: "PUT",
        url: "http://localhost:4200",
      };

      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.toCypressResponse()).to.deep.equal(response);
    });

    it("date() should return date from response", function () {
      // @ts-expect-error
      const response: Cypress.Response<any> = {
        headers: {
          date: "Fri, 17 Nov 2023 13:12:04 GMT",
          expires: "0",
        },
      };

      const pactRecord = C8yDefaultPactRecord.from(response);
      expect(pactRecord.date()).to.deep.equal(
        new Date("Fri, 17 Nov 2023 13:12:04 GMT")
      );
    });
  });

  context("c8ypact config and environment variables", function () {
    beforeEach(() => {
      Cypress.env("C8Y_PACT_MODE", "recording");
    });

    it("recording should be enabled", function () {
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
    });

    it("recording should be disabled", function () {
      const isEnabled = Cypress.env("C8Y_PLUGIN_LOADED");
      Cypress.env("C8Y_PLUGIN_LOADED", "true");
      Cypress.env("C8Y_PACT_MODE", undefined);
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;
      Cypress.env("C8Y_PLUGIN_LOADED", isEnabled.toString());
    });

    it("recording should be disabled if plugin is disabled", function () {
      const isEnabled = Cypress.env("C8Y_PLUGIN_LOADED");
      Cypress.env("C8Y_PLUGIN_LOADED", undefined);
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.false;
      Cypress.env("C8Y_PLUGIN_LOADED", isEnabled.toString());
    });

    it("plugin should be enabled", function () {
      expect(Cypress.env("C8Y_PLUGIN_LOADED")).to.eq("true");
    });
  });

  context("c8ypact getCurrentTestId", function () {
    it("should create pact identifier from test case name", function () {
      expect(Cypress.c8ypact.getCurrentTestId()).to.equal(
        "c8ypact__c8ypact_getCurrentTestId__should_create_pact_identifier_from_test_case_name"
      );
    });

    it("should throw error if pact identifier is undefined", function (done) {
      Cypress.once("fail", (err) => {
        expect(err.message).to.contain(
          "Failed to get or create pact id for current test."
        );
        done();
      });
      cy.stub(Cypress, "currentTest").value({});
      cy.stub(Cypress.spec, "relative").value(undefined);
      Cypress.c8ypact.getCurrentTestId();
    });

    it(
      "should not throw error if id is annotated",
      { c8ypact: { id: "mytest" } },
      function () {
        cy.stub(Cypress, "currentTest").value({});
        cy.stub(Cypress.spec, "relative").value(undefined);
        expect(Cypress.currentTest.titlePath).to.be.undefined;
        expect(Cypress.spec.relative).to.be.undefined;
        expect(Cypress.c8ypact.getCurrentTestId()).to.equal("mytest");
      }
    );

    it(
      "should throw error if id is annotated with invalid value",
      { c8ypact: { id: "&*%+§$%" } },
      function (done) {
        Cypress.once("fail", (err) => {
          expect(err.message).to.contain(
            "Failed to get or create pact id for current test."
          );
          done();
        });
        cy.stub(Cypress, "currentTest").value({});
        cy.stub(Cypress.spec, "relative").value(undefined);
        Cypress.c8ypact.getCurrentTestId();
      }
    );

    it(
      "should create pact identifier from test case annotation",
      { c8ypact: { id: "mycustom test case" } },
      function () {
        expect(Cypress.c8ypact.getCurrentTestId()).to.equal(
          "mycustom_test_case"
        );
      }
    );

    it(
      "should add min system version to pact id",
      { requires: ["1.2.x"] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.3" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq(
          "1_2__c8ypact__c8ypact_getCurrentTestId__should_add_min_system_version_to_pact_id"
        );
      }
    );

    it(
      "should add min shell version to pact id",
      { requires: { shell: ["1.2.x"] } },
      function () {
        stubEnv({ C8Y_SHELL_VERSION: "1.2.3" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq(
          "1_2__c8ypact__c8ypact_getCurrentTestId__should_add_min_shell_version_to_pact_id"
        );
      }
    );

    it(
      "should add min system version to pact id using c8ypact id",
      { requires: { system: ["1.2.x"] }, c8ypact: { id: "my_pact" } },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.3" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq("1_2__my_pact");
      }
    );

    it(
      "should add min shell version to pact id using c8ypact id",
      { requires: { shell: ["1.2.x"] }, c8ypact: { id: "my_pact" } },
      function () {
        stubEnv({ C8Y_SHELL_VERSION: "1.2.3" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq("1_2__my_pact");
      }
    );

    it("should not add version if no system version is set", function () {
      stubEnv({
        C8Y_SYSTEM_VERSION: undefined,
        C8Y_VERSION: undefined,
        C8Y_SHELL_VERSION: undefined,
      });
      expect(Cypress.c8ypact.getCurrentTestId()).to.eq(
        "c8ypact__c8ypact_getCurrentTestId__should_not_add_version_if_no_system_version_is_set"
      );
    });

    it(
      "should use C8Y_SYSTEM_VERSION if set",
      { requires: ["1.2.3"] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.3", C8Y_VERSION: undefined });
        expect(Cypress.c8ypact.getCurrentTestId()).to.contain("1_2_3__");
      }
    );

    it("should use C8Y_VERSION if set", { requires: ["1.2.3"] }, function () {
      stubEnv({ C8Y_SYSTEM_VERSION: undefined, C8Y_VERSION: "1.2.3" });
      expect(Cypress.c8ypact.getCurrentTestId()).to.contain("1_2_3__");
    });

    it(
      "should use C8Y_SHELL_VERSION if set",
      { requires: { shell: ["1.2.3"] } },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: undefined, C8Y_SHELL_VERSION: "1.2.3" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.contain("1_2_3__");
      }
    );

    it(
      "should prefer C8Y_SYSTEM_VERSION over C8Y_VERSION",
      { requires: [">=2", "^1.2.3"] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.5", C8Y_VERSION: "2.0.0" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.contain("1_2_3__");
      }
    );

    it(
      "should prefer shell version over system version",
      { requires: { shell: [">1"], system: [">1"] } },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.5", C8Y_SHELL_VERSION: "2.0.0" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.contain("2__");
      }
    );

    it(
      "should not add version if min version is 0",
      { requires: ["<2"] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.5" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq(
          "c8ypact__c8ypact_getCurrentTestId__should_not_add_version_if_min_version_is_0"
        );
      }
    );

    it(
      "should not add system version if range only has null value",
      { requires: [null] },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.5" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq(
          "c8ypact__c8ypact_getCurrentTestId__should_not_add_system_version_if_range_only_has_null_value"
        );
      }
    );

    it(
      "should not add system or shell version if ranges only have null value",
      { requires: { shell: [null], system: [null] } },
      function () {
        stubEnv({ C8Y_SYSTEM_VERSION: "1.2.5", C8Y_SHELL_VERSION: "2.0.0" });
        expect(Cypress.c8ypact.getCurrentTestId()).to.eq(
          "c8ypact__c8ypact_getCurrentTestId__should_not_add_system_or_shell_version_if_ranges_only_have_null_value"
        );
      }
    );
  });

  context("c8ypact recording", function () {
    beforeEach(() => {
      Cypress.env("C8Y_TENANT", undefined);
      Cypress.env("C8Y_PACT_MODE", "recording");
    });

    it("should have required recording setup", function () {
      expect(Cypress.c8ypact.isEnabled()).to.be.true;
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
      expect(Cypress.c8ypact.isMockingEnabled()).to.be.false;
      expect(Cypress.c8ypact.mode()).to.eq("recording");
    });

    it("should record c8ypacts if recording is enabled in environment", function () {
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
      expect(Cypress.c8ypact.current).to.be.null;

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .c8yclient<IManagedObject>((c, response) => {
          expect(response.status).to.eq(201);
          return c.inventory.detail(2, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(202);
          expect(Cypress.c8ypact.current).to.not.be.null;
          expect(Cypress.c8ypact.current!.records).to.have.length(2);
        });

      cy.then(() => {
        // pacts should have been written to expected folder
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records).to.have.length(2);
          const pactId = Cypress.c8ypact.getCurrentTestId();
          // check recorded file exists
          cy.readFile(`${Cypress.env("C8Y_PACT_FOLDER")}/${pactId}.json`);

          expect(isPactRecord(pact?.records[0])).to.be.true;
          expect(pact?.records[0].auth).to.deep.equal({
            user: "admin",
            type: "BasicAuth",
          });
        });
      });
    });

    it("should record c8ypact and replace existing records", function () {
      stubEnv({ C8Y_PACT_RECORDING_MODE: "replace" });
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.current).to.be.null;
      expect(Cypress.c8ypact.recordingMode()).to.eq("replace");

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .c8yclient<IManagedObject>((c, response) => {
          expect(response.status).to.eq(201);
          return c.inventory.detail(1, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(202);
          expect(Cypress.c8ypact.current).to.not.be.null;
          expect(Cypress.c8ypact.current!.records).to.have.length(1);
          expect(Cypress.c8ypact.current!.records[0].response.status).to.eq(
            202
          );
        });

      cy.then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records).to.have.length(1);
          expect(pact?.records[0].response.status).to.eq(202);
        });
      });
    });

    it("should record options and auth with alias", function () {
      Cypress.env("admin_username", "admin");
      Cypress.env("admin_password", "mypassword");

      cy.spy(Cypress.c8ypact, "savePact").log(false);

      cy.getAuth("admin")
        .c8yclient<IManagedObject>(
          (c) => {
            return c.inventory.detail(1, { withChildren: false });
          },
          {
            failOnStatusCode: false,
            preferBasicAuth: true,
          }
        )
        .then((response) => {
          expect(response.status).to.eq(201);
          // pacts are not validated when recording
          const spy = Cypress.c8ypact.savePact as sinon.SinonSpy;
          expect(spy).to.have.been.calledOnce;
          expect(spy.getCall(0).args[1]._auth).to.deep.eq({
            user: "admin",
            userAlias: "admin",
            type: "BasicAuth",
          });
          expect(spy.getCall(0).args[1]._options).to.deep.eq({
            ...defaultClientOptions(),
            failOnStatusCode: false,
            preferBasicAuth: true,
          });
        });
    });

    it("should record and restore pact objects with schema", function () {
      const schema = {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
        },
      };

      cy.spy(Cypress.c8ypact, "savePact").log(false);

      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>(
          (c) => c.inventory.detail(1, { withChildren: false }),
          {
            schema,
          }
        )
        .then((response) => {
          const spy = Cypress.c8ypact.savePact as sinon.SinonSpy;
          expect(spy).to.have.been.calledOnce;
          expect(spy.getCall(0).args[0].$body).to.deep.eq(schema);
          expect(response.$body).to.deep.eq(schema);
        })
        .then(() => {
          Cypress.c8ypact.loadCurrent().then((pact) => {
            expect(pact?.records).to.have.length(1);
            expect(pact?.records[0].response.$body).to.deep.equal(schema);
          });
        });
    });

    it("should add schema to records when saving pact", function () {
      const schema = {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
        },
      };
      cy.getAuth({ user: "admin", password: "mypassword", tenant: "test" })
        .c8yclient([
          (c) => c.inventory.detail(1, { withChildren: false }),
          (c) => c.inventory.detail(1, { withChildren: false }),
        ])
        .c8yclient((c) => c.inventory.detail(1), { schema })
        .then((response) => {
          Cypress.c8ypact.loadCurrent().then((pact) => {
            expect(pact?.records).to.have.length(3);
            expect(pact?.records[0].response.$body).to.not.be.null;
            expect(pact?.records[1].response.$body).to.not.be.null;
            expect(pact?.records[2].response.$body).to.deep.eq(schema);
          });
        });
    });

    it("should call savePact callback", function () {
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
      expect(Cypress.c8ypact.current).to.be.null;

      Cypress.c8ypact.on.savePact = (pact) => {
        pact.records[0].response.status = 299;
        return pact;
      };

      const savePactSpy = cy.spy(Cypress.c8ypact.on, "savePact");
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .c8yclient<IManagedObject>((c, response) => {
          expect(response.status).to.eq(201);
          return c.inventory.detail(2, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(202);
          expect(savePactSpy).to.have.been.calledTwice;
        });

      cy.then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records[0].response.status).to.eq(299);
          expect(pact?.records[1].response.status).to.eq(202);
        });
      });
    });

    it("should call saveRecord callback", function () {
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
      expect(Cypress.c8ypact.current).to.be.null;

      Cypress.c8ypact.on.saveRecord = (record) => {
        record.response.status = 299;
        return record;
      };

      const saveRecordSpy = cy.spy(Cypress.c8ypact.on, "saveRecord");
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .c8yclient<IManagedObject>((c, response) => {
          expect(response.status).to.eq(201);
          return c.inventory.detail(2, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(202);
          expect(saveRecordSpy).to.have.been.calledTwice;
        });

      cy.then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records[0].response.status).to.eq(299);
          expect(pact?.records[1].response.status).to.eq(299);
        });
      });
    });

    it("should not record pact if saveRecord callback returns undefined", function () {
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
      expect(Cypress.c8ypact.current).to.be.null;

      Cypress.c8ypact.on.saveRecord = () => undefined;
      const saveRecordSpy = cy.spy(Cypress.c8ypact.on, "saveRecord");
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(201);
          expect(saveRecordSpy).to.have.been.calledOnce;
          Cypress.c8ypact.loadCurrent().then((pact) => {
            expect(pact).to.be.null;
          });
        });
    });

    it("should not record pact if savePact callback returns undefined", function () {
      expect(Cypress.c8ypact.isRecordingEnabled()).to.be.true;
      expect(Cypress.c8ypact.recordingMode()).to.eq("refresh");
      expect(Cypress.c8ypact.current).to.be.null;

      Cypress.c8ypact.on.savePact = () => undefined;
      const savePactSpy = cy.spy(Cypress.c8ypact.on, "savePact");
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .then((response) => {
          expect(response.status).to.eq(201);
          expect(savePactSpy).to.have.been.calledOnce;
          Cypress.c8ypact.loadCurrent().then((pact) => {
            expect(pact).to.be.null;
          });
        });
    });
  });

  context("c8ypact recording of failing last request", function () {
    // requires afterEach to check recorded pact as in Cypress.once("fail")
    // Cypress.c8ypact.loadCurrent() can not be used
    it("should record last failing request", function (done) {
      Cypress.env("C8Y_PACT_MODE", "recording");
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
          status: 409,
          statusText: "Conflict",
          headers: { "content-type": "application/json" },
        }),
      ]);

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("c8yclient failed with: 409 (Conflict)");
        done();
      });

      const auth = { user: "admin", password: "mypassword", tenant: "test" };
      cy.getAuth(auth).c8yclient([
        (c) => c.inventory.detail(1, { withChildren: false }),
        (c) => c.inventory.detail(1, { withChildren: false }),
        (c) => c.inventory.detail(1, { withChildren: false }),
      ]);
    });

    afterEach(() => {
      Cypress.c8ypact.loadCurrent().then((pact) => {
        expect(pact?.records).to.have.length(3);
        expect(pact?.records[2].response.status).to.eq(409);
        expect(pact?.records[2].response.statusText).to.eq("Conflict");
      });
    });
  });

  context("c8ypact callback handlers", function () {
    let startSpy: sinon.SinonSpy;

    before(() => {
      Cypress.c8ypact.on.suiteStart = () => {
        cy.log("c8ypact on.suiteStart");
      };
      startSpy = cy.spy(Cypress.c8ypact.on, "suiteStart").log(false);
    });

    context("c8ypact on.suiteStart", function () {
      before(() => {
        Cypress.env("MY_SUITE_START", "true");
      });

      it("should call suiteStart callback", function () {
        expect(startSpy).to.have.been.calledOnce;
        expect(startSpy.getCall(0).args).to.have.length(1);
        expect(startSpy.getCall(0).args[0]).to.deep.eq([
          "c8ypact",
          "c8ypact callback handlers",
          "c8ypact on.suiteStart",
        ]);
        expect(Cypress.env("MY_SUITE_START")).to.eq("true");
      });
    });
  });

  context("c8ypact matching", function () {
    const response: Cypress.Response<any> = {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "application/json" },
      body: { name: "t123456789" },
      duration: 100,
      requestHeaders: { accept: "application/json" },
      allRequestResponses: [],
      isOkStatusCode: false,
      method: "GET",
      url:
        Cypress.config().baseUrl +
        "/inventory/managedObjects?fragmentType=abcd",
    };

    beforeEach(() => {
      Cypress.c8ypact.matcher = new C8yDefaultPactMatcher();
    });

    it("should use custom matcher", { auth: "admin" }, function (done) {
      stubEnv({ C8Y_PACT_MODE: "apply" });

      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: { url: "test" } } as any],
        {} as any,
        "test"
      );

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      expect(Cypress.c8ypact.matcher).to.be.instanceOf(AcceptAllMatcher);
      cy.c8yclient<IManagedObject>((c) =>
        c.inventory.detail(1, { withChildren: false })
      );

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Pact validation failed!");
        done();
      });

      cy.then(() => {
        Cypress.c8ypact.current = new C8yDefaultPact(
          [{ request: { url: "test" } } as any],
          {} as any,
          "test"
        );

        Cypress.c8ypact.matcher = new C8yDefaultPactMatcher();
        cy.c8yclient<IManagedObject>(
          (c) => c.inventory.detail(1, { withChildren: false }),
          { strictMatching: true }
        );
      });
    });

    it(
      "should fail for missing pact - failOnMissingPacts enabled",
      { c8ypact: { id: "non-existing-pact-id" }, auth: "admin" },
      function (done) {
        stubEnv({ C8Y_PACT_MODE: "apply" });
        Cypress.c8ypact.config.failOnMissingPacts = true;
        Cypress.c8ypact.current = null;

        Cypress.once("fail", (err) => {
          expect(err.message).to.contain(
            `Invalid pact or no records found in pact with id 'non-existing-pact-id'. Check pact file for errors. Disable Cypress.c8ypact.config.failOnMissingPacts to ignore.`
          );
          done();
        });

        cy.c8yclient<IManagedObject>([
          (c) => c.inventory.detail(1, { withChildren: false }),
          (c) => c.inventory.detail(1, { withChildren: false }),
        ]).then(() => {
          expect(Cypress.c8ypact.current).to.be.null;
        });
      }
    );

    it(
      "should fail for missing pact record with index - failOnMissingPacts enabled",
      { c8ypact: { id: "non-existing-pact-id" }, auth: "admin" },
      function (done) {
        stubEnv({ C8Y_PACT_MODE: "apply" });
        Cypress.env("C8Y_TENANT", "t1234");

        Cypress.c8ypact.config.failOnMissingPacts = true;
        Cypress.c8ypact.current = new C8yDefaultPact(
          [{ request: { url: "test" } } as any],
          {} as any,
          "test"
        );

        Cypress.once("fail", (err) => {
          expect(err.message).to.contain(
            "Record with index 1 not found in pact with id 'non-existing-pact-id'. Disable Cypress.c8ypact.config.failOnMissingPacts to ignore."
          );
          done();
        });

        cy.c8yclient<IManagedObject>([
          (c) => c.inventory.detail(1, { withChildren: false }),
          (c) => c.inventory.detail(1, { withChildren: false }),
        ]).then(() => {
          expect(Cypress.c8ypact.current).to.be.null;
        });
      }
    );

    it(
      "should not match if mode is not apply",
      { c8ypact: { id: "non-existing-pact-id" }, auth: "admin" },
      function () {
        Cypress.c8ypact.matcher = new AcceptAllMatcher();
        Cypress.c8ypact.current = new C8yDefaultPact(
          [{ request: { url: "test" } }, { request: { url: "test2" } } as any],
          {} as any,
          "test"
        );

        stubEnv({ C8Y_PACT_MODE: "mock" });
        const nextSpy = cy
          .spy(Cypress.c8ypact.current, "nextRecord")
          .log(false);
        const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match").log(false);

        cy.c8yclient<IManagedObject>([
          (c) => c.inventory.detail(1, { withChildren: false }),
          (c) => c.inventory.detail(1, { withChildren: false }),
        ]).then((response) => {
          expect(nextSpy).to.not.have.been.called;
          expect(matchSpy).to.not.have.been.called;
        });
      }
    );

    it(
      "should not fail for missing pact - failOnMissingPacts disbaled",
      { c8ypact: { id: "non-existing-pact-id" }, auth: "admin" },
      function () {
        Cypress.c8ypact.config.failOnMissingPacts = false;
        Cypress.c8ypact.current = null;

        cy.c8yclient<IManagedObject>([
          (c) => c.inventory.detail(1, { withChildren: false }),
          (c) => c.inventory.detail(1, { withChildren: false }),
        ]).then((response) => {
          expect(response.status).to.eq(202);
          expect(Cypress.c8ypact.current).to.be.null;
        });
      }
    );

    it("should match with existing pact", function () {
      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: { url: "test" } }, { request: { url: "test2" } } as any],
        {} as any,
        "test"
      );

      cy.spy(Cypress.c8ypact.current, "nextRecord").log(false);
      cy.spy(Cypress.c8ypact.matcher, "match").log(false);
      cy.getAuth({ user: "admin", password: "mypassword" })
        .c8yclient<IManagedObject>([
          (c) => c.inventory.detail(1, { withChildren: false }),
          (c) => c.inventory.detail(1, { withChildren: false }),
        ])
        .then((response) => {
          expect(response.status).to.eq(202);
          const recordSpy = Cypress.c8ypact.current!
            .nextRecord as sinon.SinonSpy;
          expect(recordSpy).to.have.been.calledTwice;

          const matchSpy = Cypress.c8ypact.matcher!.match as sinon.SinonSpy;
          expect(matchSpy).to.have.been.calledTwice;
          expect(matchSpy.getCall(0).args[1]).to.deep.eq({
            request: { url: "test" },
          });
          expect(matchSpy.getCall(1).args[1]).to.deep.eq({
            request: { url: "test2" },
          });
        });
    });

    it("should match with existing pact from failing request", function (done) {
      stubResponses([
        new window.Response(JSON.stringify({ name: "t123456789" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
        new window.Response("{}", {
          status: 409,
          statusText: "Conflict",
          headers: { "content-type": "application/json" },
        }),
      ]);

      Cypress.c8ypact.matcher = new AcceptAllMatcher();
      Cypress.c8ypact.current = new C8yDefaultPact(
        [{ request: { url: "test" } }, { request: { url: "test2" } } as any],
        {} as any,
        "test"
      );

      const recordSpy = cy.spy(Cypress.c8ypact.current, "nextRecord");
      const matchSpy = cy.spy(Cypress.c8ypact.matcher, "match");

      Cypress.once("fail", (err) => {
        // test should not fail with pact not found error, but with original error 409
        expect(err.message).to.contain("c8yclient failed with: 409 (Conflict)");
        expect(recordSpy).to.have.been.calledTwice;
        expect(matchSpy).to.have.been.calledTwice;
        done();
      });

      cy.getAuth({
        user: "admin",
        password: "mypassword",
        tenant: "t123456789",
      }).c8yclient<IManagedObject>([
        (c) => c.inventory.detail(1, { withChildren: false }),
        (c) => c.inventory.detail(1, { withChildren: false }),
      ]);
    });

    it("should match with schema", function () {
      const schema = {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
        },
      };

      const storedPreprocessor = _.cloneDeep(Cypress.c8ypact.preprocessor);
      Cypress.c8ypact.preprocessor = new C8yCypressEnvPreprocessor({
        ignore: ["request.headers", "response.isOkStatusCode"],
      });

      Cypress.c8ypact.current = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: Cypress.config("baseUrl")!,
      });
      Cypress.c8ypact.current!.records[0].response.$body = schema;

      const matchSpy = cy.spy(Cypress.c8ypact.schemaMatcher!, "match");

      cy.getAuth({ user: "admin", password: "mypassword", tenant: "test" })
        .c8yclient((c) => c.inventory.detail(1, { withChildren: false }), {
          strictMatching: true,
        })
        .then((response) => {
          expect(matchSpy).to.have.been.calledOnce;
          // called with obj, schema and strictMatching
          expect(matchSpy.getCall(0).args).to.deep.eq([
            response.body,
            schema,
            true,
          ]);
        })
        .then(() => {
          Cypress.c8ypact.preprocessor = storedPreprocessor;
        });
    });

    it("should match with $body ref", function (done) {
      const openapi = {
        openapi: "3.0.0",
        info: {
          title: "MySpec",
        },
        components: {
          schemas: {
            ManagedObject: {
              type: "object",
              properties: {
                name: {
                  type: "number",
                },
              },
            },
          },
        },
      };

      const storedPreprocessor = _.cloneDeep(Cypress.c8ypact.preprocessor);
      Cypress.c8ypact.preprocessor = new C8yCypressEnvPreprocessor({
        ignore: ["request.headers", "response.isOkStatusCode"],
      });

      const matcher = new C8yAjvSchemaMatcher();
      matcher.ajv.addSchema(openapi, "MySpec");
      Cypress.c8ypact.schemaMatcher = matcher;

      Cypress.c8ypact.current = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: Cypress.config("baseUrl")!,
      });
      Cypress.c8ypact.current!.records[0].response.$body = {
        $ref: "MySpec#/components/schemas/ManagedObject",
      };

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain(
          'Pact validation failed! Schema for "response > body" does not match'
        );
        expect(err.message).to.contain("data/name must be number");
        done();
      });

      cy.getAuth({ user: "admin", password: "mypassword", tenant: "test" })
        .c8yclient((c) => c.inventory.detail(1, { withChildren: false }), {
          strictMatching: true,
        })
        .then(() => {
          Cypress.c8ypact.preprocessor = storedPreprocessor;
        });
    });

    it("should fail if schema does not match", function (done) {
      const schema = {
        type: "object",
        properties: {
          name: {
            type: "number",
          },
        },
      };

      Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE", [
        "request.headers",
        "response.isOkStatusCode",
      ]);

      Cypress.c8ypact.current = C8yDefaultPact.from(response, {
        id: "testid",
        baseUrl: Cypress.config("baseUrl")!,
      });
      Cypress.c8ypact.current.records[0].response.$body = schema;

      Cypress.once("fail", (err) => {
        expect(err.message).to.contain("Pact validation failed!");
        done();
      });

      cy.getAuth({
        user: "admin",
        password: "mypassword",
        tenant: "test",
      }).c8yclient((c) => c.inventory.detail(1, { withChildren: false }));
    });
  });

  context("C8yCypressEnvPreprocessor", function () {
    beforeEach(() => {
      Cypress.env("C8Y_PACT_MODE", "recording");
      Cypress.c8ypact.config.preprocessor = {};
    });

    const cypressResponse: Partial<Cypress.Response<any>> = {
      headers: {
        date: "Fri, 17 Nov 2023 13:12:04 GMT",
        expires: "0",
      },
      requestHeaders: {
        Authorization: "asdasdasdasd",
        "content-type": "application/json",
        accept: "application/json",
        UseXBasic: "true",
      },
      body: {
        customProperties: {},
        creationTime: "2023-11-17T13:12:03.992Z",
        status: "WAITING_FOR_CONNECTION",
        password: "abasasapksasas",
      },
    };

    it("should not add any non-existing path", function () {
      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["requestHeaders.MyAuthorization", "body.password2"],
        ignoreCase: true,
      });
      expect(preprocessor.resolveOptions().ignore).to.deep.eq(
        C8yPactPreprocessorDefaultOptions.ignore
      );

      preprocessor.apply(obj);
      expect(obj?.requestHeaders?.Authorization).to.eq("asdasdasdasd");
      expect(obj.body.password).to.eq("abasasapksasas");
      expect(obj?.requestHeaders?.MyAuthorization).to.be.undefined;
      expect(obj.body.password2).to.be.undefined;
      expect("MyAuthorization" in obj?.requestHeaders!).to.be.false;
      expect("password2" in obj.body).to.be.false;
    });

    it("should use env variables if no options provided", function () {
      Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE", [
        "requestHeaders.Authorization",
        "body.password",
      ]);
      Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE", [
        "requestHeaders.date",
        "body.creationTime",
      ]);
      Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE_CASE", "true");
      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor();
      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscate: Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE"),
        ignore: Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE"),
        obfuscationPattern:
          C8yDefaultPactPreprocessor.defaultObfuscationPattern,
        ignoreCase: true,
      });
      preprocessor.apply(obj);

      const p = C8yPactPreprocessorDefaultOptions.obfuscationPattern;
      expect(obj.requestHeaders?.Authorization).to.eq(p);
      expect(obj.body.password).to.eq(p);
      expect(obj.requestHeaders?.date).to.be.undefined;
      expect(obj.body.creationTime).to.be.undefined;
    });

    it("should use config from env variables over options", function () {
      Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE", [
        "requestHeaders.Authorization",
        "body.password",
      ]);
      Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE", [
        "requestHeaders.date",
        "body.creationTime",
      ]);
      Cypress.env("C8Y_PACT_PREPROCESSOR_PATTERN", "xxxxxxxx");

      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["body.password"],
        ignore: ["body.status"],
      });

      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscate: Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE"),
        ignore: Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE"),
        obfuscationPattern: Cypress.env("C8Y_PACT_PREPROCESSOR_PATTERN"),
        ignoreCase: true,
      });
      preprocessor.apply(obj);

      expect(obj.requestHeaders?.Authorization).to.eq("xxxxxxxx");
      expect(obj.body.password).to.eq("xxxxxxxx");
      expect(obj.requestHeaders?.accept).to.not.be.undefined;
      expect(obj.body.status).to.not.be.undefined;
      expect(obj.requestHeaders?.date).to.be.undefined;
      expect(obj.body.creationTime).to.be.undefined;
    });

    it("should preprocess Cypress.Response", function () {
      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["requestHeaders.Authorization", "body.password"],
        ignore: ["requestHeaders.date", "body.creationTime"],
      });
      preprocessor.apply(obj);
      expect(obj.requestHeaders?.Authorization).to.eq("<abcdefg>");
      expect(obj.body.password).to.eq("<abcdefg>");
      expect(obj.requestHeaders?.date).to.be.undefined;
      expect(obj.body.creationTime).to.be.undefined;
    });

    it("should preprocess C8yDefaultPactRecord", function () {
      const obj = C8yDefaultPactRecord.from(_.cloneDeep(cypressResponse));
      expect(obj).to.not.be.null;
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["request.headers.Authorization", "response.body.password"],
        ignore: ["request.headers.date", "response.body.creationTime"],
      });
      preprocessor.apply(obj);
      expect((obj.request.headers! as any).Authorization).to.eq("<abcdefg>");
      expect(obj.response.body.password).to.eq("<abcdefg>");
      expect((obj.request.headers! as any).date).to.be.undefined;
      expect(obj.response.body.creationTime).to.be.undefined;
    });

    it("should not preprocess reserved keys", function () {
      const obj = {
        records: [C8yDefaultPactRecord.from(_.cloneDeep(cypressResponse))],
        info: {
          baseUrl: "http://localhost:8080",
        },
        id: "test",
      };
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["info", "id", "records"],
        ignore: ["info", "id", "records"],
      });
      preprocessor.apply(obj as C8yPact);
      expect(obj.records).to.deep.eq([
        C8yDefaultPactRecord.from(_.cloneDeep(cypressResponse)),
      ]);
      expect(obj.info).to.deep.eq({ baseUrl: "http://localhost:8080" });
      expect(obj.id).to.eq("test");
    });

    it("should preprocess C8yPact and preprocess records", function () {
      const obj = {
        records: [
          C8yDefaultPactRecord.from(_.cloneDeep(cypressResponse)),
          C8yDefaultPactRecord.from(_.cloneDeep(cypressResponse)),
          C8yDefaultPactRecord.from(_.cloneDeep(cypressResponse)),
        ],
      };
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["request.headers.Authorization", "response.body.password"],
        ignore: ["request.headers.date", "response.body.creationTime"],
      });
      preprocessor.apply(obj);
      // @ts-expect-error
      expect(obj.records[0].request.headers.Authorization).to.eq("<abcdefg>");
      expect(obj.records[0].response.body.password).to.eq("<abcdefg>");
      // @ts-expect-error
      expect(obj.records[1].request.headers.Authorization).to.eq("<abcdefg>");
      expect(obj.records[1].response.body.password).to.eq("<abcdefg>");
      // @ts-expect-error
      expect(obj.records[2].request.headers.Authorization).to.eq("<abcdefg>");
      expect(obj.records[2].response.body.password).to.eq("<abcdefg>");
      // @ts-expect-error
      expect(obj.records[0].request.headers.date).to.be.undefined;
      expect(obj.records[0].response.body.creationTime).to.be.undefined;
      // @ts-expect-error
      expect(obj.records[1].request.headers.date).to.be.undefined;
      expect(obj.records[1].response.body.creationTime).to.be.undefined;
      // @ts-expect-error
      expect(obj.records[2].request.headers.date).to.be.undefined;
      expect(obj.records[2].response.body.creationTime).to.be.undefined;
    });

    it("should preprocess response when saving pact", function () {
      const obfuscationPattern =
        C8yDefaultPactPreprocessor.defaultObfuscationPattern;
      Cypress.c8ypact.preprocessor = new C8yCypressEnvPreprocessor();
      stubResponses([
        new window.Response(JSON.stringify({ password: "sdqadasdadasd" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      cy.getAuth({
        user: "admin",
        password: "mypassword",
        tenant: "t123",
      })
        .c8yclient<IManagedObject>((c) => {
          return c.inventory.detail(1, { withChildren: false });
        })
        .then((response) => {
          expect(response.body.password).to.eq("sdqadasdadasd");
          expect(response.requestHeaders.Authorization).to.not.eq(
            obfuscationPattern
          );
        });

      Cypress.c8ypact.loadCurrent().then((pact) => {
        expect(pact?.records).to.have.length(1);
        const record = pact?.records[0];
        expect(record).to.not.be.null;
        expect(_.get(record, "request.headers.Authorization")).to.eq(
          "Basic " + obfuscationPattern
        );
        expect(_.get(record, "response.body.password")).to.eq(
          obfuscationPattern
        );
      });
    });

    it("should not add preprocessed properties and store options in info", function () {
      cy.setCookie("XSRF-TOKEN", "fsETfgIBdAnEyOLbADTu22");
      Cypress.env("C8Y_TENANT", "t1234");
      Cypress.c8ypact.config.preprocessor = {
        obfuscationPattern: "asdasd",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.date"],
      };

      stubResponses([
        new window.Response(JSON.stringify({ test: "test" }), {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
        }),
      ]);
      cy.c8yclient<IManagedObject>((c) => {
        return c.inventory.detail(1, { withChildren: false });
      }).then(() => {
        Cypress.c8ypact.loadCurrent().then((pact) => {
          expect(pact?.records).to.have.length(1);
          const record = pact?.records[0];
          expect(record).to.not.be.null;
          expect(_.has(record, "request.headers.Authorization")).to.be.false;
          expect(record?.response.body.password).to.be.undefined;
          expect(pact?.info.preprocessor).to.deep.eq({
            obfuscationPattern: "asdasd",
            obfuscate: ["body.password"],
            ignore: ["requestHeaders.date"],
            ignoreCase: true,
          });
          expect(pact?.info.preprocessor).to.deep.eq(
            (Cypress.c8ypact.preprocessor! as any).resolveOptions()
          );
        });
      });
    });

    it("should allow overriding preprocessor options with apply options", function () {
      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yDefaultPactPreprocessor({
        obfuscationPattern: "<abcdefg>",
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["requestHeaders.date", "body.creationTime"],
      });
      preprocessor.apply(obj, {
        obfuscationPattern: "test",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
      });
      expect(obj.body.password).to.eq("test");
      expect(obj.requestHeaders?.UseXBasic).to.be.undefined;
    });

    it("should allow overriding preprocessor options with config options", function () {
      const obj = _.cloneDeep(cypressResponse);
      Cypress.c8ypact.config.preprocessor = {
        obfuscationPattern: "test",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
      };

      const preprocessor = new C8yCypressEnvPreprocessor();
      expect((preprocessor as any).resolveOptions()).to.deep.eq({
        obfuscationPattern: "test",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
        ignoreCase: true,
      });
    });

    it("should use config options when no env variables are set", function () {
      const obj = _.cloneDeep(cypressResponse);
      Cypress.c8ypact.config.preprocessor = {
        obfuscationPattern: "config-pattern",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
      };
      const preprocessor = new C8yCypressEnvPreprocessor();

      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscationPattern: "config-pattern",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
        ignoreCase: true,
      });

      preprocessor.apply(obj);
      expect(obj.body.password).to.eq("config-pattern");
      expect(obj.requestHeaders?.UseXBasic).to.be.undefined;
      expect(obj.requestHeaders?.Authorization).to.eq("asdasdasdasd"); // not obfuscated
    });

    it("should prioritize env variables over config options", function () {
      stubEnv({
        C8Y_PACT_PREPROCESSOR_OBFUSCATE: "requestHeaders.Authorization",
        C8Y_PACT_PREPROCESSOR_PATTERN: "env-pattern",
      });

      Cypress.c8ypact.config.preprocessor = {
        obfuscationPattern: "config-pattern",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
      };

      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor();

      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscationPattern: "env-pattern",
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["requestHeaders.UseXBasic"], // from config, no env override
        ignoreCase: true,
      });

      preprocessor.apply(obj);
      expect(obj.requestHeaders?.Authorization).to.eq("env-pattern");
      expect(obj.body.password).to.eq("abasasapksasas"); // not obfuscated
      expect(obj.requestHeaders?.UseXBasic).to.be.undefined;
    });

    it("should prioritize apply options over all other configurations", function () {
      Cypress.c8ypact.config.preprocessor = {
        obfuscationPattern: "config-pattern",
        obfuscate: ["body.password"],
        ignore: ["requestHeaders.UseXBasic"],
      };

      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<constructor>",
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["body.status"],
      });

      preprocessor.apply(obj, {
        obfuscationPattern: "apply-pattern",
        obfuscate: ["body.password", "requestHeaders.accept"],
        ignore: ["requestHeaders.date"],
      });

      expect(obj.body.password).to.eq("apply-pattern");
      expect(obj.requestHeaders?.accept).to.eq("apply-pattern");
      expect(obj.requestHeaders?.Authorization).to.eq("asdasdasdasd"); // env still applies for non-overridden
      expect(obj.requestHeaders?.date).to.be.undefined;
      expect(obj.requestHeaders?.UseXBasic).to.eq("true"); // not ignored by apply options
    });

    it("should use constructor options when no higher priority options are set", function () {
      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<constructor>",
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["body.creationTime"],
      });

      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscationPattern: "<constructor>",
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["body.creationTime"],
        ignoreCase: true,
      });

      preprocessor.apply(obj);
      expect(obj.requestHeaders?.Authorization).to.eq("<constructor>");
      expect(obj.body.creationTime).to.be.undefined;
      expect(obj.body.password).to.eq("abasasapksasas"); // not obfuscated
    });

    it("should merge partial configurations correctly", function () {
      stubEnv({
        C8Y_PACT_PREPROCESSOR_PATTERN: "env-pattern",
      });
      // No obfuscate or ignore env variables set

      Cypress.c8ypact.config.preprocessor = {
        obfuscate: ["body.password"],
        // No obfuscationPattern in config
      };

      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        ignore: ["requestHeaders.UseXBasic"],
        ignoreCase: false, // different from default
      });

      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscate: ["body.password"],
        obfuscationPattern: "env-pattern",
        ignore: ["requestHeaders.UseXBasic"],
        ignoreCase: false, // different from default
      });

      preprocessor.apply(obj);
      expect(obj.body.password).to.eq("env-pattern");
      expect(obj.requestHeaders?.UseXBasic).to.be.undefined;
      expect(obj.requestHeaders?.Authorization).to.eq("asdasdasdasd"); // not obfuscated
    });

    it("should handle empty config and env gracefully", function () {
      // Clear any existing config
      delete Cypress.c8ypact.config.preprocessor;

      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["body.creationTime"],
      });

      expect(preprocessor.resolveOptions()).to.deep.eq({
        obfuscationPattern:
          C8yDefaultPactPreprocessor.defaultObfuscationPattern,
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["body.creationTime"],
        ignoreCase: true, // env default
      });
    });

    it("should handle undefined config properties correctly", function () {
      Cypress.c8ypact.config.preprocessor = {
        obfuscationPattern: undefined,
        obfuscate: undefined,
        ignore: ["requestHeaders.UseXBasic"],
      } as any;

      const obj = _.cloneDeep(cypressResponse);
      const preprocessor = new C8yCypressEnvPreprocessor({
        obfuscationPattern: "<constructor>",
        obfuscate: ["requestHeaders.Authorization"],
        ignore: ["body.creationTime"],
      });

      preprocessor.apply(obj);
      expect(obj.requestHeaders?.Authorization).to.eq("<constructor>");
      expect(obj.body.creationTime).to.be.undefined;
      expect(obj.requestHeaders?.UseXBasic).to.not.be.undefined;
      expect(obj.body.password).to.eq("abasasapksasas"); // not obfuscated
    });
  });
});
