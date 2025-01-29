import {
  C8yDefaultPact,
  C8yDefaultPactRecord,
  C8yPact,
  C8yPactConfigKeys,
  C8yPactConfigOptions,
  C8yPactID,
  C8yPactInfo,
  C8yPactRecord,
  C8yPactPreprocessor,
  C8ySchemaGenerator,
  C8ySchemaMatcher,
  C8yDefaultPactMatcher,
  C8yPactMatcher,
  toPactSerializableObject,
  C8yPactEnv,
  C8yPactSaveKeys,
  C8yPactMode,
  C8yPactRecordingMode,
  C8yPactRecordingModeValues,
  C8yPactModeValues,
  pactId,
  validatePactMode,
  getEnvVar,
} from "../../shared/c8ypact";
import { C8yDefaultPactRunner, C8yPactRunner } from "./runner";
import { C8yAuthOptions } from "../../shared/auth";
import { C8yClient } from "../../shared/c8yclient";
import {
  getBaseUrlFromEnv,
  getShellVersionFromEnv,
  getSystemVersionFromEnv,
} from "../utils";
import {
  getMinSatisfyingVersion,
  getMinimizedVersionString,
} from "../../shared/versioning";

const { _ } = Cypress;

import { FetchClient, IAuthentication } from "@c8y/client";
import { C8yPactFetchClient } from "./fetchclient";
import { validateBaseUrl } from "cumulocity-cypress/shared/c8ypact/url";
import { C8yCypressEnvPreprocessor } from "./cypresspreprocessor";

