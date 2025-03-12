import { C8yBaseUrl, C8yTenant } from "../../shared/types";
import { C8yAuthOptions, C8yClientOptions } from "../../shared/c8yclient";
import {
  C8yPact,
  C8yPactInfo,
  C8yPactRecord,
  isPact,
} from "../../shared/c8ypact";
import { getBaseUrlFromEnv } from "../utils";
import { Client } from "@c8y/client";

const { _ } = Cypress;

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
   */
  runTest: (pact: C8yPact, options?: C8yPactRunnerOptions) => void;
}

type TestHierarchyTree<T> = { [key: string]: T | TestHierarchyTree<T> };

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

    const testHierarchy = this.buildTestHierarchy(tests);
    this.createTestsFromHierarchy(testHierarchy, options);
  }

  protected buildTestHierarchy(
    pactObjects: C8yPact[]
  ): TestHierarchyTree<C8yPact> {
    const tree: TestHierarchyTree<C8yPact> = {};
    pactObjects.forEach((pact) => {
      const titles = pact.info.title ?? [pact.id];

      let currentNode = tree;
      const protectedKeys = ["__proto__", "constructor", "prototype"];
      titles?.forEach((title, index) => {
        if (!protectedKeys.includes(title)) {
          if (!currentNode[title]) {
            currentNode[title] = index === titles.length - 1 ? pact : {};
          }
          currentNode = currentNode[title] as TestHierarchyTree<C8yPact>;
        }
      });
    });
    return tree;
  }

  protected createTestsFromHierarchy(
    hierarchy: TestHierarchyTree<C8yPact>,
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
    for (const record of pact?.records || []) {
      if (
        record.request.method != null &&
        !_.isEmpty(methods) &&
        !methods.includes(record.request.method.toLowerCase())
      ) {
        continue;
      }

      if (record.request.url != null && !_.isEmpty(options.paths)) {
        const url = record.request.url;
        if (!options.paths?.some((p) => url.startsWith(p))) {
          continue;
        }
      }

      cy.then(() => {
        Cypress.c8ypact.config.strictMatching =
          pact.info?.strictMatching != null ? pact.info.strictMatching : true;

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

        let user = record.auth?.userAlias || record.auth?.user;
        if ((user || "").split("/").length > 1) {
          user = user?.split("/")?.slice(1)?.join("/");
        }
        if (url === "/devicecontrol/deviceCredentials") {
          user = "devicebootstrap";
        }

        const cOpts: C8yClientOptions = {
          // pact: { record: record, info: pact.info },
          ..._.pick(record.options, [
            "skipClientAuthentication",
            "preferBasicAuth",
            "failOnStatusCode",
            "timeout",
          ]),
        };

        const responseFn = (response: Cypress.Response<any>) => {
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
          if (response.method === "POST") {
            const newId = response.body.id;
            if (newId && record.createdObject) {
              this.idMapper[record.createdObject] = newId;
            }
          }
        };

        const envAuth = Cypress.env("C8Y_PACT_RUNNER_AUTH");

        const isCookieAuth =
          (envAuth ?? record.authType()) === "CookieAuth" &&
          envAuth !== "BasicAuth";

        const isBasicAuth = (envAuth ?? record.authType()) === "BasicAuth";
        const f = (c: Client) => c.core.fetch(url, clientFetchOptions);

        (user ? cy.getAuth(user) : cy.getAuth()).then((auth) => {
          if (user !== "devicebootstrap" && isCookieAuth) {
            if (currentAuth == null || auth?.user !== currentAuth?.user) {
              cy.wrap(auth).login();
              currentAuth = auth;
            }
            cy.c8yclient(f, cOpts).then(responseFn);
          } else {
            if (isBasicAuth) {
              cy.wrap(auth).c8yclient(f, cOpts).then(responseFn);
            } else {
              cy.c8yclient(f, cOpts).then(responseFn);
            }
          }
        });
      });
    }
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
