const { _ } = Cypress;

import {
  getBaseUrlFromEnv,
  getCookieAuthFromEnv,
  normalizedC8yclientArguments,
  restoreClient,
  storeClient,
  tenantFromBasicAuth,
  throwError,
} from "./../utils";

import {
  BasicAuth,
  Client,
  FetchClient,
  IFetchResponse,
  IResult,
  IResultList,
} from "@c8y/client";
import {
  C8yClient,
  C8yClientOptions,
  toCypressResponse,
  wrapFetchRequest,
} from "../../shared/c8yclient";
import { C8yAuthentication, isAuthOptions } from "../../shared/auth";
import "../pact/c8ymatch";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Create a c8y/client `Client` to interact with Cumulocity API. Yielded
       * results are `Cypress.Response` objects as returned by `cy.request`.
       *
       * `cy.c8yclient` supports c8y/client `BasicAuth` and `CookieAuth`. To use
       * any other auth method, such as `BearerAuth`, create a custom `Client` and
       * pass it in `options`.
       *
       * Note: If there is a `X-XSRF-TOKEN` cookie, `CookieAuth` will be used as
       * auth method and basic auth credentials will be ignored. To create the
       * cookie token, call `cy.login` before using `cy.c8yclient`. To force using
       * basic auth method, pass credentials via `cy.getAuth().c8yclient()` or use
       * `preferBasicAuth` option.
       *
       * `cy.c8yclient` supports chaining of requests. By chaining the response of
       * one request will be provided as second argument to the next request.
       *
       * Using the `options` argument it is possible to overwrite the default
       * behavior or configure `cy.c8yclient`.
       *
       * @example
       * cy.getAuth("admin")
       *   .c8yclient().then((c) => {
       *     Cypress.env("C8Y_TENANT", c.core.tenant);
       * });
       *
       * cy.c8yclient((c) => c.user.delete(newuser.username), {
       *   failOnStatusCode: false,
       * }).then((deleteResponse) => {
       *   expect(deleteResponse.status).to.be.oneOf([204, 404]);
       * });
       *
       * cy.c8yclient([
       *   (c) =>
       *     c.core.fetch(
       *       "/user/" + c.core.tenant + "/groupByName/" + permission
       *     ),
       *   (c, groupResponse) =>
       *     c.userGroup.addUserToGroup(groupResponse.body.id, userId),
       *   ]);
       * });
       *
       * cy.c8yclient((c) =>
       *   c.core.fetch("/user/" + c.core.tenant + "/groupByName/" + permission)
       * ).c8yclient((c, groupResponse) =>
       *   c.userGroup.addUserToGroup(groupResponse.body.id, userId),
       * );
       */
      c8yclient<T = any, R = any>(
        serviceFn: C8yClientServiceFn<R, T> | C8yClientServiceFn<R, any>[],
        options?: C8yClientOptions
      ): Chainable<Response<T>>;

      c8yclient<T = any, R = any>(
        serviceFn:
          | C8yClientServiceArrayFn<R, T>
          | C8yClientServiceArrayFn<R, any>[],
        options?: C8yClientOptions
      ): Chainable<Response<T>[]>;

      c8yclient<T = any, R = any>(
        serviceFn: C8yClientServiceListFn<R, T>,
        options?: C8yClientOptions
      ): Chainable<Response<T[]>>;

      c8yclient(): Chainable<Client>;

      /**
       * Convenience for cy.c8yclient with failOnStatus false. Use if the request is
       * expected to fail.
       *
       * @see c8yclient
       */
      c8yclientf<T = any, R = any>(
        serviceFn: C8yClientServiceFn<R, T> | C8yClientServiceFn<R, any>[],
        options?: C8yClientOptions
      ): Chainable<Response<T>>;

      c8yclientf<T = any, R = any>(
        serviceFn:
          | C8yClientServiceArrayFn<R, T>
          | C8yClientServiceArrayFn<R, any>[],
        options?: C8yClientOptions
      ): Chainable<Response<T>[]>;

      c8yclientf<T = any, R = any>(
        serviceFn: C8yClientServiceListFn<R, T>,
        options?: C8yClientOptions
      ): Chainable<Response<T[]>>;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Response<T> {
      url?: string;
      requestBody?: any;
      method?: string;
      $body?: any;
    }
  }

  type C8yClientIResult<T> = IResult<T> | IResult<null> | IFetchResponse;

  type C8yClientServiceFn<R, T> = (
    client: Client,
    previousResponse: Cypress.Response<R>
  ) => Promise<C8yClientIResult<T>>;

  type C8yClientServiceArrayFn<R, T> = (
    client: Client,
    previousResponse: Cypress.Response<R>
  ) => Promise<C8yClientIResult<T>>[];

  type C8yClientServiceListFn<R, T> = (
    client: Client,
    previousResponse: Cypress.Response<R>
  ) => Promise<IResultList<T>>;

  type C8yClientFnArg<R = any, T = any> =
    | C8yClientServiceFn<R, T>
    | C8yClientServiceArrayFn<R, T>[]
    | C8yClientServiceListFn<R, T>;
}

