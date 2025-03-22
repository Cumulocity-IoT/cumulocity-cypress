import { IncomingMessage } from "http";
import { getBaseUrlFromEnv } from "../../../src/lib/utils";
import { encodeBase64 } from "../../../src/shared/auth";
import * as setCookieParser from "set-cookie-parser";
import { C8yTenant } from "../../../src/shared/types";

const { _, sinon } = Cypress;

interface WindowWithFetchStub {
  fetchStub: Cypress.Agent<sinon.SinonStub>;
}

declare global {
  interface Window extends WindowWithFetchStub {}
}

/**
 * Create an absolute url from the given relative path. Will use `baseUrl` configured
 * in cypress.config.ts.
 *
 * @param {string} path relative path
 * @param {string} baseUrl base URL. if undefined config baseUrl will be used
 * @returns absolute url for the given path
 */
export function url(path: string, baseUrl = getBaseUrlFromEnv()): string {
  if (baseUrl && !baseUrl.toLowerCase().startsWith("http")) {
    baseUrl = `https://${baseUrl}`;
  }
  return `${baseUrl}${path}`;
}

let cypressBackendStub: sinon.SinonStub<any[], any>;
let cypressAutomationStub: sinon.SinonStub<any[], any>;

/**
 * Init stubbing requests. Must be called before `stubResponse()`, for example
 * in `beforeEach` hook of your tests.
 */
export function initRequestStub(): void {
  cypressBackendStub = cy.stub(Cypress, "backend").callThrough();
  cy.stub(window, "fetchStub");
  cypressAutomationStub = cy.stub(Cypress, "automation").callThrough();
}

export function initLoginRequestStub(
  xsrf?: string,
  authorization?: string,
  tenant?: C8yTenant
): void {
  Cypress.env("C8Y_TENANT", tenant);
  const headers = new Headers();
  if (authorization) {
    headers.append(
      "set-cookie",
      `authorization=${authorization}; path=/; domain=localhost; HttpOnly`
    );
  }
  if (xsrf) {
    headers.append(
      "set-cookie",
      `XSRF-TOKEN=${xsrf}; Path=/; Domain=localhost; Secure`
    );
  }
  stubResponse({
    isOkStatusCode: true,
    status: 200,
    headers,
    body: undefined,
  });
}

type StubbedResponseType<T> =
  | Partial<Cypress.Response<Partial<T>>> // cy.request response type
  | Partial<Response>; // window.fetch response type

/**
 * Stub responses for `cy.request()`. Pass an array of response objects
 * in the order requests are expected.
 *
 * @example
 * stubResponses<IUserGroup>([{
 *   isOkStatusCode: true,
 *   status: 201,
 *   body: {
 *     name: "business",
 *   },
 * },
 * ...
 * ]);
 *
 * @param {StubbedResponseType<T>[]} responses response or array of response objects
 */
export function stubResponses<T>(
  responses: StubbedResponseType<T>[],
  delay: number = 0
): void {
  let all = _.isArray(responses) ? responses : [responses];
  all.forEach((response, index) => {
    stubResponse<T>(response, index, delay);
  });
}

/**
 * Stub response for a `cy.request()`. If more than one request needs to be
 * stubbed, pass the `callIndex` with the position in the expected sequence.
 *
 * Set-Cookie headers are automatically stubbed and can be accessed using
 * `cy.getCookie()` and `cy.getCookies()` after the request.
 *
 * @example
 * stubResponse<IUserGroup>({
 *   isOkStatusCode: true,
 *   status: 201,
 *   headers: new Headers({
 *    "set-cookie":
 *      "authorization=eyJhbGciOiJ; path=/; domain=localhost; HttpOnly",
 *   }),
 *   body: {
 *     name: "business",
 *   },
 * }, 3);
 *
 * @param {StubbedResponseType<T>} response the response object
 */
export function stubResponse<T>(
  response: StubbedResponseType<T>,
  callIndex: number = 0,
  delay: number = 0
): void {
  const success = () => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(response);
      }, delay);
    });
  };

  const failure = () => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(response);
      }, delay);
    });
  };

  const s = response.status;
  const replyFn = s != null && s >= 200 && s < 400 ? success : failure;
  (Cypress.backend as sinon.SinonStub)
    .withArgs("http:request", Cypress.sinon.match.any)
    .onCall(callIndex)
    .callsFake(replyFn);
  window.fetchStub.onCall(callIndex).callsFake(replyFn);
  
  stubCookies(response);
}

/**
 * Stub cookies as created by `cy.request()`. Cookies are read from the
 * `Set-Cookie` header and can be accessed using `cy.getCookie()` and `cy.getCookies()`
 * after the request.
 *
 * @example
 * stubResponse({
 *  status: 200,
 *  headers: new Headers({
 *    "set-cookie":
 *      "authorization=eyJhbGciOiJ; path=/; domain=localhost; HttpOnly",
 *  }),
 *  body: undefined,
 * });
 *
 * @param {StubbedResponseType<T>} response the response objects
 */
export function stubCookies<T>(response: StubbedResponseType<T>): void {
  if (!response.headers?.getSetCookie) return;

  let cookies: { name: string; value: string }[] = setCookieParser.parse(
    response as IncomingMessage
  );
  if (!cookies) return;

  cypressAutomationStub
    ?.withArgs(
      "get:cookie",
      sinon.match((value) => {
        return (
          _.isObjectLike(value) &&
          "name" in value &&
          // not checking for domain, path, secure, httpOnly, hostOnly, expiry, sameSite
          cookies.filter((c) => _.isEqual(c.name, value.name)).length > 0
        );
      })
    )
    .resolves((cookie: any) => cookies.filter((c) => _.isEqual(c.name, c)));

  cypressAutomationStub?.withArgs("get:cookies").resolves(cookies);

  cookies.forEach((cookie) => {
    document.cookie = `${cookie.name}=${cookie.value}`;
  });
}

