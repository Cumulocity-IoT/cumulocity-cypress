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
  /**
   * Whether to ignore case when matching keys.
   */
  ignoreCase?: boolean;
}

/**
 * Default implementation of C8yPactPreprocessor. Preprocessor for C8yPact objects
 * that can be used to obfuscate or remove sensitive data from the pact objects.
 * Use C8ypactPreprocessorOptions to configure the preprocessor. 
 *
 * Removes cookies and set-cookie headers by appending the key to the `cookie` or `set-cookie`
 * key as for example `headers.cookie.authorization` or `headers.set-cookie.authorization`.
 */
export class C8yDefaultPactPreprocessor implements C8yPactPreprocessor {
  static defaultObfuscationPattern = "********";

  options?: C8yPactPreprocessorOptions;

  protected reservedKeys = ["id", "pact", "info", "records"];

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

    const o = this.resolveOptions(options);
    const ignoreCase = o.ignoreCase;
    const obfuscationPattern =
      o.obfuscationPattern ??
      C8yDefaultPactPreprocessor.defaultObfuscationPattern;

    const mapSensitiveKeys = (keys: string[]) =>
      keys.map((k) => (ignoreCase === true ? toSensitivePath(obj, k) ?? k : k));

    const keysToObfuscate = mapSensitiveKeys(o.obfuscate ?? []);
    const keysToRemove = mapSensitiveKeys(o.ignore ?? []);

    objs.forEach((obj) => {
      this.handleObfuscation(obj, keysToObfuscate, obfuscationPattern);
      this.handleRemoval(obj, keysToRemove);
    });
  }

  private handleObfuscation(
    obj: any,
    keysToObfuscate: string[],
    obfuscationPattern: string
  ): void {
    const validKeys = this.filterValidKeys(obj, keysToObfuscate);
    validKeys.forEach((key) => {
      this.obfuscateKey(obj, key, obfuscationPattern);
    });
  }

  private handleRemoval(obj: any, keysToRemove: string[]): void {
    const validKeys = this.filterValidKeys(obj, keysToRemove);
    validKeys.forEach((key) => {
      this.removeKey(obj, key);
    });
  }

  private removeKey(obj: any, key: string): void {
    const keyPath = key.split(".");

    if (this.hasKey(keyPath, "set-cookie")) {
      this.removeSetCookie(obj, keyPath);
    } else if (this.hasKey(keyPath, "cookie")) {
      this.removeCookie(obj, keyPath);
    } else {
      _.unset(obj, key);
    }
  }

  private removeSetCookie(obj: any, keyParts: string[]): void {
    const { name, keyPath, cookieHeader } = this.getCookieObject(obj, keyParts);
    if (!cookieHeader) return;

    if (!name) {
      _.unset(obj, keyPath);
      return;
    }

    const cookies =
      setCookieParser.parse(cookieHeader, { decodeValues: false }) ?? [];
    if (cookies.length) {
      const filteredCookies = cookies
        .filter((cookie) => cookie.name.toLowerCase() !== name.toLowerCase())
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
    const { name, keyPath, cookieHeader } = this.getCookieObject(obj, keyParts);
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
      const v = remainingCookies
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
      _.set(obj, keyPath, v);
    }
  }

  private filterValidKeys(obj: any, keys: string[]): string[] {
    return _.without(keys, ...this.reservedKeys);
  }

  private obfuscateKey(obj: any, key: string, pattern: string): void {
    const keyParts = key.split(".");
    if (this.hasKey(keyParts, "set-cookie")) {
      this.obfuscateSetCookie(obj, keyParts, pattern);
    } else if (this.hasKey(keyParts, "cookie")) {
      this.obfuscateCookie(obj, keyParts, pattern);
    } else {
      if (_.get(obj, key) == null) return;
      _.set(obj, key, pattern);
    }
  }

  private obfuscateSetCookie(
    obj: any,
    keyParts: string[],
    obfuscationPattern: string
  ): void {
    const { name, keyPath, cookieHeader } = this.getCookieObject(obj, keyParts);
    if (!cookieHeader) return;

    const cookies =
      setCookieParser.parse(cookieHeader, { decodeValues: false }) ?? [];

    if (cookies.length) {
      const fixedCookies = cookies.reduce((acc, cookie) => {
        const n = name?.toLowerCase();
        const shouldObfuscate = !n || (n && n === cookie.name?.toLowerCase());
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
    const { name, keyPath, cookieHeader } = this.getCookieObject(obj, keyParts);
    if (!cookieHeader) return;

    const cookies = libCookie.parse(cookieHeader);

    Object.keys(cookies).forEach((cookieName) => {
      if (name != null && cookieName.toLowerCase() !== name.toLowerCase())
        return;
      cookies[cookieName] = obfuscationPattern;
    });

    const result = Object.entries(cookies)
      .map(([n, v]) => `${n}=${v}`)
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
      ignoreCase: true,
    });
  }

  private hasKey(keyPath: string | string[], key: string): boolean {
    return (
      (_.isArray(keyPath) ? keyPath : keyPath.split(".")).filter(
        (k) => k.toLowerCase() === key.toLowerCase()
      ).length > 0
    );
  }

  private getCookieObject(
    obj: any,
    keyParts: string[]
  ): {
    name: string | undefined;
    keyPath: string;
    cookieHeader: string | undefined;
  } {
    let name: string | undefined = undefined;
    const l = _.last(keyParts)?.toLowerCase();
    if (l !== "cookie" && l !== "set-cookie") {
      name = _.last(keyParts);
      keyParts = keyParts.slice(0, -1);
    }

    const keyPath = keyParts.join(".");
    const cookieHeader = _.get(obj, keyPath);
    return { name, keyPath, cookieHeader };
  }
}

/**
 * Gets the case-sensitive path for a given case-insensitive path.
 *
 * @param obj The object to query
 * @param path The case-insensitive path to find
 * @returns The actual case-sensitive path if found, undefined otherwise
 */
export function toSensitivePath(
  obj: any,
  path: string | string[]
): string | undefined {
  if (!obj) return undefined;

  const keys = _.isArray(path) ? path : path.split(".");
  let current = obj;
  const actualPath: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (current === null || current === undefined) {
      return undefined;
    }

    if (_.isArray(current)) {
      const index = parseInt(key);
      if (!isNaN(index)) {
        if (index >= 0 && index < current.length) {
          current = current[index];
          actualPath.push(key);
          continue;
        }
      }
      actualPath.push(...keys.slice(i));
      return actualPath.join(".");
    }

    // Handle object case with case-insensitive matching
    if (_.isObjectLike(current)) {
      const matchingKey = Object.keys(current).find(
        (k) => k.toLowerCase() === key.toLowerCase()
      );

      if (matchingKey !== undefined) {
        current = current[matchingKey];
        actualPath.push(matchingKey);
      } else {
        actualPath.push(...keys.slice(i));
        break;
      }
    } else {
      actualPath.push(...keys.slice(i));
      break;
    }
  }

  return actualPath.join(".");
}
