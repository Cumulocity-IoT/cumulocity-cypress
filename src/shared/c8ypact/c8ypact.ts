/// <reference types="cypress" />

// workaround for lodash import in Cypress nodejs typescript runtime and browser
import lodash1 from "lodash";
import * as lodash2 from "lodash";
const _ = lodash1 || lodash2;

import { C8yPactPreprocessorOptions } from "./preprocessor";
import { C8yClientOptions } from "../c8yclient";
import { C8yPactAuthObject } from "../auth";
import { C8yBaseUrl, C8yTenant } from "../types";
import { isAbsoluteURL } from "../url";
import { get_i } from "../util";

export const C8yPactModeValues = [
  "record",
  "recording",
  "apply",
  "forward",
  "disabled",
  "mock",
] as const;
/**
 * The pact mode is used to determine the behavior of the recording and mocking capabilities.
 * - `record`: Records the requests and responses and stores them in a pact file.
 * - `apply`: Mocks or matches the requests and responses from the recorded pact file.
 * - `disabled`: Disables the pact recording and mocking (same as undefined).
 * - `forward`: Forward requests without recording or mocking (might not be supported in all contexts).
 * - `recording` (deprecated): same as `record`, use `record` instead.
 * - `mock`: Mock responses for requests. Same as `apply`, but `apply` could also mean matching the requests and responses depending on the context.
 */
export type C8yPactMode = (typeof C8yPactModeValues)[number];

export const C8yPactRecordingModeValues = [
  "refresh",
  "append",
  "new",
  "replace",
] as const;
/**
 * The pact recording mode is used to determine how or if requests and responses are recorded.
 * - `refresh` (default): Recreates the pact file with the all requests and responses.
 * - `append`: Appends the new requests and responses to the existing pact file.
 * - `new`: Only creates a new pact file if no pact file exists. If pact file exists, only new requests and responses are added.
 * - `replace`: Overwrites existing records of a pact with new request and response in the order of occurence. Other records are kept as is.
 */
export type C8yPactRecordingMode = (typeof C8yPactRecordingModeValues)[number];

/**
 * ID representing a pact object. Should be unique.
 * @example api__get__permission_failure_tests
 */
export type C8yPactID = string;

export interface C8yPactRequestMatchingOptions {
  ignoreUrlParameters?: string[];
  baseUrl?: C8yBaseUrl;
}

export interface C8yPactConfigOptions {
  /**
   * ID representing a pact object.
   */
  id?: C8yPactID;
  /**
   * Use to enable additional logging.
   */
  log?: boolean;
  /**
   * Information describing the producer of the pact. Includes name and version information
   */
  producer?: { name: string; version?: string } | string;
  /**
   * Information describing the consumer of the pact. Includes name and version information
   */
  consumer?: { name: string; version?: string } | string;
  /**
   * Tags describing the pact.
   */
  tags?: string[];
  /**
   * Description of the pact.
   */
  description?: string;
  /**
   * Use ignore to disable the pact for the current test case.
   */
  ignore?: boolean;
  /**
   * Use failOnMissingPacts to disable failing the test if no pact or no next record
   * is found for the current test case.
   */
  failOnMissingPacts?: boolean;
  /**
   * Use strictMatching to enable strict matching of the pact records. If strict matching
   * is enabled, all properties of the pact records must match and tests fail if a property
   * is missing. Default is false.
   */
  strictMatching?: boolean;
  /**
   * If strictMocking is enabled, an error will be thrown if no pact record matches the
   * current request. If disabled, the request will be passed through to the configured baseUrl.
   */
  strictMocking?: boolean;
  /**
   * Options to configure the C8yPactPreprocessor.
   */
  preprocessor?: C8yPactPreprocessorOptions;
  /**
   * Options to configure the C8yPact request matching.
   */
  requestMatching?: C8yPactRequestMatchingOptions;
  /**
   * Recording mode for the pact. Default is `refresh`.
   */
  recordingMode?: C8yPactRecordingMode;
}
export type C8yPactConfigKeys = keyof C8yPactConfigOptions;

export interface C8yPactEnv {
  tenant?: C8yTenant;
  loggedInUser?: string;
  loggedInUserAlias?: string;
  testTitlePath?: string[];
  systemVersion?: string;
  pluginVersion?: string;
  pluginFolder?: string;
}

