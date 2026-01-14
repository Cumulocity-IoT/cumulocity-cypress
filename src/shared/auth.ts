/// <reference types="cypress" />

import _ from "lodash";
import {
  BasicAuth,
  BearerAuth,
  Client,
  FetchClient,
  IAuthentication,
  ICredentials,
} from "@c8y/client";
import { normalizeBaseUrl } from "./url";
import { get_i } from "./util";
import { C8yClient } from "./c8yclient";

export interface C8yAuthOptions extends ICredentials {
  sendImmediately?: boolean;
  userAlias?: string;
  type?: string;
  xsrfToken?: string;
}

export interface C8yPactAuthObject {
  userAlias?: string;
  user: string;
  type?: string;
}

type C8yPactAuthObjectType = keyof C8yPactAuthObject;
export const C8yPactAuthObjectKeys: C8yPactAuthObjectType[] = [
  "userAlias",
  "user",
  "type",
];

export type C8yAuthentication = IAuthentication;

/**
 * Checks if the given object is a C8yAuthOptions.
 *
 * @param obj The object to check.
 * @param options Options to check for additional properties.
 * @returns True if the object is a C8yAuthOptions, false otherwise.
 */
export function isAuthOptions(obj: any): obj is C8yAuthOptions {
  return (
    _.isObjectLike(obj) &&
    (("user" in obj && "password" in obj) || "token" in obj)
  );
}

// new function to convert C8yAuthOptions to IAuthentication
export function toC8yAuthentication(
  obj: C8yAuthOptions | IAuthentication | undefined
): C8yAuthentication | undefined {
  if (!obj || !_.isObjectLike(obj)) {
    return undefined;
  }
  if (_.get(obj, "getFetchOptions")) {
    return obj as C8yAuthentication;
  }

  if (!isAuthOptions(obj)) {
    return undefined as any;
  }
  if (obj.token) {
    return new BearerAuth(obj.token);
  } else if (obj.user && obj.password) {
    return new BasicAuth({
      user: obj.user,
      password: obj.password,
      tenant: obj.tenant,
    });
  }
  return undefined;
}

export function hasAuthentication(
  client: C8yClient | Client | FetchClient
): boolean {
  if (!client) return false;
  const fetchClient =
    _.get(client, "_client.core") ?? _.get(client, "core") ?? client;
  const getFetchOptionsFn = _.get(fetchClient, "getFetchOptions");

  if (_.isFunction(getFetchOptionsFn)) {
    const options = getFetchOptionsFn.apply(fetchClient);
    if (!options) return false;

    if (get_i(options, "headers.X-XSRF-TOKEN")) return true;
    if (get_i(options, "headers.authorization")) return true;
  }

  if (_.get(fetchClient, "_auth")) return true;

  return false;
}

export function toPactAuthObject(
  obj: C8yAuthOptions | IAuthentication | ICredentials
): C8yPactAuthObject {
  return _.pick(obj, C8yPactAuthObjectKeys) as C8yPactAuthObject;
}

export function isPactAuthObject(obj: any): obj is C8yPactAuthObject {
  return (
    _.isObjectLike(obj) &&
    "user" in obj &&
    ("userAlias" in obj || "type" in obj || "token" in obj) &&
    Object.keys(obj).every((key) =>
      (C8yPactAuthObjectKeys as string[]).includes(key)
    )
  );
}

export function normalizeAuthHeaders(headers: { [key: string]: any }) {
  // required to fix inconsistencies between c8yclient and interceptions
  // using lowercase and uppercase. fix here.
  const xsrfTokenHeader = Object.keys(headers || {}).find(
    (key) => key.toLowerCase() === "x-xsrf-token"
  );
  const authorizationHeader = Object.keys(headers || {}).find(
    (key) => key.toLowerCase() === "authorization"
  );

  if (xsrfTokenHeader && xsrfTokenHeader !== "X-XSRF-TOKEN") {
    headers["X-XSRF-TOKEN"] = headers[xsrfTokenHeader];
    delete headers[xsrfTokenHeader];
  }

  if (authorizationHeader && authorizationHeader !== "Authorization") {
    headers["Authorization"] = headers[authorizationHeader];
    delete headers[authorizationHeader];
  }
  return headers;
}

