import {
  C8yBaseUrl,
  C8yTenant,
  C8yTestHierarchyTree,
} from "../../shared/types";
import { C8yAuthOptions, C8yClientOptions } from "../../shared/c8yclient";
import {
  C8yPact,
  C8yPactInfo,
  C8yPactRecord,
  getCreatedObjectId,
  isPact,
} from "../../shared/c8ypact";
import { getBaseUrlFromEnv, throwError } from "../utils";
import { Client } from "@c8y/client";
import { buildTestHierarchy, to_array } from "../../shared/util";

const { _ } = Cypress;

// Infos:
// https://github.com/cypress-io/cypress-example-recipes/tree/master/examples/fundamentals__dynamic-tests
// Cannot dynamically create tests with cy.task
// https://github.com/cypress-io/cypress/issues/5418
// Ability to dynamically create tests while inside of a test
// https://github.com/cypress-io/cypress/issues/7757

/**
 * Configuration options for C8yPactRunner.
 */
export interface C8yPactRunnerOptions {
  /**
   * Filter for consumer name.
   */
  consumer?: string;
  /**
   * Filter for producer name.
   */
  producer?: string;
  /**
   * Filter for methods.
   */
  methods?: string[];
  /**
   * Authentication type for the runner. Supported values are `CookieAuth` and `BasicAuth`.
   */
  authType?: "CookieAuth" | "BasicAuth";
  /**
   * Path prefix filter for the runner.
   */
  paths?: string[];
  /**
   * Assertions for the runner. If one of the assertions fail on request execution,
   * the test will fail.
   */
  assertions?: C8yPactRunnerAssertions
}

export interface C8yPactRunnerAssertions {
  /**
   * Maximum request duration in milliseconds. If one request takes longer than this value,
   * the test will fail. If not set, no duration check is performed.
   */
  maxRequestDuration?: number;
}

/**
 * Runtime for C8yPact objects. A runner will create the tests dynamically based on
 * the pact objects information and rerun recorded requests.
 */
export interface C8yPactRunner {
  /**
   * Runs all pact objects. Will create the tests dynamically for each pact object.
   *
   * @param pacts Pact objects to run.
   * @param options Runner options.
   */
  run: (pacts: C8yPact[], options?: C8yPactRunnerOptions) => void;

  /**
   * Runs a single pact object. Needs to run within a test-case.
   *
   * @param pact Pact object to run.
   * @param options Runner options.
   */
  runTest: (pact: C8yPact, options?: C8yPactRunnerOptions) => void;
}

/**
 * Default implementation of C8yPactRunner. Runtime for C8yPact objects that will
 * create the tests dynamically and rerun recorded requests. Supports Basic and Cookie based
 * authentication, id mapping, consumer and producer filtering and URL replacement.
 *
 * Use `C8Y_PACT_RUNNER_AUTH` to set the authentication type for the runner and overwrite
 * the authentication type detected in the pact records. Supported values are `CookieAuth` and `BasicAuth`.
 */
export class C8yDefaultPactRunner implements C8yPactRunner {
  constructor() {}

  protected idMapper: { [key: string]: string } = {};

  run(pacts: C8yPact[], options: C8yPactRunnerOptions = {}): void {
    this.idMapper = {};

    if (!_.isArray(pacts)) return;
    const tests: C8yPact[] = [];

    for (const pact of pacts) {
      const { info } = pact;
      if (!isPact(pact)) continue;

      if (
        _.isString(options.consumer) &&
        (_.isString(info?.consumer) ? info?.consumer : info?.consumer?.name) !==
          options.consumer
      ) {
        continue;
      }

      if (
        _.isString(options.producer) &&
        (_.isString(info?.producer) ? info?.consumer : info?.producer?.name) !==
          options.consumer
      ) {
        continue;
      }

      if (!info?.title) {
        pact.info.title = pact.id?.split("__");
      }
      tests.push(pact);
    }

    const testHierarchy = buildTestHierarchy<C8yPact>(
      tests,
      (item) => item.info.title ?? [item.id]
    );
    this.createTestsFromHierarchy(testHierarchy, options);
  }