export interface C8yPactObject {
  /**
   * Pact records containing the requests and responses as well as auth information,
   * configuration options and created objects.
   */
  records: C8yPactRecord[];
  /**
   * Meta information describing the pact.
   */
  info: C8yPactInfo;
  /**
   * Unique id of the pact.
   */
  id: C8yPactID;
}
export const C8yPactObjectKeys = ["records", "info", "id"] as string[];

/**
 * Pact object. Contains all information about a recorded pact, including
 * the pact records with requests and responses as well as info object with
 * meta data. A C8yPact objtect must have an unique id.
 */
export interface C8yPact extends C8yPactObject {
  /**
   * Clears all records of the pact. Also resets all indexes internally used for
   * iterating over the records.
   */
  clearRecords(): void;
  /**
   * Appends a new record to the pact. If skipIfExists is true, the record is
   * only appended if no record with the same request exists.
   * @param record The record to add.
   * @param skipIfExists If true, the record is only appended if no record for the same request exists.
   * @returns True if the record was appended, false otherwise.
   */
  appendRecord(record: C8yPactRecord, skipIfExists?: boolean): boolean;
  /**
   * Replaces an existing record with a new record. If no record with the same
   * request exists, the record is appended.
   * @param record The record to be replaced.
   * @returns True if the record was replaced, false otherwise.
   */
  replaceRecord(record: C8yPactRecord): boolean;
  /**
   * Returns the next pact record or null if no more records are available.
   */
  nextRecord(): C8yPactRecord | null;
  /**
   * Returns the next pact record matching the given request. Request matching is
   * based ob criteria like url and method. Returns null if no record is found.
   */
  nextRecordMatchingRequest(
    request: Partial<Request> | { url: string; method: string },
    baseUrl?: C8yBaseUrl
  ): C8yPactRecord | null;
  /**
   * Returns an iterator for the pact records.
   */
  [Symbol.iterator](): Iterator<C8yPactRecord | null>;
}

export interface C8yPactInfoVersion {
  system?: string;
  c8ypact?: string;
  runner?: string;
}

/**
 * Meta information describing a pact and how it was recorded.
 */
export interface C8yPactInfo extends C8yPactConfigOptions {
  id: C8yPactID;
  /**
   * Version information of the system, runner and pact standard used to record the pact.
   */
  version?: {
    system?: string;
    shell?: string;
    shellName?: string;
    c8ypact?: string;
    runner?: string;
  };
  /**
   * Title of the pact. Title is an array of suite and test titles.
   */
  title?: string[];
  /**
   * Base URL when recording the pact.
   */
  baseUrl: C8yBaseUrl;
  /**
   * Tenant when recording the pact.
   */
  tenant?: C8yTenant;
}

/**
 * The request stored in a C8yPactRecord.
 */
export type C8yPactRequest = Partial<Cypress.RequestOptions> & {
  $body?: any;
};

/**
 * The response stored in a C8yPactRecord.
 */
export interface C8yPactResponse<T> {
  allRequestResponses?: any[];
  body?: T;
  duration?: number;
  headers?: { [key: string]: string | string[] };
  isOkStatusCode?: boolean;
  status?: number;
  statusText?: string;
  method?: string;
  $body?: any; // [key: `$${string}`]: any;
}

/**
 * The C8yPactRecord contains all information about a recorded request. It contains
 * the request and response as well as configuration options, auth information and
 * the created object id.
 */
export interface C8yPactRecord {
  /**
   * Unique id of the record. Optional.
   */
  id?: C8yPactID;
  /**
   * Request of the record.
   */
  request: C8yPactRequest;
  /**
   * Response of the record.
   */
  response: C8yPactResponse<any>;
  /**
   * Modified response returned by interception RouteHandler.
   */
  modifiedResponse?: C8yPactResponse<any>;
  /**
   * Configuration options used for the request.
   */
  options?: C8yClientOptions;
  /**
   * Auth information used for the request. Can be Basic or Cookie auth. Contains username and possibly alias.
   */
  auth?: C8yPactAuthObject;
  /**
   * Id of an object created by the request. Used for mapping when running the recording.
   */
  createdObject?: string;

  /**
   * Converts the C8yPactRecord to a Cypress.Response object.
   */
  toCypressResponse(): Cypress.Response<any>;
  /**
   * Returns the date of the response.
   */
  date(): Date | null;
  /**
   * Returns if the record has a request header with the given key. Comparison is case-insensitive.
   */
  hasRequestHeader(key: string): boolean;
  /**
   * Returns the auth type of the record. Currently supports `BasicAuth`, `CookieAuth` or undefined.
   */
  authType(): "BasicAuth" | "CookieAuth" | "BearerAuth" | undefined;
}

