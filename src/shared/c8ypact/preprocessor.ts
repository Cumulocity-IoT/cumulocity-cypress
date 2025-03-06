import _ from "lodash";
import { C8yPact, C8yPactRecord } from "./c8ypact";
import * as setCookieParser from "set-cookie-parser";
import * as libCookie from "cookie";

/**
 * Preprocessor for C8yPact objects. Use C8yPactPreprocessor to preprocess any
 * Cypress.Response, C8yPactRecord or C8yPact. The preprocessor could be used to
 * obfuscate or remove sensitive data from the pact objects. It is called on save
 * and load of the pact objects.
 */
export interface C8yPactPreprocessor {
  /**
   * Configuration options used by the preprocessor.
   */
  readonly options?: C8yPactPreprocessorOptions;
  /**
   * Applies the preprocessor to the given object.
   *
   * @param obj Object to preprocess.
   * @param options Preprocessor options.
   */
  apply: (
    obj: Partial<Cypress.Response<any> | C8yPactRecord | C8yPact>,
    options?: C8yPactPreprocessorOptions
  ) => void;
}

/**
 * Configuration options for the C8yPactPreprocessor.
 */
export interface C8yPactPreprocessorOptions {
  /**
   * Key paths to obfuscate.
   *
   * @example
   * response.body.password
   */
  obfuscate?: string[];
  /**
   * Key paths to remove.
   *
   * @example
   * request.headers.Authorization
   */
  ignore?: string[];
  /**
   * Obfuscation pattern to use. Default is ********.
   */
  obfuscationPattern?: string;
}

/**
 * Default implementation of C8yPactPreprocessor. Preprocessor for C8yPact objects
 * that can be used to obfuscate or remove sensitive data from the pact objects.
 * Use C8ypactPreprocessorOptions to configure the preprocessor. Also uses environment
 * variables C8Y_PACT_PREPROCESSOR_OBFUSCATE and C8Y_PACT_PREPROCESSOR_IGNORE.
 * 
 * Removes cookies and set-cookie headers by appending the key to the `cookie` or `set-cookie` 
 * key as for example `headers.cookie.authorization` or `headers.set-cookie.authorization`.
 */
export class C8yDefaultPactPreprocessor implements C8yPactPreprocessor {
  static defaultObfuscationPattern = "********";

  options?: C8yPactPreprocessorOptions;

  constructor(options?: C8yPactPreprocessorOptions) {
    this.options = this.resolveOptions(options);
  }

  apply(
    obj: Partial<Cypress.Response<any> | C8yPactRecord | C8yPact>,
    options?: C8yPactPreprocessorOptions
  ): void {
    if (!obj || !_.isObjectLike(obj)) return;
    const objs = "records" in obj ? _.get(obj, "records") : [obj];
    if (!_.isArray(objs)) return;

    const reservedKeys = ["id", "pact", "info", "records"];
    const o = this.resolveOptions(options);
    const keysToObfuscate = o.obfuscate || [];
    const keysToRemove = o.ignore || [];
    const obfuscationPattern =
      o.obfuscationPattern ??
      C8yDefaultPactPreprocessor.defaultObfuscationPattern;

    objs.forEach((obj) => {
      this.handleObfuscation(
        obj,
        keysToObfuscate,
        reservedKeys,
        obfuscationPattern
      );
      this.handleRemoval(obj, keysToRemove, reservedKeys);
    });
  }

  private handleObfuscation(
    obj: any,
    keysToObfuscate: string[],
    reservedKeys: string[],
    obfuscationPattern: string
  ): void {
    const validKeys = this.filterValidKeys(obj, keysToObfuscate, reservedKeys);
    validKeys.forEach((key) => {
      this.obfuscateKey(obj, key, obfuscationPattern);
    });
  }

  private handleRemoval(
    obj: any,
    keysToRemove: string[],
    reservedKeys: string[]
  ): void {
    const validKeys = this.filterValidKeys(obj, keysToRemove, reservedKeys);
    validKeys.forEach((key) => {
      this.removeKey(obj, key);
    });
  }

  private removeKey(obj: any, key: string): void {
    const keyParts = key.split(".");

    if (keyParts.includes("set-cookie")) {
      this.removeSetCookie(obj, keyParts);
    } else if (keyParts.includes("cookie")) {
      this.removeCookie(obj, keyParts);
    } else {
      _.unset(obj, key);
    }
  }