  protected createTestsFromHierarchy(
    hierarchy: C8yTestHierarchyTree<C8yPact>,
    options: C8yPactRunnerOptions
  ): void {
    const keys = Object.keys(hierarchy);
    keys.forEach((key: string) => {
      const subTree = hierarchy[key];
      if (isPact(subTree)) {
        const annotations: Cypress.TestConfigOverrides = {
          tags: subTree.info?.tags,
        };

        beforeEach(() => {
          if (!Cypress.env("C8Y_TENANT")) {
            cy.getAuth().getTenantId({ ignorePact: true });
          }
        });

        it(key, annotations, () => {
          this.runTest(subTree, options);
        });
      } else {
        const that = this;
        context(key, function () {
          that.createTestsFromHierarchy(subTree, options);
        });
      }
    });
  }

  runTest(pact: C8yPact, options: C8yPactRunnerOptions = {}): void {
    Cypress.c8ypact.current = pact;
    this.idMapper = {};
    let currentAuth: C8yAuthOptions | undefined = undefined;

    const methods = options.methods?.map((m) => m.toLowerCase()) || [];
    let recordIndex = -1;

    const failedRequests: {
      id: string;
      message?: string;
      duration?: number;
    }[] = [];

    for (const preRecord of pact?.records || []) {
      recordIndex++;
      if (preRecord == null) continue;

      if (
        preRecord.request.method != null &&
        !_.isEmpty(methods) &&
        !methods.includes(preRecord.request.method.toLowerCase())
      ) {
        continue;
      }

      if (preRecord.request.url != null && !_.isEmpty(options.paths)) {
        const url = preRecord.request.url;
        if (!options.paths?.some((p) => url.startsWith(p))) {
          continue;
        }
      }

      let record: C8yPactRecord | undefined = preRecord;
      if (_.isFunction(Cypress.c8ypact.on?.runRecord)) {
        record = Cypress.c8ypact.on.runRecord(preRecord, pact);
      }
      if (!record) {
        cy.log("Skipping request disabled by Cypress.c8ypact.on.runRecord.");
        continue;
      }

      cy.then(() => {
        const url = this.createURL(record, pact.info);
        if (!url) {
          cy.log("Skipping request without URL.");
          return;
        }
        const clientFetchOptions = this.createFetchOptions(record, pact.info);

        if (clientFetchOptions.method.toLowerCase() === "post") {
          if (!clientFetchOptions.body) {
            cy.log("Skipping POST request without body: " + url);
            return;
          }
        }

        let users: (string | undefined)[] = (
          to_array(record.auth?.userAlias ?? record.auth?.user) ?? []
        ).map((item) => {
          if ((item || "").split("/").length > 1) {
            return item?.split("/")?.slice(1)?.join("/");
          } else {
            return item;
          }
        });

        if (url === "/devicecontrol/deviceCredentials") {
          users = to_array("devicebootstrap") ?? [];
        }

        if (users?.length === 0) {
          users = [undefined];
        }

        const configKeys = [
          "skipClientAuthentication",
          "preferBasicAuth",
          "failOnStatusCode",
          "timeout",
          "requestId",
        ];
        const strictMatching =
          Cypress.config().c8ypact?.strictMatching ??
          record.options?.strictMatching ??
          pact.info?.strictMatching ??
          Cypress.c8ypact.getConfigValue("strictMatching") ??
          true;

        const requestId =
          record.id ?? record.options?.requestId ?? `record-${recordIndex}`;
        const failOnStatusCode = (record.response?.status ?? 200) < 400;
        const cOpts: C8yClientOptions = {
          strictMatching,
          record,
          failOnStatusCode,
          ...(requestId ? { requestId } : {}),
          // config keys from record override pact info values
          ..._.pick(pact.info, configKeys),
          ..._.pick(record.options, configKeys),
        };

        const responseFn = (response: Cypress.Response<any>, id: string) => {
          if (
            url === "/devicecontrol/deviceCredentials" &&
            response.status === 201
          ) {
            const { username, password } = response.body;
            if (username && password) {
              Cypress.env(`${username}_username`, username);
              Cypress.env(`${username}_password`, password);
            }
          }

          const createdObjectId = getCreatedObjectId(response);
          if (createdObjectId != null && record.createdObject != null) {
            this.idMapper[record.createdObject] = createdObjectId;
            // Ensure config, preprocessor, and regexReplace objects exist
            const config = Cypress.config();
            if (config.c8ypact != null) {
              const preprocessorOptions = config.c8ypact.preprocessor ?? {};
              preprocessorOptions.regexReplace ??= {};

              const key = "response";
              const newValue = `/${createdObjectId}/${record.createdObject}/g`;
              const existing = preprocessorOptions.regexReplace[key];

              if (Array.isArray(existing)) {
                preprocessorOptions.regexReplace[key] = [...existing, newValue];
              } else if (_.isString(existing)) {
                preprocessorOptions.regexReplace[key] = [existing, newValue];
              } else if (existing == null) {
                preprocessorOptions.regexReplace[key] = [newValue];
              }
              _.set(
                Cypress.config(),
                "c8ypact.preprocessor",
                preprocessorOptions
              );
            }
          }
          if (
            options.assertions?.maxRequestDuration != null &&
            response.duration != null &&
            response.duration > options.assertions.maxRequestDuration
          ) {
            failedRequests.push({
              id,
              duration: response.duration,
              message: `Request duration of ${response.duration}ms exceeds maximum of ${options.assertions.maxRequestDuration}ms.`,
            });
          }
        };

        const envAuth = Cypress.env("C8Y_PACT_RUNNER_AUTH");
        const pactAuth = options.authType ?? record.authType();

        const isCookieAuth =
          (envAuth ?? pactAuth) === "CookieAuth" && envAuth !== "BasicAuth";

        const isBasicAuth = (envAuth ?? pactAuth) === "BasicAuth";
        const f = (c: Client) => c.core.fetch(url, clientFetchOptions);

        users.forEach((user) => {
          (user ? cy.getAuth(user) : cy.getAuth()).then((auth) => {
            const updatedOpts = _.cloneDeep(cOpts);
            if (requestId != null && users.length > 1) {
              updatedOpts.requestId = `${requestId}/${user}`;
            }
            if (user !== "devicebootstrap" && isCookieAuth) {
              if (currentAuth == null || auth?.user !== currentAuth?.user) {
                cy.wrap(auth, { log: false }).login();
                currentAuth = auth;
              }
              cy.c8yclient(f, updatedOpts).then((response) =>
                responseFn(response, requestId)
              );
            } else {
              if (isBasicAuth || user != null) {
                if (auth == null) {
                  // should not get here as cy.getAuth(user) should fail if
                  // no auth is found for the user. just making sure we get the
                  // correct error message in case we still get here
                  throw new Error(
                    `Auth missing for user ${user}. This should not happen.`
                  );
                }
                cy.wrap(auth, { log: false })
                  .c8yclient(f, updatedOpts)
                  .then((response) => responseFn(response, requestId));
              } else {
                cy.c8yclient(f, updatedOpts).then((response) =>
                  responseFn(response, requestId)
                );
              }
            }
          });
        });
      });
    }

    cy.then(() => {
      if (failedRequests.length > 0) {
        const messages = failedRequests
          .map((fr) => {
            return `- [${fr.id}]: ${fr.message}`;
          })
          .join("\n");
        throwError(`One or more requests failed:\n${messages}`);
      }
    });
  }