export function isValidPactId(value: string): boolean {
  if (value == null || value.length > 1000 || !_.isString(value)) return false;
  const validPactIdRegex = /^[a-zA-Z0-9_-]+(__[a-zA-Z0-9_-]+)*$/;
  return validPactIdRegex.test(value);
}

/**
 * Creates an C8yPactID for a given string or array of strings.
 * @param value The string or array of strings to convert to a pact id.
 * @returns The pact id.
 */
export function pactId(value: string | string[]): C8yPactID | undefined {
  let result: string = "";
  const suiteSeparator = "__";

  const normalize = (value: string): string =>
    value
      .split(suiteSeparator)
      .map((v) => _.words(_.deburr(v), /[a-zA-Z0-9_-]+/g).join("_"))
      .join(suiteSeparator);

  if (value != null && _.isArray(value)) {
    result = value.map((v) => normalize(v)).join(suiteSeparator);
  } else if (value != null && _.isString(value)) {
    result = normalize(value as string);
  }
  if (result == null || _.isEmpty(result)) {
    return !value ? (value as C8yPactID) : (undefined as any);
  }
  return result;
}

/**
 * Validate the given pact mode. Throws an error if the mode is not supported
 * or undefined.
 * @param mode The pact mode to validate.
 */
export function validatePactMode(mode?: string) {
  if (mode != null) {
    const values = Object.values(C8yPactModeValues) as string[];
    if (
      !_.isString(mode) ||
      _.isEmpty(mode) ||
      !values.includes(mode.toLowerCase())
    ) {
      const error = new Error(
        `Unsupported pact mode: "${mode}". Supported values are: ${values.join(
          ", "
        )} or undefined.`
      );
      error.name = "C8yPactError";
      throw error;
    }
  }
}

/**
 * Validate the given pact recording mode. Throws an error if the mode is not supported
 * or undefined.
 * @param mode The pact recording mode to validate.
 */
export function validatePactRecordingMode(mode?: string) {
  if (mode != null) {
    const keys = Object.values(C8yPactRecordingModeValues) as string[];
    if (
      !_.isString(mode) ||
      _.isEmpty(mode) ||
      !keys.includes(mode.toLowerCase())
    ) {
      const error = new Error(
        `Unsupported recording mode: "${mode}". Supported values are: ${keys.join(
          ", "
        )} or undefined.`
      );
      error.name = "C8yPactError";
      throw error;
    }
  }
}

/**
 * Checks if the given object is a C8yPact. This also includes checking
 * all records to be valid C8yPactRecord instances.
 *
 * @param obj The object to check.
 * @returns True if the object is a C8yPact, false otherwise.
 */
export function isPact(obj: any): obj is C8yPact {
  return (
    _.isObjectLike(obj) &&
    "info" in obj &&
    _.isObjectLike(_.get(obj, "info")) &&
    "records" in obj &&
    _.isArray(_.get(obj, "records")) &&
    _.every(_.get(obj, "records"), isPactRecord) &&
    _.isFunction(_.get(obj, "nextRecord")) &&
    _.isFunction(_.get(obj, "nextRecordMatchingRequest")) &&
    _.isFunction(_.get(obj, "appendRecord")) &&
    _.isFunction(_.get(obj, "replaceRecord"))
  );
}

/**
 * Checks if the given object is a C8yPactRecord.
 *
 * @param obj The object to check.
 * @returns True if the object is a C8yPactRecord, false otherwise.
 */
export function isPactRecord(obj: any): obj is C8yPactRecord {
  return (
    _.isObjectLike(obj) &&
    "request" in obj &&
    _.isObjectLike(_.get(obj, "request")) &&
    "response" in obj &&
    _.isObjectLike(_.get(obj, "response")) &&
    _.isFunction(_.get(obj, "toCypressResponse"))
  );
}

/**
 * Checks if the given object is a Cypress.Response.
 *
 * @param obj The object to check.
 * @returns True if the object is a Cypress.Response, false otherwise.
 */
