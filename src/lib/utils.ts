/// <reference types="cypress" />

import { BasicAuth, CookieAuth, IAuthentication } from "@c8y/client";
import { C8yAuthOptions, isAuthOptions } from "../shared/auth";
import { C8yClient } from "../shared/c8yclient";
import { getEnvVar } from "../shared/c8ypact/c8ypact";
import { toSemverVersion } from "../shared/versioning";

const { _ } = Cypress;

/**
 * Helper to normalize any given arguments and Cypress `prevSubject`.
 *
 * When chaining commands, Cypress will pass result from previous subject
 * (parent) as first argument. In case of optional `prevSubject` Cypress will pass
 * `null` as first argument if previous command did not yield a result value.
 *
 * Depending on the hierarchy of chained commands, the structure of the
 * `prevSubject` argument will be different.
 *
 * Supported options
 * 1. [<prevSubject>, arguments]
 * 2. {"<index>": [<prevSubject>, arguments], "<index>": arguments }
 *
 * Structure of 2) depends on the command chainer.
 */
export function normalizedArguments(args: any[] | any) {
  if (!args) return [];

  let result: any[] = [];
  if (_.isArray(args)) {
    result = args;
    if (args[0] != null && _.isArray(result[0])) {
      const subjects = _.flatten(result[0]);
      result = subjects.concat(result.slice(1));
    }
  } else if (_.isObjectLike(args)) {
    const values: any[] = Object.values(args);
    result = _.flatten(values[0]).concat(values.slice(1));
  }
  return _.dropWhile(result, (a: any) => !a);
}

/**
 * Get `normalizedArguments` and insert auth options from
 * env variables at the beginning of the arguments.
 */
export function normalizedArgumentsWithAuth(args: any[]) {
  if (!args) return [undefined];
  const normalized = normalizedArguments(args);
  if (
    _.isEmpty(normalized) ||
    (!_.isEmpty(normalized) && !isAuthOptions(normalized[0]))
  ) {
    const auth = getAuthOptionsFromEnv();
    if (auth) {
      normalized.unshift(auth);
    } else {
      if (!args[0]) {
        normalized.unshift(undefined);
      }
    }
  }
  return normalized;
}

export function normalizedC8yclientArguments(args: any[]) {
  if (!args) return [undefined];
  const normalized = normalizedArgumentsWithAuth(args);
  if (getCookieAuthFromEnv() != null && args[0] == null) {
    normalized[0] = undefined;
  }
  return normalized;
}

export function getCookieAuthFromEnv() {
  const cookieAuth = new CookieAuth();
  const token = _.get(cookieAuth.getFetchOptions({}), "headers.X-XSRF-TOKEN");
  if (!token || _.isEmpty(token)) {
    return undefined;
  }
  return cookieAuth;
}

export function getXsrfToken() {
  const cookieAuth = new CookieAuth();
  const token = _.get(cookieAuth.getFetchOptions({}), "headers.X-XSRF-TOKEN");
  if (token != null && !_.isEmpty(token)) {
    return token;
  }
  return undefined;
}

export function getAuthOptionsFromEnv() {
  // check first environment variables
  const user = Cypress.env(`C8Y_USERNAME`);
  const password = Cypress.env(`C8Y_PASSWORD`);
  if (!_.isEmpty(user) && !_.isEmpty(password)) {
    return authWithTenant({
      user,
      password,
    });
  }

  // check window.localStorage for __auth item
  const win = cy.state("window");
  const authString = win.localStorage.getItem("__auth");
  if (authString && _.isString(authString) && !_.isEmpty(authString)) {
    const authObj = getAuthOptionsFromArgs(JSON.parse(authString));
    if (isAuthOptions(authObj)) {
      return authObj;
    }
  }

  // check auth options configured via it("...", {auth: {...}}, ...)
  const auth = getAuthOptionsFromArgs(Cypress.config().auth);
  if (isAuthOptions(auth)) {
    return auth;
  }
  return undefined;
}

export function getAuthOptions(...args: any[]): C8yAuthOptions | undefined {
  if (!args || !args.length || (args[0] == null && args.length === 1)) {
    return getAuthOptionsFromEnv();
  }

  // first args are null for every { prevSubject: option } command in the
  // call hierarchy. remove all null args from the beginning.
  if (args[0] == null) {
    args = _.dropWhile(args, (a) => !a);
  } else if (_.isArray(args[0])) {
    args = _.flatten(args[0]);
  }

  const auth = getAuthOptionsFromArgs(...args);
  if (isAuthOptions(auth)) {
    return authWithTenant(auth);
  }

  return getAuthOptionsFromEnv();
}