  protected createHeader(pact: C8yPactRecord): any {
    const headers = _.omitBy(
      pact.request.headers || {},
      (v: any, k: string) =>
        k.toLowerCase() === "x-xsrf-token" ||
        k.toLowerCase() === "authorization"
    );
    return headers;
  }

  protected createFetchOptions(pact: C8yPactRecord, info: C8yPactInfo): any {
    const options: any = {
      method: pact.request.method || "GET",
      headers: this.createHeader(pact),
    };
    const body = pact.request.body;
    if (body) {
      if (_.isString(body)) {
        options.body = this.updateIds(body);
        options.body = this.updateURLs(options.body, info);
      } else if (_.isObject(body)) {
        let b = JSON.stringify(body);
        b = this.updateIds(b);
        b = this.updateURLs(b, info);
        options.body = b;
      }
    }
    return options;
  }

  protected createURL(
    pact: C8yPactRecord,
    info: C8yPactInfo
  ): string | undefined {
    let url = pact.request.url;
    if (info?.baseUrl && url?.includes(info.baseUrl)) {
      url = url.replace(info.baseUrl, "");
    }
    const baseUrl = getBaseUrlFromEnv();
    if (baseUrl && url?.includes(baseUrl)) {
      url = url.replace(baseUrl, "");
    }
    if (url) {
      url = this.updateIds(url);
    }
    return url;
  }