export const defaultClientOptions = () => {
  return {
    log: true,
    timeout:
      Cypress.env("C8Y_C8YCLIENT_TIMEOUT") || Cypress.config().responseTimeout,
    failOnStatusCode: true,
    preferBasicAuth: false,
    skipClientAuthentication: false,
    ignorePact: false,
    failOnPactValidation: true,
    schema: undefined,
    strictMatching: true,
  } as C8yClientOptions;
};

let logOnce = true;

_.set(globalThis, "fetchStub", window.fetch);
globalThis.fetch = async function (
  url: RequestInfo | URL,
  fetchOptions?: RequestInit
) {
  const consoleProps: any = {};

  let logger: Cypress.Log | undefined = undefined;
  if (logOnce === true) {
    logger = Cypress.log({
      name: "c8yclient",
      autoEnd: false,
      message: "",
      consoleProps: () => consoleProps,
      renderProps(): {
        message: string;
        indicator: "aborted" | "pending" | "successful" | "bad";
        status: string | number;
      } {
        function getIndicator() {
          if (!consoleProps["Yielded"]) return "pending";
          if (consoleProps["Yielded"].isOkStatusCode) return "successful";
          return "bad";
        }

        function getStatus() {
          return (
            (consoleProps["Yielded"] &&
              !_.isEmpty(consoleProps["Yielded"]) &&
              consoleProps["Yielded"].status) ||
            "---"
          );
        }

        return {
          message: `${
            fetchOptions?.method || "GET"
          } ${getStatus()} ${getDisplayUrl(
            url || consoleProps["Yielded"]?.url || ""
          )}`,
          indicator: getIndicator(),
          status: getStatus(),
        };
      },
    });
  } else {
    logOnce = true;
  }
  return wrapFetchRequest(url, fetchOptions, {
    consoleProps,
    logger,
    loggedInUser:
      Cypress.env("C8Y_LOGGED_IN_USER") ??
      Cypress.env("C8Y_LOGGED_IN_USER_ALIAS"),
  });
};

const c8yclientFn = (...args: any[]) => {
  const prevSubjectIsAuth = args && !_.isEmpty(args) && isAuthOptions(args[0]);
  const prevSubject: Cypress.Chainable<any> =
    args && !_.isEmpty(args) && !isAuthOptions(args[0]) ? args[0] : undefined;
  let $args = normalizedC8yclientArguments(
    args && prevSubject ? args.slice(1) : args
  );

  let authOptions;
  let basicAuth, cookieAuth;

  if (!isAuthOptions($args[0]) && _.isObject($args[$args.length - 1])) {
    $args = [
      $args[$args.length - 1].auth,
      ...($args[0] === undefined ? $args.slice(1) : $args),
    ];
    if ($args[0]?.user) {
      basicAuth = $args[0];
    } else {
      cookieAuth = $args[0];
    }
  } else if (!_.isEmpty($args) && $args[0]?.user) {
    authOptions = $args[0];
    basicAuth = new BasicAuth({
      user: authOptions.user,
      password: authOptions.password,
      tenant: authOptions.tenant,
    });
    $args[0] = basicAuth;
  } else if (_.isFunction($args[0]) || isArrayOfFunctions($args[0])) {
    $args.unshift(undefined);
  }

  // check if there is a XSRF token to use for CookieAuth
  if (!cookieAuth) {
    cookieAuth = getCookieAuthFromEnv();
  }

  if (
    $args.length === 2 &&
    _.isObject($args[0]) &&
    (_.isFunction($args[1]) || isArrayOfFunctions($args[1]))
  ) {
    $args.push({});
  }

  const [argAuth, clientFn, argOptions] = $args;
  const options = _.defaults(argOptions, defaultClientOptions());
  // force CookieAuth over BasicAuth if present and not disabled by options
  const auth: C8yAuthentication & { userAlias?: string } =
    cookieAuth && options.preferBasicAuth === false && !prevSubjectIsAuth
      ? cookieAuth
      : argAuth;
  const baseUrl = options.baseUrl || getBaseUrlFromEnv();
  const tenant =
    (basicAuth && tenantFromBasicAuth(basicAuth)) ||
    (authOptions && authOptions.tenant) ||
    Cypress.env("C8Y_TENANT");

  // if client is provided via options, use it
  let c8yclient: C8yClient = { _client: options.client };

  // restore client only if client is undefined and no auth is provided as previousSubject
  // previousSubject must have priority
  if (!options.client && !(args[0] && isAuthOptions(args[0]))) {
    c8yclient = restoreClient() || { _client: undefined };
  }

  if (!c8yclient._client && clientFn && !auth) {
    throwError("Missing authentication. Authentication or Client required.");
  }

  // pass userAlias into the auth so it is part of the pact recording
  if (authOptions && authOptions.userAlias) {
    auth.userAlias = authOptions.userAlias;
  } else if (Cypress.env("C8Y_LOGGED_IN_USER_ALIAS")) {
    auth.userAlias = Cypress.env("C8Y_LOGGED_IN_USER_ALIAS");
  }

  if (!c8yclient._client && !tenant && !options.skipClientAuthentication) {
    logOnce = options.log;
    authenticateClient(auth, options, baseUrl).then(
      { timeout: options.timeout },
      (c) => {
        return runClient(c, clientFn, prevSubject, baseUrl);
      }
    );
  } else {
    if (!c8yclient._client) {
      c8yclient._client = new Client(auth, baseUrl);
      if (tenant) {
        c8yclient._client.core.tenant = tenant;
      }
    } else if ((auth && !options.client) || prevSubjectIsAuth) {
      // overwrite auth for restored clients
      c8yclient._client.setAuth(auth);
      c8yclient._auth = auth;
    }
    c8yclient._options = options;
    if (!c8yclient._auth) {
      c8yclient._auth = auth;
    }
    runClient(c8yclient, clientFn, prevSubject, baseUrl);
  }
};

