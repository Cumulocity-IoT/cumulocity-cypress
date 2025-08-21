import _ from "lodash";

import {
  C8yAuthentication,
  getAuthOptionsFromBasicAuthHeader,
  getAuthOptionsFromJWT,
} from "./auth";

import {
  Client,
  IAuthentication,
  ICredentials,
  IFetchOptions,
  IFetchResponse,
  IResult,
  IResultList,
} from "@c8y/client";
import {
  C8yPactRecord,
  isCypressResponse,
  isPactRecord,
} from "./c8ypact/c8ypact";

import { C8ySchemaMatcher } from "./c8ypact/schema";
import { C8yBaseUrl } from "./types";
import { get_i } from "./util";

declare global {
  interface Response {
    data?: string | any;
    method?: string;
    responseObj?: Partial<Cypress.Response<any>>;
    requestBody?: string | any;
  }
  namespace Cypress {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    interface Response<T> {
      url?: string;
      requestBody?: string | any;
      method?: string;
      $body?: any;
    }
  }
}

/**
 * C8yClientError is an error class used to throw errors related to the c8yclient command.
 * It extends the built-in Error class and adds an optional originalError property.
 */
export class C8yClientError extends Error {
  originalError?: Error;
  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = "C8yClientError";
    this.originalError = originalError;
  }
}

/**
 * Options used to configure c8yclient command.
 */
export type C8yClientOptions = Partial<Cypress.Loggable> &
  Partial<Cypress.Timeoutable> &
  Partial<Pick<Cypress.Failable, "failOnStatusCode">> &
  Partial<{
    auth: IAuthentication;
    baseUrl: C8yBaseUrl;
    client: Client;
    preferBasicAuth: boolean;
    skipClientAuthentication: boolean;
    failOnPactValidation: boolean;
    ignorePact: boolean;
    schema: any;
    record: C8yPactRecord;
    schemaMatcher: C8ySchemaMatcher;
    strictMatching: boolean;
    /** Custom ID to identify this request in logs. If not provided, a unique ID will be generated. */
    requestId: string;
  }>;

/**
 * Wrapper for Client to pass auth and options without extending Client.
 * Using underscore to avoid name clashes with Client and misunderstandings reading the code.
 */
export interface C8yClient {
  _auth?: C8yAuthentication;
  _options?: C8yClientOptions;
  _client?: Client;
}

/**
 * C8yAuthOptions is used to configure the authentication for the cy.c8yclient command. It is
 * an extension of the ICredentials interface from the @c8y/client package adding
 * userAlias and type property.
 */
export interface C8yAuthOptions extends ICredentials {
  // support cy.request properties
  sendImmediately?: boolean;
  userAlias?: string;
  type?: string;
}

export type C8yAuthArgs = string | C8yAuthOptions;

export interface C8yClientRequestContext {
  requestId: string;
  logger: Cypress.Log;
  options: C8yClientOptions;
  startTime: number;
}

export interface C8yClientLogOptions {
  consoleProps?: any;
  loggedInUser?: string;
  requestId?: string;
  startTime?: number;
  options?: C8yClientOptions;
  // Callback functions for Cypress-specific logging
  onRequestStart?: (requestDetails: {
    requestId: string;
    url: string;
    method: string;
    headers?: any;
    body?: any;
    startTime: number;
    options?: any;
    additionalInfo?: any;
  }) => void;
  onRequestEnd?: (responseDetails: {
    requestId: string;
    url: string;
    method: string;
    status?: number;
    headers?: any;
    body?: any;
    duration: number;
    success: boolean;
    error?: any;
    options?: any;
    fetchOptions?: any;
    yielded?: any;
    additionalInfo?: any;
  }) => void;
}