  protected updateURLs(value: string, info: C8yPactInfo): string {
    if (!value || !info) return value;
    let result = value;

    const tenantUrl = (
      baseUrl: C8yBaseUrl,
      tenant?: C8yTenant
    ): URL | undefined => {
      if (!baseUrl || !tenant) return undefined;
      try {
        const url = new URL(baseUrl);
        const instance = url.host.split(".")?.slice(1)?.join(".");
        url.host = `${tenant}.${instance}`;
        return url;
      } catch {
        // no-op
      }
      return undefined;
    };

    const baseUrl = getBaseUrlFromEnv();
    if (baseUrl && info.baseUrl) {
      const infoUrl = tenantUrl(info.baseUrl, info?.tenant);
      const url = tenantUrl(baseUrl, Cypress.env("C8Y_TENANT"));

      if (infoUrl && url) {
        const regexp = new RegExp(`${infoUrl.href}`, "g");
        result = result.replace(regexp, url.href);
      }

      if (getBaseUrlFromEnv() && info.baseUrl) {
        const regexp = new RegExp(`${info.baseUrl}`, "g");
        result = result.replace(regexp, baseUrl);
      }
    }
    if (info.tenant && Cypress.env("C8Y_TENANT")) {
      const regexp = new RegExp(`${info.tenant}`, "g");
      result = result.replace(regexp, Cypress.env("C8Y_TENANT"));
    }
    return result;
  }

  protected updateIds(value: string): string {
    if (!value || !this.idMapper) return value;
    let result = value;
    for (const currentId of Object.keys(this.idMapper)) {
      const regexp = new RegExp(`${currentId}`, "g");
      result = result.replace(regexp, this.idMapper[currentId]);
    }
    return result;
  }
}

export function getOptionsFromEnvironment(): C8yPactRunnerOptions {
  let methods = Cypress.env("C8Y_PACT_RUNNER_METHODS");
  if (methods != null) {
    if (_.isString(methods)) {
      methods = methods.split(",");
    }
    if (_.isArray(methods)) {
      methods = methods.map((m) => m.trim().toLowerCase());
    } else {
      methods = undefined;
    }
  }

  let paths = Cypress.env("C8Y_PACT_RUNNER_PATHS");
  if (paths != null) {
    if (_.isString(paths)) {
      paths = paths.split(",");
    }
    if (_.isArray(paths)) {
      paths = paths.map((p) => p.trim());
    } else {
      paths = undefined;
    }
  }

  let authType = Cypress.env(
    "C8Y_PACT_RUNNER_AUTH"
  ) as C8yPactRunnerOptions["authType"];
  if (
    authType &&
    !["basicauth", "cookieauth"].includes(authType.toLowerCase())
  ) {
    authType = undefined;
  }

  return {
    authType,
    methods,
    paths,
  };
}