declare global {
  namespace Cypress {
    interface Cypress {
      c8ypact: CypressC8yPact;
    }

    interface SuiteConfigOverrides {
      c8ypact?: C8yPactConfigOptions;
    }

    interface TestConfigOverrides {
      c8ypact?: C8yPactConfigOptions;
    }

    interface RuntimeConfigOptions {
      c8ypact?: C8yPactConfigOptions;
    }
  }

  /**
   * Options for saving pact objects.
   */
  interface C8yPactSaveOptions {
    noqueue: boolean;
    modifiedResponse?: Cypress.Response<any>;
    loggedInUser?: string;
    loggedInUserAlias?: string;
  }

  /**
   * C8yPact Cypress interface. Contains all functions and properties to interact and configure
   * processing of C8yPact objects.
   */
  interface CypressC8yPact {
    /**
     * The pact mode for the current tests.
     */
    mode: () => C8yPactMode;
    /**
     * The pact recording mode for the current tests.
     */
    recordingMode: () => C8yPactRecordingMode;
    /**
     * Create a C8yPactID for the current test case.
     */
    getCurrentTestId(): C8yPactID;
    /**
     * The pact object for the current test case. null if there is no recorded pact for current test.
     */
    current: C8yPact | null;
    /**
     * The C8yPactMatcher implementation used to match requests and responses. Default is C8yDefaultPactMatcher.
     * Can be overridden by setting a matcher in C8yPactConfigOptions.
     */
    matcher?: C8yPactMatcher;
    /**
     * The C8yPactPreprocessor implementation used to preprocess the pact objects.
     */
    preprocessor?: C8yPactPreprocessor;
    /**
     * The C8ySchemaGenerator implementation used to generate json schemas from json objects. The
     * implementation of `C8ySchemaGenerator` must support browser runtimes!
     * Default is undefined and schema generation is disabled.
     */
    schemaGenerator?: C8ySchemaGenerator;
    /**
     * The C8ySchemaMatcher implementation used to match json schemas. The schema matcher implementation
     * must support browser runtimes! Default is undefined and schema matching is disabled.
     */
    schemaMatcher?: C8ySchemaMatcher;
    /**
     * Save the given response as a pact record in the pact for the current test case.
     */
    savePact: (
      response:
        | Cypress.Response<any>
        | C8yPact
        | Pick<C8yPact, C8yPactSaveKeys>,
      client?: C8yClient,
      options?: C8yPactSaveOptions
    ) => Promise<void>;
    /**
     * Checks if the C8yPact is enabled. Use C8Y_PACT_IGNORE="true" to disable by default.
     */
    isEnabled: () => boolean;
    /**
     * Checks if the C8yPact is enabled and in recording mode. Use C8Y_PACT_MODE="record" to enable recording.
     */
    isRecordingEnabled: () => boolean;
    /**
     * Checks if the C8yPact is enabled and in mocking mode. Use C8Y_PACT_MODE="mock" to enable mocking.
     */
    isMockingEnabled: () => boolean;
    /**
     * Runtime used to run the pact objects. Default is C8yDefaultPactRunner.
     */
    pactRunner?: C8yPactRunner;
    /**
     * Use debugLog to enable logging of debug information to the Cypress debug log.
     */
    debugLog: boolean;

    config: Omit<C8yPactConfigOptions, "id">;
    /**
     * Resolves config values from current test annotation and global config in Cypress.c8ypact.config.
     * If needed also resolves environment variables.
     * @param key The key of the config value to resolve.
     */
    getConfigValue<T = any>(
      key: C8yPactConfigKeys,
      defaultValue?: any
    ): T | undefined;
    /**
     * Resolves config values from current test annotation and global config in Cypress.c8ypact.config.
     */
    getConfigValues(): C8yPactConfigOptions;
    /**
     * Loads the pact object for the current test from the pact file. If
     * there is no stored pact object for the current test, null is returned.
     */
    loadCurrent(): Cypress.Chainable<C8yPact | null>;
    /**
     * Resolves all environment variables as a C8yPactEnv object.
     */
    env(): C8yPactEnv;
    /**
     * Create a custom FetchClient from given auth options and baseUrl. Default implementation
     * of FetchClient is C8yPactFetchClient. Override to provide a custom FetchClient implementation to
     * cy.mount. If undefined is returned, cy.mount will not register a custom FetchClient provider.
     */
    createFetchClient(
      auth: C8yAuthOptions | IAuthentication | undefined,
      baseUrl: string
    ): FetchClient;
    /**
     * Callbacks for hooking into the pact object lifecycle.
     */
    on: CypressC8yPactCallbackOptions;
  }

  export interface CypressC8yPactCallbackOptions {
    /**
     * Called before a request and its response are saved. By returning `undefined`, the
     * request is ignored and not saved. Use for custom preprocessing or filtering of records.
     * @param record The request and response to be saved as `C8yPactRecord`.
     * @returns C8yPactRecord or undefined if the record should be ignored.
     */
    saveRecord?: (record: C8yPactRecord) => C8yPactRecord | undefined;
    /**
     * Called before a record is mocked. By returning `undefined`, the pact is ignored and not mocked.
     * @param record The record to use for creating a mock response.
     * @returns C8yPactRecord or undefined if the record should be ignored.
     */
    mockRecord?: (
      record: C8yPactRecord | undefined
    ) => C8yPactRecord | undefined;
    /**
     * Called before a pact is saved. By returning `undefined`, the pact is ignored and not saved.
     * @param pact The pact to be saved.
     * @returns C8yPact or undefined if the pact should be ignored.
     */
    savePact?: (pact: C8yPact) => C8yPact | undefined;
    /**
     * Called after a pact has been loaded and initialized as `Cypress.c8ypact.current`.
     * @param pact The pact that has been loaded.
     * @returns C8yPact now used as `Cypress.c8ypact.current`.
     */
    loadPact?: (pact: C8yPact) => void;
    /**
     * Called for matching errors from `cy.c8ymatch` for custom error handling. By providing a custom
     * error handler, the default error handling is disabled. To fail tests for matching errors, you
     * must throw an error in the custom error handler.
     * @param matcher The matcher used to match the request and response.
     * @param record The pact record used for matching.
     * @param options The options used for matching.
     */
    matchingError?: (
      matcher: C8yPactMatcher | C8ySchemaMatcher,
      error: Error,
      options: any
    ) => void;
    /**
     * Called for every mocha suite started.
     * @param titlePath The title path including parent suite names
     */
    suiteStart?: (titlePath: string[]) => void;
  }

  /**
   * The C8yPactNextRecord contains a single pact record and the info object.
   */
  type C8yPactNextRecord = { record: C8yPactRecord; info?: C8yPactInfo };
}