/**
 * Assert a request sent by cy.request.
 *
 * Pass expected requests in the order requests should be received. Options are
 * matched with deep equality.
 *
 * @example
 * expectHttpRequest([
 *   {
 *     url: url(`/user/t12345627/users`),
 *     method: "POST",
 *     auth: { user: "admin", password: "password" },
 *     ...
 *   },
 *   ...
 * ]);
 * @param {any | any[]} expectedOptions options to be used for assertions
 * @returns array of arguments for each request used for asserting `expectedOptions`
 */
export function expectHttpRequest(expectedOptions: any | any[]): any[] {
  let all = _.isArray(expectedOptions) ? expectedOptions : [expectedOptions];
  expect(Cypress.backend).to.have.callCount(all.length);

  const requests = cypressBackendStub
    ?.getCalls()
    .filter((call) => _.isArray(call.args) && call.args[0] === "http:request")
    .map((call) => {
      call.args = call.args.length > 1 ? call.args[1] : {};
      return call;
    });

  return expectCallsWithArgs(requests, all);
}

/**
 * Assert a request sent by c8y/client.
 *
 * Pass expected requests in the order requests should be received. Options are
 * matched with deep equality.
 *
 * @example
 * expectHttpRequest([
 *   {
 *     url: url(`/user/t12345627/users`),
 *     auth: { user: "admin", password: "password" },
 *     headers: {
 *       'content-type': 'application/json,
 *       UseXBasic: true,
 *     }
 *     ...
 *   },
 *   ...
 * ]);
 * @param {any | any[]} expectedOptions options to be used for assertions
 * @returns array of arguments for each request used for asserting `expectedOptions`
 */
export function expectC8yClientRequest(
  expectedOptions: any | any[],
  defaultOptions: any = {
    headers: {
      UseXBasic: true,
    },
    body: undefined,
  }
): any[] {
  let all = (
    _.isArray(expectedOptions) ? expectedOptions : [expectedOptions]
  ).map((options) => {
    const url = options.url;

    const result: any = _.omit(options, ["url", "headers", "auth"]);
    result.headers = _.cloneDeep(options.headers) || {};
    if (options.auth && !result.headers.Authorization) {
      const tenant = options.auth.tenant ? options.auth.tenant + "/" : "";
      const user = `${tenant}${options.auth.user}`;
      result.headers.Authorization = basicAuthorization(
        user,
        options.auth.password
      );
    }
    _.defaultsDeep(result, defaultOptions);

    // window.fetch gets 2 arguments url and options
    return [url, result];
  });
  expect(window.fetchStub).to.have.callCount(all.length);
  const calls = window.fetchStub.getCalls();
  return expectCallsWithArgs(calls, all);
}

export function basicAuthorization(user: string, password: string): string {
  return `Basic ${encodeBase64(`${user}:${password}`)}`;
}

function expectCallsWithArgs(
  requests: sinon.SinonSpyCall<any, any>[],
  expected: any[]
): any[] {
  expect(
    requests.length === expected.length,
    `expected options count should match received request count (${requests.length} !== ${expected.length})`
  ).to.be.true;

  requests.forEach((request, index: number) => {
    _.each(expected[index], (value, key) => {
      // expect(_.isEqual(expected[index][key], request.args[key])).to.be.true;
      // if (_.isObject(expected[index][key])) {
      //   _.each(expected[index][key], (subvalue, subkey) => {
      //     // this solution shows both values if failing and not just Object(...)
      //     if (expected[index][key][subkey]) {
      //       expect(
      //         Object.entries(expected[index][key][subkey]).sort().toString()
      //       ).to.equal(
      //         Object.entries(request.args[key][subkey]).sort().toString()
      //       );
      //     }
      //   });
      // } else {
      // console.log(JSON.stringify(expected[index][key]));
      // console.log(JSON.stringify(request.args[key]));
      expect(request.args[key]).to.deep.equal(expected[index][key]);
      // }
    });
  });

  return expected;
}

/**
 * Gets the console props passed as arguments to given Cypress.log spy.
 * @param spy The spy created using cy.spy(Cypress, "log")
 * @param name The name of the custom command to get console props for
 * @returns console props object passed to the spy
 */
export function getConsolePropsForLogSpy(
  spy: sinon.SinonSpy,
  name: string
): any {
  const arg = _.findLast(_.flatten(spy.args), (arg: any) => arg.name === name);
  if (!arg) return undefined;
  if (!_.isFunction(arg.consoleProps)) return undefined;
  return arg.consoleProps();
}

export function getMessageForLogSpy(spy: sinon.SinonSpy, name: string): any {
  const arg = _.findLast(_.flatten(spy.args), (arg: any) => arg.name === name);
  if (!arg) return undefined;
  return arg.message;
}

/**
 * Stub Cypress.env() with the given env object. Use when testing different values of
 * env variables in your tests.
 * @param env The env object to stub
 */
export function stubEnv(env: any, log: boolean = false): void {
  const cypressEnv = Cypress.env();
  cy.stub(Cypress, "env")
    .log(log)
    .callsFake((key: string, value: any) => {
      if (key != null && value == null) {
        return key in env ? env[key] : cypressEnv[key];
      } else if (key != null && value != null) {
        cypressEnv[key] = value;
        return;
      }
      return { ...cypressEnv, ...env };
    });
}

export function stubCypressPactConfig(config: any, log: boolean = false): void {
  const c = Cypress.c8ypact.config;
  cy.stub(Cypress.c8ypact, "config")
    .log(log)
    .value({ ...c, ...config });
}
