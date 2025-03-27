import _ from "lodash";
import { C8yPact, C8yPactRecord } from "./c8ypact";
import * as setCookieParser from "set-cookie-parser";
import * as libCookie from "cookie";
import { toSensitiveObjectKeyPath } from "../util";

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
   * Key paths to pick. All other keys (children) of the object will
   * be removed.
   *
   * @example
   * response.headers: ["content-type"]
   * ["request.headers", "response.headers"]
   */
  pick?: { [key: string]: string[] } | string[];
  /**
   * Obfuscation pattern to use. Default is ********.
   */
  obfuscationPattern?: string;
  /**
   * Whether to ignore case when matching keys.
   */
  ignoreCase?: boolean;
}

export const C8yPactPreprocessorDefaultOptions = {
  ignore: [
    "request.headers.accept-encoding",
    "response.headers.cache-control",
    "response.headers.content-length",
    "response.headers.content-encoding",
    "response.headers.transfer-encoding",
    "response.headers.keep-alive",
  ],
  obfuscate: [
    "request.headers.cookie.authorization",
    "request.headers.cookie.XSRF-TOKEN",
    "request.headers.authorization",
    "request.headers.X-XSRF-TOKEN",
    "response.headers.set-cookie.authorization",
    "response.headers.set-cookie.XSRF-TOKEN",
    "response.body.password",
  ],
  obfuscationPattern: "****",
  ignoreCase: true,
};

/**
 * Default implementation of C8yPactPreprocessor. Preprocessor for C8yPact objects
 * that can be used to obfuscate or remove sensitive data from the pact objects.
 * Use C8ypactPreprocessorOptions to configure the preprocessor.
 *
 * Removes cookies and set-cookie headers by appending the key to the `cookie` or `set-cookie`
 * key as for example `headers.cookie.authorization` or `headers.set-cookie.authorization`.
 */
export class C8yDefaultPactPreprocessor implements C8yPactPreprocessor {
  static defaultObfuscationPattern =
    C8yPactPreprocessorDefaultOptions.obfuscationPattern;

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
    const obfuscationPattern = o.obfuscationPattern;

    const mapSensitiveKeys = (mapObject: any, keys: string[]) =>
      keys.map((k) =>
        ignoreCase === true ? toSensitiveObjectKeyPath(mapObject, k) ?? k : k
      );

    objs.forEach((obj) => {
      if (o?.pick != null) {
        const keepPaths: string[] = [];
        if (_.isPlainObject(o.pick)) {
          Object.entries(o.pick ?? {}).forEach(([parentKey, childKeys]) => {
            if (_.isEmpty(childKeys)) keepPaths.push(parentKey);
            childKeys.forEach((childKey: string) => {
              keepPaths.push(`${parentKey}.${childKey}`);
            });
          });
          this.filterObjectByKeepPaths(obj, keepPaths, ignoreCase);
        } else if (_.isArray(o.pick)) {
          this.applyKeepArray(obj, o.pick);
        }
      }

      const keysToObfuscate = mapSensitiveKeys(obj, o.obfuscate ?? []);
      const keysToRemove = mapSensitiveKeys(obj, o.ignore ?? []);
      this.handleObfuscation(obj, keysToObfuscate, obfuscationPattern);
      this.handleRemoval(obj, keysToRemove);
    });
  }

  private filterObjectByKeepPaths(
    obj: any,
    keepPaths: string[],
    ignoreCase: boolean = false
  ): void {
    const prepKey = (key: string): string =>
      key != null && ignoreCase === true ? key.toLowerCase() : key;

    const shouldKeep = (keyPath: string): boolean => {
      return keepPaths
        .map((k) => prepKey(k))
        .some(
          (keepPath) =>
            prepKey(keyPath) === keepPath ||
            keepPath?.startsWith(`${prepKey(keyPath)}.`)
        );
    };

    const recursiveFilter = (currentObj: any, currentPath: string): void => {
      if (!_.isObject(currentObj)) return;

      Object.keys(currentObj).forEach((key) => {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        if (!shouldKeep(fullPath)) {
          _.unset(obj, fullPath);
        } else if (!keepPaths.includes(fullPath)) {
          recursiveFilter(_.get(currentObj, key), fullPath);
        }
      });
    };

    recursiveFilter(obj, "");
  }

  private applyKeepArray(obj: any, keep: string[]): void {
    if (keep == null || _.isEmpty(keep)) return;
    if (_.isObjectLike(obj)) {
      const keysToRemove = Object.keys(obj).filter(
        (childKey) => !keep.includes(childKey.toLowerCase())
      );
      keysToRemove.forEach((childKey) => {
        _.unset(obj, childKey);
      });
    }
  }

  private handleObfuscation(
    obj: any,
    keysToObfuscate: string[],
    obfuscationPattern?: string
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

  private obfuscateKey(obj: any, key: string, pattern?: string): void {
    const keyParts = key.split(".");
    const p = pattern ?? C8yDefaultPactPreprocessor.defaultObfuscationPattern;
    if (this.hasKey(keyParts, "set-cookie")) {
      this.obfuscateSetCookie(obj, keyParts, p);
    } else if (this.hasKey(keyParts, "cookie")) {
      this.obfuscateCookie(obj, keyParts, p);
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
    return _.defaults(options, this.options, C8yPactPreprocessorDefaultOptions);
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