export async function wrapFetchRequest(
  url: RequestInfo | URL,
  fetchOptions?: RequestInit,
  logOptions?: C8yClientLogOptions
): Promise<Response> {
  // client.tenant.current() does add content-type header for some reason. probably mistaken accept header.
  // as this is not required, remove it to avoid special handling in pact matching against recordings
  // not created by c8y/client.
  if (_.endsWith(toUrlString(url), "/tenant/currentTenant")) {
    // @ts-expect-error
    fetchOptions.headers = _.omit(fetchOptions.headers, ["content-type"]);
  } else {
    // add json content type if body is present and content-type is not set
    const method = fetchOptions?.method || "GET";
    if (fetchOptions?.body && method !== "GET" && method != "HEAD") {
      fetchOptions.headers = {
        "content-type": "application/json",
        ...fetchOptions.headers,
      };
    }
  }

  const startTime = logOptions?.startTime || Date.now();
  const requestId = logOptions?.requestId;

  // Notify about request start
  if (logOptions?.onRequestStart && requestId) {
    const method = fetchOptions?.method || "GET";

    logOptions.onRequestStart({
      requestId,
      url: toUrlString(url),
      method,
      headers: fetchOptions?.headers,
      body: fetchOptions?.body,
      startTime,
    });
  }

  const fetchFn = _.get(globalThis, "fetchStub") || globalThis.fetch;
  const fetchPromise: Promise<Response> = fetchFn(url, fetchOptions);

  const options = {
    url,
    fetchOptions,
    logOptions: {
      ...logOptions,
      startTime,
    },
    duration: 0, // Will be calculated when response arrives
  };

  return fetchPromise
    .then(async (response) => {
      const duration = Date.now() - startTime;
      options.duration = duration;

      const res = await wrapFetchResponse(response, options);

      return Promise.resolve(res);
    })
    .catch(async (error) => {
      const duration = Date.now() - startTime;

      // Check if this is a network error (TypeError) rather than an HTTP error response
      if (_.isError(error)) {
        if (error.name === "C8yClientError") throw error;
        throwC8yClientError(error, url, {
          ...logOptions,
          method: fetchOptions?.method || "GET",
        });
      }

      // If it's not an Error object, treat it as a response (shouldn't happen in normal cases)
      const res = await wrapFetchResponse(error, { ...options, duration });
      return Promise.reject(res);
    });
}