// initialize the following only once. note, cypresspact.ts could be imported multiple times
// resulting in multiple initializations of the c8ypact object as well as before and beforeEach hooks.
if (_.get(Cypress, "__c8ypact.initialized") === undefined) {
  _.set(Cypress, "__c8ypact.initialized", true);
  const globalIgnore = Cypress.env("C8Y_PACT_IGNORE");
  Cypress.c8ypact = {
    current: null,
    mode,
    getCurrentTestId,
    isRecordingEnabled,
    isMockingEnabled,
    savePact,
    isEnabled,
    recordingMode,
    matcher: new C8yDefaultPactMatcher(),
    pactRunner: new C8yDefaultPactRunner(),
    schemaGenerator: undefined,
    schemaMatcher: undefined,
    debugLog: false,
    preprocessor: new C8yCypressEnvPreprocessor({
      obfuscate: ["request.headers.Authorization", "response.body.password"],
    }),
    on: {},
    config: {
      log: false,
      ignore: globalIgnore === "true" || globalIgnore === true,
      failOnMissingPacts: true,
      strictMatching: true,
      strictMocking: true,
      requestMatching: {
        ignoreUrlParameters: ["dateFrom", "dateTo", "_"],
        baseUrl: getBaseUrlFromEnv(),
      },
    },
    getConfigValue: (key: C8yPactConfigKeys, defaultValue?: any) => {
      const value =
        _.get(Cypress.config().c8ypact, key) ??
        _.get(Cypress.c8ypact.config, key);
      return value != null ? value : defaultValue;
    },
    getConfigValues: () => {
      const config = _.merge(
        {},
        Cypress.c8ypact.config,
        Cypress.config().c8ypact
      );
      config.consumer = _.isString(config.consumer)
        ? { name: config.consumer }
        : config.consumer;
      config.producer = _.isString(config.producer)
        ? { name: config.producer }
        : config.producer;
      return config;
    },
    loadCurrent(): Cypress.Chainable<C8yPact | null> {
      if (!isEnabled()) {
        return cy.wrap<C8yPact | null>(null, debugLogger());
      }
      return cy
        .task<C8yPact | null>(
          "c8ypact:get",
          Cypress.c8ypact.getCurrentTestId(),
          debugLogger()
        )
        .then((pact) => {
          if (pact == null) return cy.wrap<C8yPact | null>(null, debugLogger());

          // required to map the record object to a C8yPactRecord here as this can
          // not be done in the plugin
          pact.records = pact.records?.map((record) => {
            return C8yDefaultPactRecord.from(record);
          });
          return cy.wrap<C8yPact | null>(
            new C8yDefaultPact(pact.records, pact.info, pact.id),
            debugLogger()
          );
        });
    },
    env: () => {
      return {
        tenant: Cypress.env("C8Y_TENANT"),
        systemVersion: getSystemVersionFromEnv(),
        loggedInUser: Cypress.env("C8Y_LOGGED_IN_USER"),
        loggedInUserAlias: Cypress.env("C8Y_LOGGED_IN_USER_ALIAS"),
        pluginFolder: Cypress.env("C8Y_PACT_FOLDER"),
        pluginLoaded: Cypress.env("C8Y_PLUGIN_LOADED") === "true",
        testTitlePath: Cypress.currentTest?.titlePath || [],
        preporcessorOptions: {
          ignore: Cypress.env("C8Y_PACT_PREPROCESSOR_IGNORE"),
          obfuscate: Cypress.env("C8Y_PACT_PREPROCESSOR_OBFUSCATE"),
          obfuscationPattern: Cypress.env("C8Y_PACT_PREPROCESSOR_PATTERN"),
        },
      };
    },
    createFetchClient: (auth: C8yAuthOptions, baseUrl: string) => {
      return new C8yPactFetchClient({
        cypresspact: Cypress.c8ypact,
        auth,
        baseUrl,
      });
    },
  };

  const runner = (Cypress as any).mocha.getRunner();
  runner.on("suite", (suite: any) => {
    const callback = Cypress.c8ypact.on.suiteStart;
    if (_.isFunction(callback)) {
      callback(getSuiteTitles(suite));
    }
  });

  beforeEach(function () {
    Cypress.c8ypact.current = null;

    let consoleProps: any = {};
    let logger: Cypress.Log | undefined = undefined;
    if (Cypress.c8ypact.debugLog === true) {
      consoleProps = {
        current: Cypress.c8ypact.current || null,
        isEnabled: Cypress.c8ypact.isEnabled(),
        isRecordingEnabled: Cypress.c8ypact.isRecordingEnabled(),
        isMockingEnabled: Cypress.c8ypact.isMockingEnabled(),
        mode: Cypress.c8ypact.mode(),
        baseUrl: getBaseUrlFromEnv(),
        recordingMode: Cypress.c8ypact.recordingMode(),
        matcher: Cypress.c8ypact.matcher || null,
        pactRunner: Cypress.c8ypact.pactRunner || null,
        schemaGenerator: Cypress.c8ypact.schemaGenerator || null,
        schemaMatcher: Cypress.c8ypact.schemaMatcher || null,
        debugLog: Cypress.c8ypact.debugLog,
        preprocessor: Cypress.c8ypact.preprocessor || null,
        on: Cypress.c8ypact.on || null,
        config: Cypress.c8ypact.getConfigValues(),
        annotations: Cypress.config().c8ypact,
        currentTestId: Cypress.c8ypact.getCurrentTestId(),
        env: Cypress.c8ypact.env(),
        cypressEnv: Cypress.env(),
        systemVersion: getSystemVersionFromEnv(),
      };

      logger = Cypress.log({
        autoEnd: false,
        name: "c8ypact",
        message: "init",
        consoleProps: () => consoleProps,
      });
    }

    try {
      validatePactMode(getEnvVar("C8Y_PACT_MODE"));
      validateBaseUrl(getBaseUrlFromEnv());
    } catch (error) {
      logger?.end();
      throw error;
    }

    if (!isEnabled()) {
      logger?.end();
      return;
    }

    if (isRecordingEnabled() && recordingMode() === "refresh") {
      cy.task(
        "c8ypact:remove",
        Cypress.c8ypact.getCurrentTestId(),
        debugLogger()
      );
    }

    Cypress.c8ypact.loadCurrent().then((pact) => {
      Cypress.c8ypact.current = pact;
      consoleProps.current = pact;

      // set tenant and baseUrl from pact info if not configured
      // this is needed to not require tenant and baseUrl for fully mocked tests
      if (!Cypress.env("C8Y_TENANT") && pact?.info?.tenant) {
        Cypress.env("C8Y_TENANT", pact?.info?.tenant);
      }

      const baseUrl = getBaseUrlFromEnv();
      const pactBaseUrl = pact?.info?.baseUrl;
      if (
        baseUrl == null ||
        (pactBaseUrl != null && baseUrl === Cypress.config().baseUrl)
      ) {
        Cypress.env("C8Y_BASEURL", pactBaseUrl);
        consoleProps.baseUrl = getBaseUrlFromEnv();
      }

      if (pact != null && _.isFunction(Cypress.c8ypact.on.loadPact)) {
        Cypress.c8ypact.on.loadPact(pact);
      }

      logger?.end();
    });
  });
}

