const { _ } = Cypress;

import "./../../shared/global";

import {
  getBaseUrlFromEnv,
  getCookieAuthFromEnv,
  normalizedC8yclientArguments,
  restoreClient,
  storeClient,
  throwError,
} from "./../utils";

import {
  BasicAuth,
  Client,
  FetchClient,
  IFetchResponse,
  IResult,
  IResultList,
  BearerAuth,
  IManagedObject,
  IUser,
  IApplication,
  IAlarm,
  IEvent,
  Paging,
  IApplicationVersion,
  IAuditRecord,
  IOperation,
  IOperationBulk,
  IDeviceRegistration,
  IExternalIdentity,
  IManagedObjectBinary,
  IMeasurement,
  ITenant,
  ITenantOption,
  ITenantLoginOption,
  IUserReference,
  IUserGroup,
  IRole,
  IRoleReference,
  IIdentified,
} from "@c8y/client";

import {
  wrapFetchRequest,
  C8yClient,
  C8yClientOptions,
  toCypressResponse,
  C8yAuthOptions,
  throwC8yClientError,
  C8yClientLogOptions,
  C8yClientRequestContext,
  isC8yClientError,
} from "../../shared/c8yclient";
import {
  C8yAuthentication,
  hasAuthentication,
  isAuthOptions,
  tenantFromBasicAuth,
  toC8yAuthentication,
} from "../../shared/auth";
import "../pact/c8ymatch";
import { C8yBaseUrl } from "../../shared/types";

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Create a c8y/client `Client` to interact with Cumulocity API. Yielded
       * results are `Cypress.Response` objects as returned by `cy.request`.
       *
       * `cy.c8yclient` supports c8y/client `BasicAuth`, `CookieAuth` and `BearerAuth`.
       *
       * If auth is not passed explicitly using `cy.getAuth()`, `cy.useAuth()` or
       * `cy.login()`, the following behavior will be applied:
       * 1. Use Basic auth from `C8Y_USERNAME` and `C8Y_PASSWORD` env variables.
       * 2. Use Bearer auth from `C8Y_TOKEN` env variable.
       * 3. Use Cookie auth from `X-XSRF-TOKEN` cookie if present.
       *
       * For CookieAuth you should call `cy.login()` before using `cy.c8yclient` to
       * create the the required cookies. To force using basic auth method, pass
       * credentials via `cy.getAuth().c8yclient()` or use `preferBasicAuth` option.
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
      ): Chainable<Response<C8yCollectionResponse<T>>>;

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
      ): Chainable<Response<C8yCollectionResponse<T>>>;
    }
  }

  type C8yClientIResult<T> =
    | IResult<T>
    | IResult<null>
    | IFetchResponse
    | null
    | void;

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

  class C8yClientError extends Error {
    originalError?: Error;
    constructor(message: string, originalError?: Error);
  }

  type C8yCollectionResponse<T> = T extends IAlarm
    ? { alarms: T[] } & CollectionMetadata<T>
    : T extends IManagedObject
    ? { managedObjects: T[] } & CollectionMetadata<T>
    : T extends IEvent
    ? { events: T[] } & CollectionMetadata<T>
    : T extends IOperation
    ? { operations: T[] } & CollectionMetadata<T>
    : T extends IMeasurement
    ? { measurements: T[] } & CollectionMetadata<T>
    : T extends IAuditRecord
    ? { auditRecords: T[] } & CollectionMetadata<T>
    : T extends IDeviceRegistration
    ? { newDeviceRequests: T[] } & CollectionMetadata<T>
    : T extends IExternalIdentity
    ? { externalIds: T[] } & CollectionMetadata<T>
    : T extends IOperationBulk
    ? { bulkOperations: T[] } & CollectionMetadata<T>
    : T extends IManagedObjectBinary
    ? { managedObjects: T[] } & CollectionMetadata<T>
    : T extends IApplicationVersion
    ? { versions: T[] } & CollectionMetadata<T>
    : T extends IRoleReference
    ? { references: T[] } & CollectionMetadata<T>
    : T extends ITenantLoginOption
    ? { loginOptions: T[] } & CollectionMetadata<T>
    : T extends ITenantOption
    ? { options: T[] } & CollectionMetadata<T>
    : T extends IUserReference
    ? { references: T[] } & CollectionMetadata<T>
    : T extends IUserGroup
    ? { groups: T[] } & CollectionMetadata<T>
    : // UNION TYPE FALLBACK - For interfaces with only optionals or custom fragments
    T extends IUser | IRole | IApplication | ITenant | IIdentified
    ? CustomFragmentsInterfaceResponse<T>
    : never;

  type CollectionMetadata<T> = {
    statistics?: Paging<T>;
    self?: string;
    next?: string;
    prev?: string;
  };

  // Union type for interfaces with custom fragments - all possible properties available
  // there is no better way to make type inference work for interfaces with only optionals
  // or having custom fragments defined as [key: string]: any
  type CustomFragmentsInterfaceResponse<T> = {
    // Common collection properties that could contain the data
    applications?: T[];
    roles?: T[];
    tenants?: T[];
    users?: T[];
    // ...
  } & CollectionMetadata<T>;
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
    strictMatching: false,
  } as C8yClientOptions;
};