export async function wrapFetchResponse(
  response: Response,
  options: {
    url?: RequestInfo | URL;
    fetchOptions?: IFetchOptions;
    duration?: number;
    logOptions?: C8yClientLogOptions;
  } = {}
) {
  // only wrap valid responses or new Response() will fail later
  if (
    response.status == null ||
    response.status < 200 ||
    response.status > 599
  ) {
    return response;
  }

  const responseObj = await (async () => {
    return toCypressResponse(
      response,
      options.duration,
      options.fetchOptions,
      options.url
    );
  })();
  if (!responseObj) return response;

  let rawBody: string | undefined = undefined;
  if (response.data) {
    responseObj.body = response.data;
    rawBody = _.isObject(responseObj.body)
      ? JSON.stringify(responseObj.body)
      : responseObj.body;
  } else if (response.body) {
    try {
      rawBody = await response.text();
      responseObj.body = JSON.parse(rawBody);
    } catch {
      responseObj.body = rawBody;
    }
  }

  // empty body ("") is not allowed, make sure to use undefined instead
  if (_.isEmpty(rawBody)) {
    rawBody = undefined;
  }

  const fetchOptions = options?.fetchOptions ?? {};
  const logOptions = options?.logOptions;
  try {
    responseObj.requestBody =
      fetchOptions && _.isString(fetchOptions?.body)
        ? JSON.parse(fetchOptions.body)
        : fetchOptions?.body;
  } catch {
    responseObj.requestBody = fetchOptions?.body;
  }
  // res.ok = response.ok,
  responseObj.method = fetchOptions?.method || response.method || "GET";

  updateConsoleProps(
    responseObj,
    fetchOptions,
    logOptions,
    options.url,
    options.duration
  );

  // create a new window.Response for Client. this is required as the body
  // stream can not be read more than once. as we just read it, recreate the response
  // and resolve json() and text() promises using the values we read from the stream.
  const result = new Response(rawBody, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

  // pass the responseObj as part of the window.Response object. this way we can access
  // in the Clients response and do not need to reprocess
  result.responseObj = responseObj;
  result.requestBody = responseObj.requestBody;
  result.method = responseObj.method;
  result.data = responseObj.body;

  // result.json = () => Promise.resolve(responseObj.body);
  // result.text = () => Promise.resolve(rawBody || "");

  return result;
}

function updateConsoleProps(
  responseObj: Partial<Cypress.Response<any>>,
  fetchOptions?: IFetchOptions,
  logOptions?: C8yClientLogOptions,
  url?: RequestInfo | URL,
  duration?: number
) {
  const authInfo: any = {};

  const authorizationHeader = get_i(
    responseObj,
    "requestHeaders.authorization"
  );

  if (authorizationHeader) {
    const auth = getAuthOptionsFromBasicAuthHeader(authorizationHeader);
    if (auth?.user && auth?.password) {
      authInfo["Basicauth"] = `${authorizationHeader} (${auth.user})`;
    } else {
      if (authorizationHeader.startsWith("Bearer ")) {
        try {
          const jwt = authorizationHeader.replace("Bearer ", "");
          const authOptions = getAuthOptionsFromJWT(jwt);
          authInfo["BearerAuth"] = authOptions;
        } catch {
          // ignore errors parsing JWT
        }
      }
    }
  } else {
    let token = get_i(responseObj, "requestHeaders.cookie.authorization");
    if (!token) {
      token = get_i(responseObj, "requestHeaders.X-XSRF-TOKEN");
    }
    // props["Options"] = options;
    if (token) {
      const loggedInUser = logOptions?.loggedInUser || "";
      authInfo["CookieAuth"] = `${token} (${loggedInUser})`;
    }
  }
  // Call onRequestEnd callback if available
  if (logOptions?.onRequestEnd && logOptions?.requestId) {
    logOptions.onRequestEnd({
      requestId: logOptions.requestId,
      url: toUrlString(url || responseObj.url || ""),
      method: fetchOptions?.method || responseObj.method || "GET",
      status: responseObj.status || 0,
      headers: responseObj.headers || {},
      body: responseObj.body,
      duration: duration || responseObj.duration || 0,
      success: responseObj.isOkStatusCode || false,
      fetchOptions,
      options: logOptions.options as any,
      yielded: responseObj,
      additionalInfo: authInfo
    });
  }
}

/**
 * Converts the given URL to a string.
 * @param url The URL or RequestInfo to convert.
 * @returns The URL as a string.
 */
export function toUrlString(url: RequestInfo | URL): string {
  if (_.isString(url)) {
    return url;
  } else if (url instanceof URL) {
    return url.toString();
  } else if (url instanceof Request) {
    return url.url;
  } else {
    throw new Error(
      `Type for URL not supported. Expected URL, string or Request, but found $'{typeof url}}'.`
    );
  }
}

/**
 * Converts the given object to a Cypress.Response.
 * @param obj The object to convert.
 * @param duration The duration of the request.
 * @param fetchOptions The fetch options used for the request.
 * @param url The URL of the request.
 * @param schema The schema of the response.
 */
export function toCypressResponse(
  obj:
    | IFetchResponse
    | IResult<any>
    | IResultList<any>
    | C8yPactRecord
    | Partial<Response>,
  duration: number = 0,
  fetchOptions: IFetchOptions = {},
  url?: RequestInfo | URL,
  schema?: any
): Cypress.Response<any> | undefined {
  if (!obj) return undefined;

  if (typeof isPactRecord === "function" && isPactRecord(obj)) {
    return obj.toCypressResponse();
  }
  let fetchResponse: Response;
  if (isIResult(obj)) {
    fetchResponse = obj.res;
  } else if (isWindowFetchResponse(obj)) {
    fetchResponse = obj;
  } else {
    fetchResponse = obj as any;
  }
  if ("responseObj" in fetchResponse) {
    return _.get(fetchResponse, "responseObj") as Cypress.Response<any>;
  }
  return {
    status: fetchResponse.status,
    isOkStatusCode:
      fetchResponse.ok ||
      (fetchResponse.status > 199 && fetchResponse.status < 300),
    statusText: fetchResponse.statusText,
    headers: Object.fromEntries(fetchResponse.headers || []),
    requestHeaders: fetchOptions.headers,
    duration: duration,
    ...(url && { url: toUrlString(url) }),
    allRequestResponses: [],
    body: fetchResponse.data,
    requestBody: fetchResponse.requestBody,
    method: fetchResponse.method || "GET",
    ...(schema && { $body: schema }),
  };
}

/**
 * Converts a Cypress.Response or C8yPactRecord to a window.Response. If
 * the given object is not a Cypress.Response or C8yPactRecord, undefined
 * is returned.
 * @param obj The object to check.
 */
export function toWindowFetchResponse(
  obj: Cypress.Response<any> | C8yPactRecord
): Response | undefined {
  if (isPactRecord(obj)) {
    const body = _.isObjectLike(obj.response.body)
      ? JSON.stringify(obj.response.body)
      : obj.response.body;
    return new window.Response(body, {
      status: obj.response.status,
      statusText: obj.response.statusText,
      url: obj.request.url,
      ...(obj.response.headers && {
        headers: toResponseHeaders(obj.response.headers),
      }),
      ...(obj.request.url && { url: obj.request.url }),
    });
  }
  if (isCypressResponse(obj)) {
    return new window.Response(obj.body, {
      status: obj.status,
      statusText: obj.statusText,
      headers: toResponseHeaders(obj.headers),
      ...(obj.url && { url: obj.url }),
    });
  }
  return undefined;
}

/**
 * Converts the given headers to a window.Headers object.
 * @param headers The headers object to convert.
 */
export function toResponseHeaders(headers: {
  [key: string]: string | string[];
}): Headers {
  // type HeadersInit = [string, string][] | Record<string, string> | Headers;
  const arr: [string, string][] = [];

  for (const [key, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      value.forEach((v) => arr.push([key, v]));
    } else {
      arr.push([key, value]);
    }
  }
  return new Headers(arr);
}

/**
 * Checks if the given object is a window.Response.
 * @param obj The object to check.
 */
export function isWindowFetchResponse(obj: any): obj is Response {
  return (
    obj != null &&
    _.isObjectLike(obj) &&
    "status" in obj &&
    "statusText" in obj &&
    "headers" in obj &&
    "body" in obj &&
    "url" in obj &&
    _.isFunction(_.get(obj, "json")) &&
    _.isFunction(_.get(obj, "arrayBuffer"))
  );
}

/**
 * Checks if the given object is an IResult.
 * @param obj The object to check.
 */
export function isIResult(obj: any): obj is IResult<any> {
  return (
    obj != null &&
    _.isObjectLike(obj) &&
    "data" in obj &&
    "res" in obj &&
    isWindowFetchResponse(obj.res)
  );
}

/**
 * Checks if the given object is a CypressError.
 * @param error The object to check.
 * @returns True if the object is a CypressError, false otherwise.
 */
export function isCypressError(error: any): boolean {
  return _.isError(error) && _.get(error, "name") === "CypressError";
}

export function throwC8yClientError(
  error: Error,
  url: RequestInfo | URL | undefined = undefined,
  logOptions?: C8yClientLogOptions & { method?: string }
): never {
  let errorMessage: string | undefined;
  if (error instanceof TypeError) {
    errorMessage = url
      ? `Network error occurred while making request to ${toUrlString(
          url || ""
        )}: ${error.message}`
      : `Network error occurred while making request: ${error.message}`;
  } else {
    errorMessage = `Request failed: ${error.message}`;
  }

  // Call onRequestEnd if logging options are provided
  if (logOptions?.onRequestEnd && logOptions?.requestId) {
    const duration = logOptions.startTime
      ? Date.now() - logOptions.startTime
      : 0;

    logOptions.onRequestEnd({
      requestId: logOptions.requestId,
      url: toUrlString(url || ""),
      method: logOptions.method || "GET",
      duration,
      success: false,
      error: errorMessage || error.message || error.toString(),
    });
  }

  throw new C8yClientError(errorMessage, error);
}