function debugLogger(): Cypress.Loggable {
  return { log: Cypress.c8ypact.debugLog };
}

function isEnabled(): boolean {
  if (Cypress.env("C8Y_PLUGIN_LOADED") == null) return false;
  if (mode() === "disabled") return false;

  if (Cypress.config().c8ypact?.ignore === true) {
    return false;
  } else {
    if (
      Cypress.c8ypact.config.ignore === true ||
      Cypress.env("C8Y_PACT_IGNORE") === "true"
    ) {
      return false;
    }
  }
  return true;
}

function isRecordingEnabled(): boolean {
  const values = ["record", "recording"];
  return isEnabled() && values.includes(Cypress.c8ypact.mode());
}

function isMockingEnabled(): boolean {
  const values = ["apply", "mock", "mocking"];
  return isEnabled() && values.includes(Cypress.c8ypact.mode());
}

function mode(): C8yPactMode {
  let mode = Cypress.env("C8Y_PACT_MODE") || "disabled";
  const values = Object.values(C8yPactModeValues) as string[];
  if (!_.isString(mode) || !values.includes(mode.toLowerCase())) {
    mode = "disabled";
  }
  return mode.toLowerCase() as C8yPactMode;
}

function recordingMode() {
  const keys: string[] = Object.values(C8yPactRecordingModeValues);
  const mode: string =
    Cypress.config().c8ypact?.recordingMode ||
    Cypress.env("C8Y_PACT_RECORDING_MODE") ||
    C8yPactRecordingModeValues[0];

  if (!mode || !_.isString(mode) || !keys.includes(mode.toLowerCase())) {
    const error = new Error(
      `Unsupported recording mode: ${mode}. Supported values are: ${keys.join(
        ", "
      )}`
    );
    error.name = "C8yPactError";
    throw error;
  }
  return mode.toLowerCase() as C8yPactRecordingMode;
}