export function getAuthOptionsFromEnv(env: any): C8yAuthOptions | undefined {
  if (env == null || !_.isObjectLike(env)) {
    return undefined;
  }

  // check first environment variables
  const jwtToken = env["C8Y_TOKEN"];
  try {
    const authFromToken = getAuthOptionsFromJWT(jwtToken);
    if (authFromToken) {
      return authWithTenant(env, authFromToken);
    }
  } catch {
    // ignore errors from extractTokensFromJWT
    // this is expected if the token is not a valid JWT
  }

  const user = env[`C8Y_USERNAME`] ?? env[`C8Y_USER`];
  const password = env[`C8Y_PASSWORD`];
  if (!_.isEmpty(user) && !_.isEmpty(password)) {
    return authWithTenant(env, {
      user,
      password,
    });
  }

  return undefined;
}

export function authWithTenant(env: any, options: C8yAuthOptions) {
  if (env == null || !_.isObjectLike(env)) {
    return options;
  }

  const tenant = env[`C8Y_TENANT`];
  if (tenant && !options?.tenant) {
    _.extend(options, { tenant });
  }
  return options;
}

export function getAuthOptionsFromBasicAuthHeader(
  authHeader: string
): { user: string; password: string } | undefined {
  if (
    !authHeader ||
    !_.isString(authHeader) ||
    !authHeader.startsWith("Basic ")
  ) {
    return undefined;
  }

  const base64Credentials = authHeader.slice("Basic ".length);
  const credentials = decodeBase64(base64Credentials);

  const components = credentials.split(":");
  if (!components || components.length < 2) {
    return undefined;
  }

  return { user: components[0], password: components.slice(1).join(":") };
}

/**
 * Extracts the authentication options from a JWT token.
 * @param jwtToken The JWT token to extract the authentication options from.
 * @returns The extracted authentication options.
 */
export function getAuthOptionsFromJWT(jwtToken: string): C8yAuthOptions {
  try {
    const payload = JSON.parse(atob(jwtToken.split(".")[1]));
    // Remove all characters not valid in JWT tokens (base64url: A-Z, a-z, 0-9, -, _, .)
    const cleanedToken = jwtToken?.replace(/[^A-Za-z0-9\-_.]/g, "");
    return {
      token: cleanedToken,
      xsrfToken: payload.xsrfToken,
      tenant: payload.ten,
      user: payload.sub,
      baseUrl: normalizeBaseUrl(payload.aud ?? payload.iss),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to decode JWT token: ${message}`);
  }
}

/**
 * Extracts the tenant from the basic auth object.
 * @param auth The basic auth object containing the user property.
 * @returns The tenant or undefined if not found.
 */
export function tenantFromBasicAuth(
  auth: { user?: string | undefined } | string
): string | undefined {
  if (_.isString(auth)) {
    auth = { user: auth };
  }
  if (!auth || !_.isObjectLike(auth) || !auth.user) return undefined;

  const components = auth.user.split("/");
  if (
    !components ||
    components.length < 2 ||
    _.isEmpty(components[1]) ||
    _.isEmpty(components[0])
  )
    return undefined;

  return components[0];
}

export function encodeBase64(str: string): string {
  if (!str) return "";

  let encoded: string;
  if (typeof Buffer !== "undefined") {
    encoded = Buffer.from(str).toString("base64");
  } else {
    encoded = btoa(str);
  }

  return encoded;
}

export function decodeBase64(base64: string): string {
  if (!base64) return "";

  let decoded: string;
  if (typeof Buffer !== "undefined") {
    decoded = Buffer.from(base64, "base64").toString("utf-8");
  } else {
    decoded = atob(base64);
  }

  return decoded;
}
