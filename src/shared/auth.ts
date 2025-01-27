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