function getCurrentTestId(): C8yPactID {
  let result: string[] | undefined = undefined;
  const pact = Cypress.config().c8ypact;
  if (pact?.id != null && pactId(pact.id) != null) {
    result = [pact.id];
  }

  if (result == null) {
    result = Cypress.currentTest?.titlePath;
    if (result == null) {
      result = Cypress.spec?.relative?.split("/").slice(-2);
    }
  }

  const requires = Cypress.config().requires;
  const requiredVersion = _.isArrayLike(requires)
    ? requires
    : requires?.shell || requires?.system;

  // for now prefer shell version over system version
  const version =
    _.isArrayLike(requires) || requires?.shell == null
      ? getSystemVersionFromEnv()
      : getShellVersionFromEnv();

  if (version != null && result != null && requiredVersion != null) {
    const minVersion = getMinSatisfyingVersion(version, requiredVersion);
    if (minVersion != null) {
      const mv = getMinimizedVersionString(minVersion);
      if (mv != null && mv !== "0") {
        result.unshift(mv);
      }
    }
  }

  if (result != null) {
    const pId = pactId(result);
    if (pId != null) {
      return pId;
    }
  }

  const error = new Error("Failed to get or create pact id for current test.");
  error.name = "C8yPactError";
  throw error;
}

function getSuiteTitles(suite: any): string[] {
  if (suite.parent && !_.isEmpty(suite.parent.title)) {
    return [...getSuiteTitles(suite.parent), suite.title];
  }
  return [suite.title];
}