// Map to track active request contexts by request ID
const requestContexts = new Map<string, C8yClientRequestContext>();
// Store current request context for the active c8yclient command
let currentRequestContext: C8yClientRequestContext | null = null;

function generateContextId(): string {
  const prefix = Cypress.env("C8Y_CLIENT_REQUEST_ID_PREFIX") || "c8yclnt-";
  return `${prefix}${_.uniqueId()}`;
}

function getRequestContext(
  contextId: string
): C8yClientRequestContext | undefined {
  return requestContexts.get(contextId);
}

_.set(globalThis, "fetchStub", window.fetch);
globalThis.fetch = async function (
  url: RequestInfo | URL,
  fetchOptions?: RequestInit
) {
  const getMessage = (details: any) => {
    const m = details.method ? `${details.method} ` : "";
    let message = `${m}${details.status ?? 0} ${getDisplayUrl(details.url)}`;
    if (details.options?.requestId) {
      message += ` [${details.options.requestId}]`;
    }
    if (details.duration) {
      message += ` (${details.duration}ms)`;
    }
    if (details.success != null) {
      const statusIcon = details.success ? "✓" : "✗";
      message = `${statusIcon} ${message}`;
    }
    return message;
  };

  // Use the current request context if available
  const ctx = currentRequestContext
    ? {
        ...currentRequestContext,
        consoleProps: {},
        loggedInUser:
          Cypress.env("C8Y_LOGGED_IN_USER") ??
          Cypress.env("C8Y_LOGGED_IN_USER_ALIAS"),
        contextId: currentRequestContext.contextId,
        startTime: Date.now(),
        onRequestStart: (
          details: Parameters<
            NonNullable<C8yClientLogOptions["onRequestStart"]>
          >[0]
        ) => {
          if (!currentRequestContext?.logger) return;
          currentRequestContext.logger.set({
            message: getMessage(details),
            consoleProps: () => ({
              "Context ID": details.contextId,
              "Request ID": details.options?.requestId || null,
              "Request URL": details.url,
              "Request Method": details.method,
              "Request Headers": details.headers,
              "Request Body": details.body,
              "Fetch Options": fetchOptions,
              ...details.additionalInfo,
            }),
          });
          requestContexts.set(details.contextId, currentRequestContext);
        },
        onRequestEnd: (
          details: Parameters<
            NonNullable<C8yClientLogOptions["onRequestEnd"]>
          >[0]
        ) => {
          // Update logger if available
          if (currentRequestContext?.logger) {
            currentRequestContext.logger.set({
              message: getMessage(details),
              consoleProps: () => ({
                "Context ID": details.contextId,
                "Request ID": details.options?.requestId || null,
                "Request URL": details.url,
                "Request Method": details.method,
                "Request Headers": fetchOptions?.headers,
                "Request Body": fetchOptions?.body,
                ...(details.error
                  ? { Error: details.error }
                  : {
                      "Response Status": details.status ?? 0,
                      "Response Headers": details.headers ?? {},
                      "Response Body": details.body ?? null,
                    }),
                Duration: `${details.duration}ms`,
                Success: details?.success,
                "Fetch Options": fetchOptions,
                Options: details.options,
                Yielded: details.yielded,
                ...details.additionalInfo,
              }),
            });
            currentRequestContext.logger.end();
            requestContexts.delete(details.contextId);
          }
          if (details.yielded && currentRequestContext != null) {
            currentRequestContext.requests = [
              ...(currentRequestContext.requests ?? []),
              details.yielded,
            ];
          }
        },
      }
    : undefined;

  if (currentRequestContext != null) {
    requestContexts.set(currentRequestContext.contextId, currentRequestContext);
  }

  return wrapFetchRequest(url, fetchOptions, ctx);
};