function runClient(
  client: C8yClient,
  fns: C8yClientFnArg,
  prevSubject: any,
  baseUrl: string
) {
  storeClient(client);
  if (!fns) {
    // return Cypress.isCy(client) ? client : cy.wrap(client._client, { log: false });
    return cy.wrap(client._client, { log: false });
  }
  logOnce = client._options?.log || true;
  return run(client, fns, prevSubject, client._options || {}, baseUrl);
}

// create client as Client.authenticate() does, but also support
// Cookie authentication as Client.authenticate() only works with BasicAuth
function authenticateClient(
  auth: C8yAuthentication,
  options: C8yClientOptions,
  baseUrl: string
): Cypress.Chainable<C8yClient> {
  return cy.then({ timeout: options.timeout }, async () => {
    const clientCore = new FetchClient(auth, baseUrl);
    const res = await clientCore.fetch("/tenant/currentTenant");
    if (res.status !== 200) {
      throwError(makeErrorMessage(res.responseObj));
    }
    const { name } = await res.json();
    const client = new Client(auth, baseUrl);
    client.core.tenant = name;
    return { _client: client, _options: options, _auth: auth } as C8yClient;
  });
}

function run(
  client: C8yClient,
  fns: C8yClientFnArg,
  prevSubject: any,
  options: C8yClientOptions,
  baseUrl: string
) {
  const clientFn = isArrayOfFunctions(fns) ? fns.shift() : fns;
  if (!clientFn) {
    return;
  }
  const safeClient = client._client;
  if (!safeClient) {
    throwError("Client not initialized when running client function.");
  }
  return cy.then({ timeout: options.timeout }, async () => {
    const enabled = Cypress.c8ypact.isEnabled();
    const ignore = options?.ignorePact === true || false;
    const savePact = !ignore && Cypress.c8ypact.isRecordingEnabled();

    const matchPact = (response: any, schema: any) => {
      if (schema) {
        cy.c8ymatch(response, schema, undefined, options);
      } else {
        // object matching against existing pact
        if (ignore || !enabled) return;
        if (Cypress.c8ypact.mode() !== "apply") return;

        for (const r of _.isArray(response) ? response : [response]) {
          const record = Cypress.c8ypact.current?.nextRecord();
          const info = Cypress.c8ypact.current?.info;
          if (record != null && info != null && !ignore) {
            cy.c8ymatch(r, record, info, options);
          } else {
            if (
              record == null &&
              Cypress.c8ypact.getConfigValue("failOnMissingPacts", true) &&
              !ignore
            ) {
              throwError(
                `${Cypress.c8ypact.getCurrentTestId()} not found. Disable Cypress.c8ypact.config.failOnMissingPacts to ignore.`
              );
            }
          }
        }
      }
    };

    try {
      const response = await new Cypress.Promise(async (resolve, reject) => {
        const isErrorResponse = (resp: any) => {
          return (
            (_.isArray(resp) ? resp : [resp]).filter(
              (r) =>
                (r.isOkStatusCode !== true && options.failOnStatusCode) ||
                _.isError(r)
            ).length > 0
          );
        };

        const preprocessedResponse = async (promise: Promise<any>): Promise<Cypress.Response<any> | undefined> => {
          let result: any;
          try {
            result = await promise;
          } catch (error) {
            result = error;
          }
          const cypressResponse = toCypressResponse(result);
          if (cypressResponse) {
            cypressResponse.$body = options.schema;
            if (savePact) {
              await Cypress.c8ypact.savePact(cypressResponse, client);
            }
            if (isErrorResponse(cypressResponse)) {
              throw cypressResponse;
            }
          }
          return cypressResponse;
        };

        const resultPromise = clientFn(safeClient, prevSubject);
        if (_.isError(resultPromise)) {
          reject(resultPromise);
          return;
        }

        if (_.isArray(resultPromise)) {
          let toReject = false;
          const result: any[] = [];
          for (const task of resultPromise) {
            try {
              result.push(await preprocessedResponse(task));
            } catch (err) {
              result.push(err);
              toReject = true;
            }
          }
          if (toReject) {
            reject(result);
          } else {
            resolve(result);
          }
        } else {
          try {
            resolve(await preprocessedResponse(resultPromise));
          } catch (err) {
            reject(err);
          }
        }
      });

      matchPact(response, options.schema);

      cy.then(() => {
        if (isArrayOfFunctions(fns) && !_.isEmpty(fns)) {
          run(client, fns, response, options, baseUrl);
        } else {
          cy.wrap(response, { log: Cypress.c8ypact.debugLog });
        }
      });
    } catch (err) {
      if (_.isError(err)) throw err;

      matchPact(err, options.schema);

      cy.then(() => {
        // @ts-expect-error: utils is not public
        Cypress.utils.throwErrByPath("request.c8yclient_status_invalid", {
          args: err,
          stack: false,
        });
      });
    }
  });
}