async function savePact(
  response: Cypress.Response<any> | C8yPact | Pick<C8yPact, C8yPactSaveKeys>,
  client?: C8yClient,
  options: C8yPactSaveOptions = { noqueue: false }
): Promise<void> {
  if (!isEnabled()) return;

  const baseUrl = getBaseUrlFromEnv() || "";
  const consoleProps: any = {
    response,
    client,
    options,
  };
  let logger: Cypress.Log | undefined = undefined;
  let pactDesc = "";

  try {
    let pact: Pick<C8yPact, C8yPactSaveKeys>;
    if ("records" in response && "info" in response) {
      pact = response;
      consoleProps.pact = pact;
      pactDesc = `${pact.id} (${pact.records.length} records)`;
    } else {
      const info: C8yPactInfo = {
        ...Cypress.c8ypact.getConfigValues(),
        id: Cypress.c8ypact.getCurrentTestId(),
        title: Cypress.currentTest?.titlePath || [],
        tenant: client?._client?.core.tenant || Cypress.env("C8Y_TENANT"),
        baseUrl,
        preprocessor: (
          Cypress.c8ypact.preprocessor as C8yCypressEnvPreprocessor
        )?.resolveOptions(),
      };
      const systemVersion = getSystemVersionFromEnv();
      if (systemVersion != null) {
        info.version = {
          system: systemVersion,
          shell: getShellVersionFromEnv(),
          shellName: Cypress.env("C8Y_SHELL_NAME") || "cockpit",
        };
      }
      pact = await toPactSerializableObject(response, info, {
        loggedInUser:
          options?.loggedInUser ?? Cypress.env("C8Y_LOGGED_IN_USER"),
        loggedInUserAlias:
          options?.loggedInUserAlias ?? Cypress.env("C8Y_LOGGED_IN_USER_ALIAS"),
        client,
        modifiedResponse: options?.modifiedResponse,
        preprocessor: Cypress.c8ypact.preprocessor,
        schemaGenerator: Cypress.c8ypact.schemaGenerator,
      });
      pactDesc = `${response.url?.replace(baseUrl, "") || ""}`;
    }

    if (Cypress.c8ypact.debugLog === true) {
      logger = Cypress.log({
        autoEnd: false,
        name: "c8ypact",
        message: `record ${recordingMode()} ${pactDesc}`,
        consoleProps: () => consoleProps,
      });
    }

    if (!pact || !_.isArray(pact.records) || _.isEmpty(pact.records)) {
      logger?.end();
      return;
    }

    if (_.isFunction(Cypress.c8ypact.on.saveRecord)) {
      let r = _.first(pact.records);
      if (r) {
        r = Cypress.c8ypact.on.saveRecord(r);
      }
      if (!r) {
        consoleProps.discarded = "on.saveRecord()";
        return;
      }
    }

    if (Cypress.c8ypact.current == null) {
      Cypress.c8ypact.current = new C8yDefaultPact(
        pact.records,
        pact.info,
        pact.id
      );
    } else {
      const recordingMode = Cypress.c8ypact.recordingMode();
      // should contain only one record, but making sure we append all
      if (
        recordingMode === "append" ||
        recordingMode === "new" ||
        // refresh is the same as append as for refresh we remove the pact in each tests beforeEach
        recordingMode === "refresh"
      ) {
        for (const record of pact.records) {
          Cypress.c8ypact.current.appendRecord(record, recordingMode === "new");
        }
      } else if (recordingMode === "replace") {
        for (const record of pact.records) {
          Cypress.c8ypact.current.replaceRecord(record);
        }
      }
    }

    let pactToSave: C8yPact | undefined = Cypress.c8ypact.current;
    if (_.isFunction(Cypress.c8ypact.on?.savePact)) {
      pactToSave = Cypress.c8ypact.on.savePact(Cypress.c8ypact.current);
    }
    if (pactToSave == null) {
      consoleProps.discarded = "on.savePact()";
      logger?.end();
      return;
    }
    consoleProps.pact = Cypress.c8ypact.current;
    save(Cypress.c8ypact.current, options);
  } catch (error) {
    consoleProps.error = error;
    console.error("Failed to save pact. ", error);
  }
  logger?.end();
}

function save(pact: any, options: C8yPactSaveOptions) {
  const taskName = "c8ypact:save";
  if (options?.noqueue === true) {
    if (
      Cypress.testingType === "component" &&
      Cypress.semver.gte(Cypress.version, "12.15.0")
    ) {
      return new Promise((resolve) => setTimeout(resolve, 5))
        .then(() =>
          // @ts-expect-error
          Cypress.backend("run:privileged", {
            commandName: "task",
            userArgs: [taskName, pact],
            options: {
              task: taskName,
              arg: pact,
            },
          })
        )
        .catch(() => {
          /* noop */
        });
    }
    // @ts-expect-error
    const { args, promise } = Cypress.emitMap("command:invocation", {
      name: "task",
      args: [taskName, pact],
    })[0];
    new Promise((r) => promise.then(r))
      .then(() =>
        // @ts-expect-error
        Cypress.backend("run:privileged", {
          commandName: "task",
          args,
          options: {
            task: taskName,
            arg: pact,
          },
        })
      )
      .catch(() => {
        /* noop */
      });
  } else {
    cy.task("c8ypact:save", pact, debugLogger());
  }
}