function getAuthOptionsFromArgs(...args: any[]): C8yAuthOptions | undefined {
  // do not call getAuthOptionsFromEnv() in here!

  // getAuthOptions("admin")
  // return envs admin_username | admin, admin_password
  if (!_.isEmpty(args) && _.isString(args[0])) {
    const user = Cypress.env(`${args[0]}_username`) || args[0];
    const password = Cypress.env(`${args[0]}_password`);
    if (user && password) {
      return authWithTenant({
        user,
        password,
        userAlias: args[0],
      });
    }
  }

  // getAuthOptions({user: "abc", password: "abc"}, ...)
  if (!_.isEmpty(args) && _.isObjectLike(args[0])) {
    if (isAuthOptions(args[0])) {
      return authWithTenant(
        _.pick(args[0], ["user", "password", "tenant", "userAlias", "type"])
      );
    }

    // getAuthOptions({userAlias: "abc"}, ...)
    if (args[0].userAlias) {
      const user =
        Cypress.env(`${args[0].userAlias}_username`) || args[0].userAlias;
      const password = Cypress.env(`${args[0].userAlias}_password`);
      if (user && password) {
        return authWithTenant({
          user,
          password,
          userAlias: args[0].userAlias,
          ...(args[0].type && { type: args[0].type }),
        });
      }
    }
    // getAuthOptions({user: "abc", password: "abc"}, ...)
    if (args[0].username && args[0].password) {
      const auth = _.pick(args[0], [
        "username",
        "password",
        "tenantId",
        "userAlias",
      ]);
      delete Object.assign(auth, { user: auth.username })["username"];
      if (auth.tenantId) {
        delete Object.assign(auth, { tenant: auth.tenantId })["tenantId"];
      }
      return authWithTenant(auth);
    }
  }

  // getAuthOptions("abc", "abc")
  if (args.length >= 2 && _.isString(args[0]) && _.isString(args[1])) {
    return authWithTenant({
      user: args[0],
      password: args[1],
    });
  }

  return undefined;
}

/**
 * Gets and implementation of IAuthentication from the given auth options.
 */
export function getC8yClientAuthentication(
  auth: C8yAuthOptions | string | IAuthentication | undefined
): IAuthentication | undefined {
  let authOptions: C8yAuthOptions | undefined;
  let result: IAuthentication | undefined;

  if (auth) {
    if (_.isString(auth)) {
      authOptions = getAuthOptions(auth);
    } else if (_.isObjectLike(auth)) {
      if ("logout" in auth) {
        result = auth as IAuthentication;
      } else {
        authOptions = auth as C8yAuthOptions;
      }
    }
  }

  if (!result) {
    const cookieAuth = new CookieAuth();
    const token: string = _.get(
      cookieAuth.getFetchOptions({}),
      "headers.X-XSRF-TOKEN"
    );
    if (token?.trim() && !_.isEmpty(token.trim())) {
      result = cookieAuth;
    } else if (authOptions) {
      result = new BasicAuth(authOptions);
    }
  }

  return result;
}

export function persistAuth(auth: C8yAuthOptions) {
  const win = cy.state("window");
  if (auth) {
    win.localStorage.setItem("__auth", JSON.stringify(auth));
  }
}

export function tenantFromBasicAuth(auth: { user: string }) {
  if (!auth || !_.isObjectLike(auth) || !auth.user) return undefined;

  const components = auth.user.split("/");
  if (!components || components.length < 2) return undefined;

  return components[0];
}

function authWithTenant(options: C8yAuthOptions) {
  const tenant = Cypress.env(`C8Y_TENANT`);
  if (tenant && !options.tenant) {
    _.extend(options, { tenant });
  }
  return options;
}

export function getSystemVersionFromEnv(): string | undefined {
  let result = toSemverVersion(
    Cypress.env(`C8Y_SYSTEM_VERSION`) || Cypress.env(`C8Y_VERSION`)
  );
  if (
    result == null &&
    Cypress.c8ypact?.isEnabled() === true &&
    Cypress.c8ypact.mode() === "mock"
  ) {
    const pactVersion = Cypress.c8ypact.current?.info.version?.system;
    if (pactVersion) {
      result = toSemverVersion(pactVersion);
    }
  }
  return result;
}

export function getShellVersionFromEnv(): string | undefined {
  return Cypress.env(`C8Y_SHELL_VERSION`);
}

/**
 * Tries to get the base URL from environment variables. The following
 * environment variables are checked in order:
 * - C8Y_BASEURL
 * - C8Y_BASE_URL
 *
 * @returns Base URL from environment variables.
 */
export function getBaseUrlFromEnv(): string | undefined {
  return (
    getEnvVar("C8Y_BASEURL") ||
    getEnvVar("C8Y_BASE_URL") ||
    Cypress.config().baseUrl ||
    undefined
  );
}

export function storeClient(client: C8yClient) {
  cy.state("c8yclient", client);
}

export function restoreClient() {
  return cy.state("c8yclient");
}

export function resetClient() {
  cy.state("c8yclient", undefined);
}

export function throwError(message: string): never {
  const newErr = new Error(message);
  // newErr.name = "CypressError";
  throw newErr;
}