_.extend(Cypress.errorMessages.request, {
  c8yclient_status_invalid(obj: any) {
    const err = obj.args || obj.errorProps || obj;
    return {
      message: makeErrorMessage(obj),
      docsUrl: `${
        (err.body && err.body.info) ||
        "https://github.com/Cumulocity-IoT/cumulocity-cypress"
      }`,
    };
  },
});

function makeErrorMessage(obj: any) {
  const err = obj.args || obj.errorProps || obj;
  const body = err.body || {};

  const message = [
    `c8yclient failed with: ${err.status} (${err.statusText})`,
    `${err.url}`,
    `The response we received from Cumulocity was: `,
    `${_.isObject(body) ? JSON.stringify(body, null, 2) : body.toString()}`,
    `For more information check:`,
    `${
      (err.body && err.body.info) ||
      "https://github.com/Cumulocity-IoT/cumulocity-cypress"
    }`,
    `\n`,
  ].join(`\n`);
  return message;
}

// from error_utils.ts
function getDisplayUrl(url: string, baseUrl = getBaseUrlFromEnv()): string {
  if (!baseUrl) return url;
  return url.replace(baseUrl, "");
}

Cypress.Commands.add(
  "c8yclientf",
  { prevSubject: "optional" },
  (...args: any[]) => {
    const failOnStatus = { failOnStatusCode: false };
    args = _.dropRightWhile(args, (n) => n == null);
    let options = _.last(args);
    if (!_.isObjectLike(options)) {
      options = failOnStatus;
      args.push(options);
    } else {
      args[args.length - 1] = { ...options, ...failOnStatus };
    }
    return c8yclientFn(...args);
  }
);

Cypress.Commands.add("c8yclient", { prevSubject: "optional" }, c8yclientFn);

/**
 * Checks if the given object is an array only containing functions.
 * @param obj The object to check.
 */
export function isArrayOfFunctions(
  functions:
    | C8yClientFnArg
    | C8yClientServiceArrayFn<any, any>[]
    | C8yClientServiceFn<any, any>[]
): functions is
  | C8yClientServiceArrayFn<any, any>[]
  | C8yClientServiceFn<any, any>[] {
  if (!functions || !_.isArray(functions) || _.isEmpty(functions)) return false;
  return _.isEmpty(functions.filter((f) => !_.isFunction(f)));
}