  private removeSetCookie(obj: any, keyParts: string[]): void {
    let name: string | undefined = undefined;
    if (_.last(keyParts)?.toLowerCase() !== "set-cookie") {
      name = _.last(keyParts);
      keyParts = keyParts.slice(0, -1);
    }

    const keyPath = keyParts.join(".");
    const setCookieHeader = _.get(obj, keyPath);

    // If no specific cookie name is provided, remove the entire header
    if (!name) {
      _.unset(obj, keyPath);
      return;
    }

    // Otherwise filter out the specified cookie
    const cookies =
      setCookieParser.parse(setCookieHeader, { decodeValues: false }) ?? [];
    if (cookies.length) {
      const filteredCookies = cookies
        .filter((cookie) => cookie.name !== name)
        .map((cookie) =>
          libCookie.serialize(
            cookie.name,
            cookie.value,
            cookie as libCookie.SerializeOptions
          )
        );

      if (filteredCookies.length === 0) {
        _.unset(obj, keyPath);
      } else {
        _.set(obj, keyPath, filteredCookies);
      }
    }
  }

  private removeCookie(obj: any, keyParts: string[]): void {
    let name: string | undefined = undefined;
    if (_.last(keyParts)?.toLowerCase() !== "cookie") {
      name = _.last(keyParts);
      keyParts = keyParts.slice(0, -1);
    }

    const keyPath = keyParts.join(".");
    const cookieHeader = _.get(obj, keyPath);
    if (!cookieHeader) return;

    if (!name) {
      _.unset(obj, keyPath);
      return;
    }

    const cookies = libCookie.parse(cookieHeader);
    delete cookies[name];

    const remainingCookies = Object.entries(cookies);
    if (remainingCookies.length === 0) {
      _.unset(obj, keyPath);
    } else {
      _.set(
        obj,
        keyPath,
        remainingCookies.map(([name, value]) => `${name}=${value}`).join("; ")
      );
    }
  }

  private filterValidKeys(
    obj: any,
    keys: string[],
    reservedKeys: string[]
  ): string[] {
    const notExistingKeys = keys.filter((key) => {
      return (
        _.get(obj, key) == null &&
        !key.includes(".set-cookie") &&
        !key.includes(".cookie")
      );
    });
    return _.without(keys, ...reservedKeys, ...notExistingKeys);
  }

  private obfuscateKey(
    obj: any,
    key: string,
    obfuscationPattern: string
  ): void {
    const keyParts = key.split(".");

    if (keyParts.includes("set-cookie")) {
      this.obfuscateSetCookie(obj, keyParts, obfuscationPattern);
    } else if (keyParts.includes("cookie")) {
      this.obfuscateCookie(obj, keyParts, obfuscationPattern);
    } else {
      _.set(obj, key, obfuscationPattern);
    }
  }

  private obfuscateSetCookie(
    obj: any,
    keyParts: string[],
    obfuscationPattern: string
  ): void {
    let name: string | undefined = undefined;
    if (_.last(keyParts)?.toLowerCase() !== "set-cookie") {
      name = _.last(keyParts);
      keyParts = keyParts.slice(0, -1);
    }

    const keyPath = keyParts.join(".");
    const setCookieHeader = _.get(obj, keyPath);
    const cookies =
      setCookieParser.parse(setCookieHeader, { decodeValues: false }) ?? [];

    if (cookies.length) {
      const fixedCookies = cookies.reduce((acc, cookie) => {
        const shouldObfuscate = !name || (name && name === cookie.name);
        const cookieValue = shouldObfuscate
          ? obfuscationPattern ?? ""
          : cookie.value;

        acc.push(
          libCookie.serialize(
            cookie.name,
            cookieValue,
            cookie as libCookie.SerializeOptions
          )
        );
        return acc;
      }, [] as string[]);

      _.set(obj, keyPath, fixedCookies);
    }
  }

  private obfuscateCookie(
    obj: any,
    keyParts: string[],
    obfuscationPattern: string
  ): void {
    let name: string | undefined = undefined;
    if (_.last(keyParts)?.toLowerCase() !== "cookie") {
      name = _.last(keyParts);
      keyParts = keyParts.slice(0, -1);
    }

    const keyPath = keyParts.join(".");
    const cookieHeader = _.get(obj, keyPath);
    if (!cookieHeader) return;

    const cookies = libCookie.parse(cookieHeader);

    if (name != null) {
      if (cookies[name] != null) {
        cookies[name] = obfuscationPattern;
      }
    } else {
      Object.keys(cookies).forEach((cookieName) => {
        cookies[cookieName] = obfuscationPattern;
      });
    }

    const result = Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
    _.set(obj, keyPath, result);
  }

  protected resolveOptions(
    options?: Partial<C8yPactPreprocessorOptions>
  ): C8yPactPreprocessorOptions {
    return _.defaults(options, this.options, {
      ignore: [],
      obfuscate: [],
      obfuscationPattern: C8yDefaultPactPreprocessor.defaultObfuscationPattern,
    });
  }
}
