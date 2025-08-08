/// <reference types="cypress" />

import _ from "lodash";
import { IAuthentication, ICredentials } from "@c8y/client";

export interface C8yAuthOptions extends ICredentials {
  sendImmediately?: boolean;
  bearer?: (() => string) | string;
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
  return _.isObjectLike(obj) && "user" in obj && "password" in obj;
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
    ("userAlias" in obj || "type" in obj) &&
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

export function getAuthOptionsFromJWT(jwtToken: string): C8yAuthOptions {
  try {
    const payload = JSON.parse(atob(jwtToken.split(".")[1]));
    return {
      token: jwtToken,
      xsrfToken: payload.xsrfToken,
      tenant: payload.ten,
      user: payload.sub,
      baseUrl: payload.aud ?? payload.iss,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to decode JWT token: ${message}`);
  }
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