const c8yclientFn = (...args: any[]) => {
  const prevSubjectIsAuth = args && !_.isEmpty(args) && isAuthOptions(args[0]);
  const prevSubject: Cypress.Chainable<any> =
    args && !_.isEmpty(args) && !isAuthOptions(args[0]) ? args[0] : undefined;
  let $args = normalizedC8yclientArguments(
    args && prevSubject ? args.slice(1) : args
  );

  let authOptions: C8yAuthOptions | undefined = undefined;
  let basicAuthArg: C8yAuthOptions | undefined = undefined;

  let cookieAuth: C8yAuthentication | undefined = undefined;
  let bearerAuth: C8yAuthentication | undefined = undefined;
  let basicAuth: C8yAuthentication | undefined = undefined;

  let authFromOptions = false;

  if (!isAuthOptions($args[0]) && _.isObject($args[$args.length - 1])) {
    const opt = $args[$args.length - 1];
    if (opt && opt.auth) {
      // explicit auth provided via options has highest priority
      authFromOptions = true;
      $args = [opt.auth, ...($args[0] === undefined ? $args.slice(1) : $args)];
    }
  } else if (!_.isEmpty($args) && isAuthOptions($args[0])) {
    authOptions = $args[0];
    if (authOptions.user && authOptions.password) {
      basicAuthArg = authOptions;
      basicAuth = new BasicAuth({
        user: authOptions.user,
        password: authOptions.password,
        tenant: authOptions.tenant,
      });
    }
    if (authOptions.token) {
      // use BearerAuth when token is provided via auth options (env or args)
      bearerAuth = new BearerAuth(authOptions.token);
    }
  }

  if (_.isFunction($args[0]) || isArrayOfFunctions($args[0])) {
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
  // Select authentication with following precedence:
  // 1) Explicit auth from options or previous subject wins over cookie
  // 2) CookieAuth (if present) preferred unless preferBasicAuth=true
  // 3) Fallback to argAuth (BasicAuth/BearerAuth) if present
  const explicitAuth = authFromOptions || prevSubjectIsAuth;
  let auth: C8yAuthentication | undefined = cookieAuth;
  if (options.preferBasicAuth === true && basicAuth) {
    auth = basicAuth;
  } else if (
    bearerAuth &&
    (!cookieAuth || Cypress.testingType === "component")
  ) {
    auth = bearerAuth;
  } else {
    auth = cookieAuth ?? bearerAuth ?? basicAuth;
  }

  if (explicitAuth && argAuth) {
    auth = toC8yAuthentication(argAuth);
  }

  const baseUrl = options.baseUrl || getBaseUrlFromEnv();
  const tenant =
    (basicAuthArg && tenantFromBasicAuth(basicAuthArg)) ||
    (authOptions && authOptions.tenant) ||
    Cypress.env("C8Y_TENANT");

  // if client is provided via options, use it
  let c8yclient: C8yClient = { _client: options.client };

  // restore client only if client is undefined and no auth is provided as previousSubject
  // previousSubject must have priority
  if (!options.client && !prevSubjectIsAuth) {
    c8yclient = restoreClient() || { _client: undefined };
  }

  // last fallback option to find authentication
  if (!auth && c8yclient._auth) {
    auth = c8yclient._auth;
  }

  // pass userAlias into the auth so it is part of the pact recording
  if (authOptions && authOptions.userAlias) {
    _.extend(auth, { userAlias: authOptions.userAlias });
  } else if (Cypress.env("C8Y_LOGGED_IN_USER_ALIAS") && auth) {
    _.extend(auth, { userAlias: Cypress.env("C8Y_LOGGED_IN_USER_ALIAS") });
  }

  if (!auth && !hasAuthentication(c8yclient)) {
    throwError("Missing authentication. Authentication required.");
  }

  if (!c8yclient._client && !tenant && !options.skipClientAuthentication) {
    if (auth) {
      authenticateClient(auth, options, baseUrl).then(
        { timeout: options.timeout },
        (c) => {
          return runClient(c, clientFn, prevSubject, baseUrl);
        }
      );
    } else {
      throwError("Missing authentication. Authentication required.");
    }
  } else {
    if (!c8yclient._client) {
      if (!auth) {
        throwError("Missing authentication. Authentication required.");
      }
      c8yclient._client = new Client(auth, baseUrl);
      if (tenant) {
        c8yclient._client.core.tenant = tenant;
      }
    } else if ((auth && !options.client) || prevSubjectIsAuth) {
      if (!auth) {
        throwError("Missing authentication. Authentication required.");
      }
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
  baseUrl: C8yBaseUrl
) {
  storeClient(client);
  if (!fns) {
    // return Cypress.isCy(client) ? client : cy.wrap(client._client, { log: false });
    return cy.wrap(client._client, { log: false });
  }
  return run(client, fns, prevSubject, client._options || {}, baseUrl);
}

// create client as Client.authenticate() does, but also support
// Cookie authentication as Client.authenticate() only works with BasicAuth
function authenticateClient(
  auth: C8yAuthentication,
  options: C8yClientOptions,
  baseUrl: C8yBaseUrl
): Cypress.Chainable<C8yClient> {
  return cy.then({ timeout: options.timeout }, async () => {
    let res: Response | undefined;
    try {
      const clientCore = new FetchClient(auth, baseUrl);
      res = await clientCore.fetch("/tenant/currentTenant");
    } catch (error: any) {
      if (_.isError(error)) {
        error.name = "CypressError";
        throw error;
      } else {
        const ee = new Error(`Failed to fetch /tenant/currentTenant`);
        ee.name = "CypressError";
        throw ee;
      }
    }
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
  baseUrl: C8yBaseUrl
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
    // Generate request ID and set up logging
    const contextId = generateContextId();
    let logger: Cypress.Log | undefined;

    if (options.log !== false) {
      logger = Cypress.log({
        name: "c8yclient",
        autoEnd: false,
        message: `Preparing request [${contextId}]`,
        consoleProps: () => ({
          "contextId ID": contextId,
          Options: options,
          "Base URL": baseUrl,
          "Previous Subject": prevSubject,
        }),
      });
    }

    const enabled = Cypress.c8ypact.isEnabled();
    const ignore = options?.ignorePact === true || false;
    const savePact = !ignore && Cypress.c8ypact.isRecordingEnabled();

    // Set up the request context for the global fetch override (always, even when logging is disabled)
    currentRequestContext = {
      contextId,
      logger,
      options,
      startTime: Date.now(),
      client,
      savePact,
      ignorePact: ignore,
    };

    const matchPact = (response: any, schema: any) => {
      if (schema) {
        cy.c8ymatch(response, schema, undefined, options);
      } else {
        // object matching against existing pact
        if (ignore || !enabled) return;
        if (Cypress.c8ypact.mode() !== "apply") return;

        for (const r of _.isArray(response) ? response : [response]) {
          const record =
            options.record ?? Cypress.c8ypact.current?.nextRecord();
          const info = Cypress.c8ypact.current?.info;
          if (record != null && info != null && !ignore) {
            cy.c8ymatch(r, record, info, options);
          } else {
            if (
              record == null &&
              Cypress.c8ypact.getConfigValue("failOnMissingPacts", true) &&
              !ignore
            ) {
              if (
                Cypress.c8ypact.current == null ||
                _.isEmpty(Cypress.c8ypact.current?.records)
              ) {
                throwError(
                  `Invalid pact or no records found in pact with id '${Cypress.c8ypact.getCurrentTestId()}'. Check pact file for errors. Disable Cypress.c8ypact.config.failOnMissingPacts to ignore.`
                );
              } else {
                const current: any = Cypress.c8ypact.current;
                const index = _.isFunction(current?.currentRecordIndex)
                  ? current?.currentRecordIndex() ?? 0
                  : 0;
                throwError(
                  `Record with index ${index} not found in pact with id '${Cypress.c8ypact.getCurrentTestId()}'. Disable Cypress.c8ypact.config.failOnMissingPacts to ignore.`
                );
              }
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

        const preprocessedResponse = async (
          promise: Promise<any>
        ): Promise<Cypress.Response<any> | undefined> => {
          let result: any;
          try {
            result = await promise;
          } catch (error) {
            // Check if this is a network error (TypeError) rather than an HTTP error response
            if (_.isError(error)) {
              if (isC8yClientError(error)) throw error;
              throwC8yClientError(
                error,
                undefined,
                getRequestContext(contextId)
              );
            }
            result = error;
          }
          const cypressResponse = toCypressResponse(result);
          if (cypressResponse) {
            cypressResponse.$body = options.schema;
            if (savePact) {
              if (_.isArray(currentRequestContext?.requests)) {
                // the last request is cypressResponse, only store other requests first
                currentRequestContext.requests.pop();
                currentRequestContext.requests.forEach(async (req) => {
                  await Cypress.c8ypact.savePact(req, client);
                });
              }
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
        currentRequestContext = null;

        if (isArrayOfFunctions(fns) && !_.isEmpty(fns)) {
          run(client, fns, response, options, baseUrl);
        } else {
          cy.wrap(response, { log: Cypress.c8ypact.debugLog });
        }
      });
    } catch (err) {
      if (_.isError(err)) {
        currentRequestContext = null;
        throw err;
      }

      matchPact(err, options.schema);

      cy.then(() => {
        currentRequestContext = null;

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

/**
 * Gets a display-friendly URL string, removing the baseUrl for better readability in logs.
 */
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
