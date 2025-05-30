import _ from "lodash";

import { C8yAuthentication, getAuthOptionsFromBasicAuthHeader } from "./auth";

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
  bearer?: (() => string) | string;
  userAlias?: string;
  type?: string;
}

export type C8yAuthArgs = string | C8yAuthOptions;

interface LogOptions {
  consoleProps: any;
  loggedInUser?: string;
  logger?: { end: () => void };
}

export async function wrapFetchRequest(
  url: RequestInfo | URL,
  fetchOptions?: RequestInit,
  logOptions?: LogOptions
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

  const startTime = Date.now();
  const fetchFn = _.get(globalThis, "fetchStub") || globalThis.fetch;
  const fetchPromise: Promise<Response> = fetchFn(url, fetchOptions);
  const duration = Date.now() - startTime;

  const options = {
    url,
    fetchOptions,
    logOptions,
    duration,
  };

  return fetchPromise
    .then(async (response) => {
      const res = await wrapFetchResponse(response, options);
      if (_.isFunction(logOptions?.logger?.end)) logOptions?.logger?.end();
      return Promise.resolve(res);
    })
    .catch(async (response) => {
      const res = await wrapFetchResponse(response, options);
      if (_.isFunction(logOptions?.logger?.end)) logOptions?.logger?.end();
      return Promise.reject(res);
    });
}

export async function wrapFetchResponse(
  response: Response,
  options: {
    url?: RequestInfo | URL;
    fetchOptions?: IFetchOptions;
    duration?: number;
    logOptions?: LogOptions;
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

  if (logOptions?.consoleProps) {
    _.extend(
      logOptions.consoleProps,
      updateConsoleProps(responseObj, fetchOptions, logOptions)
    );
  }

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
  logOptions?: LogOptions,
  url?: RequestInfo | URL
) {
  const props: any = {};

  const cookieAuth =
    (responseObj.requestHeaders &&
      responseObj.requestHeaders["X-XSRF-TOKEN"]) ||
    undefined;
  const basicAuth =
    (responseObj.requestHeaders &&
      responseObj.requestHeaders["Authorization"]) ||
    undefined;

  // props["Options"] = options;
  if (cookieAuth) {
    const loggedInUser = logOptions?.loggedInUser || "";
    props["CookieAuth"] = `XSRF-TOKEN ${cookieAuth} (${loggedInUser})`;
  }
  if (basicAuth) {
    const auth = getAuthOptionsFromBasicAuthHeader(basicAuth);
    if (auth?.user) {
      props["BasicAuth"] = `${basicAuth} (${auth.user})`;
    }
  }

  props["Options"] = fetchOptions;
  props["Request"] = {
    responseBody: responseObj.body,
    responseStatus: responseObj.status,
    requestHeaders: responseObj.requestHeaders,
    requestBody: fetchOptions?.body || "",
    responseHeaders: responseObj.headers || [],
    requestURL: responseObj.url || url,
  };
  props["Yielded"] = responseObj;

  return props;
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