export function isCypressResponse(obj: any): obj is Cypress.Response<any> {
  return (
    _.isObjectLike(obj) &&
    "body" in obj &&
    "status" in obj &&
    "headers" in obj &&
    "requestHeaders" in obj &&
    "duration" in obj &&
    "url" in obj &&
    "isOkStatusCode" in obj &&
    // not a window.Response or Client.FetchResponse
    !("ok" in obj || "arrayBuffer" in obj)
  );
}

/**
 * Checks if the given object is a C8yPactError. A C8yPactError is an error
 * with the name "C8yPactError".
 *
 * @param error The object to check.
 * @returns True if the object is a C8yPactError, false otherwise.
 */
export function isPactError(error: any): boolean {
  return _.isError(error) && _.get(error, "name") === "C8yPactError";
}

function isDefined(value: any): boolean {
  return !_.isUndefined(value);
}

/**
 * Converts a Cypress.Response to a C8yPactRequest.
 */
export function toPactRequest(
  response: Cypress.Response<any> | Partial<Cypress.Response<any>>
): C8yPactRequest | undefined {
  if (!response) return response;
  const result = _.pickBy(
    _.mapKeys(
      _.pick(response, ["url", "method", "requestHeaders", "requestBody"]),
      (v, k) => {
        if (_.isEqual(k, "requestHeaders")) return "headers";
        if (_.isEqual(k, "requestBody")) return "body";
        return k;
      }
    ),
    isDefined
  ) as C8yPactRequest;
  if (_.isEmpty(result)) return undefined;
  return result;
}

/**
 * Converts a Cypress.Response to a C8yPactResponse.
 */
export function toPactResponse<T>(
  response: Cypress.Response<T> | Partial<Cypress.Response<T>>
): C8yPactResponse<T> | undefined {
  if (!response) return response;
  const result = _.pickBy(
    _.pick(response, [
      "status",
      "statusText",
      "body",
      "headers",
      "duration",
      "isOkStatusCode",
      "allRequestResponses",
      "$body",
    ]),
    isDefined
  ) as C8yPactResponse<T>;
  if (_.isEmpty(result)) return undefined;
  return result;
}

export type C8yPactSaveKeys = "id" | "info" | "records";

/**
 * Returns the value of the environment variable with the given name. The function
 * tries to find the value in the global `process.env` or `Cypress.env()`. If `env`
 * is provided, the function uses the given object as environment.
 *
 * The function tries to find the value in the following order:
 * - `name`
 * - `camelCase(name)`
 * - `CYPRESS_name`
 * - `name.replace(/^C8Y_/i, "")`
 * - `CYPRESS_camelCase(name)`
 * - `CYPRESS_camelCase(name.replace(/^C8Y_/i, ""))`
 *
 * @param name The name of the environment variable.
 * @param env The environment object to use. Default is `process.env` or `Cypress.env()`
 *
 * @returns The value of the environment variable or `undefined` if not found.
 */
export function getEnvVar(
  name: string,
  env?: { [key: string]: string }
): string | undefined {
  if (!name) return undefined;

  const e: { [key: string]: string } =
    env ||
    (typeof window !== "undefined" && window.Cypress
      ? Cypress.env()
      : process.env);

  function getFromEnv(key: string): string | undefined {
    return e[key] as string | undefined;
  }

  function getForName(name: string): string | undefined {
    return getFromEnv(name) || getFromEnv(`CYPRESS_${name}`);
  }

  const plainName = name.replace(/^C8Y_/i, "");
  const camelCasedName = _.camelCase(name).replace(/^c8Y/i, "c8y");
  const camelCasedPlainName = _.camelCase(plainName);
  return (
    getForName(name) ||
    getForName(camelCasedName) ||
    getForName(plainName) ||
    getForName(camelCasedPlainName)
  );
}

export function isOneOfStrings(value: string, values: string[]): boolean {
  if (!_.isString(value) || _.isEmpty(value)) return false;
  return values.includes(value.toLowerCase());
}

export function getCreatedObjectId(
  response:
    | Cypress.Response<any>
    | Partial<Cypress.Response<any>>
    | C8yPactResponse<any>
): string | undefined {
  let newId = response?.body?.id;
  if (newId) {
    return newId;
  } else {
    const location = get_i(response, "headers.location");
    if (isAbsoluteURL(location)) {
      try {
        const url = new URL(location);
        const pathSegments = url?.pathname.split("/").filter(Boolean);

        newId = pathSegments?.pop();
        if (newId != null) {
          return decodeURIComponent(newId);
        }
      } catch {
        // do nothing
      }
    }
  }
  return undefined;
}
