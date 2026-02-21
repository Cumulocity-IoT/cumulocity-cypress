import _ from "lodash";
import { C8yPact, C8yPactRecord } from "./c8ypact";
import * as setCookieParser from "set-cookie-parser";
import * as libCookie from "cookie";
import { toSensitiveObjectKeyPath } from "../util";

/**
 * Interface for a preprocessor to apply transformations to `C8yPact` records
 * before critical operations such as matching or saving. A preprocessor can be used to
 * unify records by removing or obfuscating sensitive data, picking only certain keys to keep,
 * or applying regex substitutions to values. Preprocessors operate in-place on the
 * given object, which can be a full `C8yPact`, an individual `C8yPactRecord`, or a
 * plain object such as `Cypress.Response`.
 *
 * The default implementation is `C8yDefaultPactPreprocessor`, which supports the
 * operations and key-path syntax described in `C8yPactPreprocessorOptions`.
 *
 * See {@link C8yDefaultPactPreprocessor} for default implementation.
 *
 */
export interface C8yPactPreprocessor {
  /**
   * Configuration options used by the preprocessor.
   */
  readonly options?: C8yPactPreprocessorOptions;
  /**
   * Applies the preprocessor options (rules) to the given object in-place.
   *
   * When `obj` is a `C8yPact` (i.e. contains a `records` array), all records
   * are processed individually. For a plain object, including `Cypress.Response`
   * or `C8yPactRecord`, the object itself is processed.
   *
   * Operations are applied in this sequence:
   * 1. **pick** — remove any keys not listed
   * 2. **obfuscate** — replace values with the obfuscation pattern
   * 3. **regexReplace** — apply regex substitutions
   * 4. **ignore** — delete values entirely
   *
   * @param obj Object to preprocess. Modified in place.
   * @param options Options that override the instance-level options for this
   *   single call.
   */
  apply: (
    obj: Partial<Cypress.Response<any> | C8yPactRecord | C8yPact>,
    options?: C8yPactPreprocessorOptions
  ) => void;
}

/**
 * Configuration options for `C8yPactPreprocessor`.
 *
 * All key-path strings support:
 * - Dot-separated segments: `response.body.password`
 * - Bracket / numeric-index notation: `response.body.items[0].token`
 * - Array fan-out: `response.body.users.password` (applied to every element)
 * - Recursive descent: `response.body..password` (any depth below `body`)
 *
 * Key resolution is case-insensitive when `ignoreCase` is `true` (default).
 */
export interface C8yPactPreprocessorOptions {
  /**
   * Key paths whose values should be replaced with `obfuscationPattern`.
   *
   * For `Authorization` headers whose value begins with `Bearer` or `Basic`,
   * the scheme prefix is kept and only the credential token is replaced, e.g.
   * `Bearer ****`.
   *
   * Cookie values can be targeted by appending the cookie name as an extra
   * segment: `request.headers.cookie.XSRF-TOKEN`.
   *
   * @example
   * obfuscate: [
   *   "response.body.password",
   *   "request.headers.authorization",
   *   "response.body.users.password",   // every user object
   *   "response.body..token",           // any depth
   * ]
   */
  obfuscate?: string[];
  /**
   * Key paths whose values should be deleted entirely from the record.
   *
   * Cookie values can be targeted by appending the cookie name as an extra
   * segment: `request.headers.cookie.XSRF-TOKEN`.
   *
   * @example
   * ignore: [
   *   "request.headers.accept-encoding",
   *   "response.headers.cache-control",
   *   "response.body..internalDebugField",  // any depth
   * ]
   */
  ignore?: string[];
  /**
   * Restricts which child keys are retained under the specified parent paths.
   * All other sibling keys are removed.
   *
   * Two forms are accepted:
   *
   * **Object form** — maps a parent key path to an array of child keys to keep:
   * ```ts
   * pick: {
   *   "response.headers": ["content-type", "location"],
   *   "request.headers":  ["authorization"]
   * }
   * ```
   *
   * **Array form** — keeps only the listed top-level keys of the record:
   * ```ts
   * pick: ["request", "response"]
   * ```
   */
  pick?: { [key: string]: string[] } | string[];
  /**
   * Applies one or more regex substitutions to the value at the given key path.
   *
   * The key is a key path (same syntax as `obfuscate` / `ignore`). The value
   * is a single regex string or an ordered array of regex strings applied in
   * sequence. Each regex string must use the format:
   * ```
   * /pattern/replacement/flags
   * ```
   * Capture groups (`$1`, `$2`, …) and all standard JS regex flags are
   * supported.
   *
   * @example
   * // Redact all but the first four characters of a token:
   * // key:   "response.body.token"
   * // value: "/^(.{4}).+$/$1----/"
   * //
   * // Normalise a date field, then strip milliseconds in sequence:
   * // key:   "response.body.timestamp"
   * // value: ["/T\\d{2}:\\d{2}:\\d{2}/THH:MM:SS/", "/\\.\\d+Z$/Z/"]
   */
  regexReplace?: {
    [key: string]: string | string[];
  };
  /**
   * Replacement string used by the `obfuscate` operation.
   * Defaults to `"****"`.
   */
  obfuscationPattern?: string;
  /**
   * When `true` (default), key segments are matched case-insensitively at
   * every level of the path. The actual casing of the key found in the object
   * is always used for mutations — the original structure is never changed.
   */
  ignoreCase?: boolean;
}

/*
 * Default options for `C8yPactPreprocessor`. Used when constructing an instance
 * without custom options, and as fallback for missing properties when applying
 * with partial options.
 */
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
    "response.body.users.password",
  ],
  obfuscationPattern: "****",
  ignoreCase: true,
};

/**
 * Preprocessor for `C8yPact` objects. A preprocessor is applied when a pact
 * record is **saved** (recording mode) and before it is applied (matched)
 * against any other record. This is used to unify records before they are
 * **matched**. A preprocessor transforms objects such as `Cypress.Response`,
 * `C8yPactRecord` or a full `C8yPact` in-place. It supports various operations
 * to remove or obfuscate sensitive data, or to pick only certain keys to keep.
 *
 * The default implementation is `C8yDefaultPactPreprocessor`.
 *
 * ### Supported operations (configured via `C8yPactPreprocessorOptions`)
 *
 * | Option | Effect |
 * |---|---|
 * | `ignore` | Removes the value at each key path |
 * | `obfuscate` | Replaces the value at each key path with `obfuscationPattern` |
 * | `pick` | Keeps only the specified child keys; removes all others |
 * | `regexReplace` | Applies one or more `/pattern/replacement/flags` expressions |
 *
 * ### Key-path syntax
 *
 * All key paths use dot-separated segments. Bracket notation and numeric array
 * indices are supported:
 * ```
 * response.body.password
 * response.body.items[0].token
 * response.body.items.0.token
 * ```
 * When a path segment resolves to an **array of objects** and the next segment
 * is *not* a numeric index, the operation fans out to every element:
 * ```
 * response.body.users.password   // applied to every object in `users`
 * ```
 *
 * ### Recursive-descent operator (`..`)
 *
 * Prefix a leaf key with `..` to match it at **any depth** below the optional
 * prefix path:
 * ```
 * ..password                     // `password` anywhere in the record
 * response.body..password        // `password` anywhere inside `body`
 * ```
 *
 * ### Case-insensitive matching
 *
 * When `ignoreCase` is `true` (the default), each path segment is resolved
 * without regard to capitalization. Mutations always use the actual key name
 * found in the object.
 *
 * ### Cookie / Set-Cookie shorthand
 *
 * Preprocessors automatically parse `Cookie` and `Set-Cookie` header strings and
 * apply obfuscation or ignoring to individual cookie values when the key path
 * is appended with the cookie name as an extra segment:
 *
 * ```
 * request.headers.cookie.XSRF-TOKEN
 * response.headers.set-cookie.authorization
 * ```
 *
 * ### Authorization-header obfuscation
 *
 * When obfuscating an `Authorization` header whose value starts with `Bearer`
 * or `Basic`, the scheme prefix is preserved and only the credential is
 * replaced:
 * ```
 * Bearer ********
 * Basic  ********
 * ```
 */
export class C8yDefaultPactPreprocessor implements C8yPactPreprocessor {
  static defaultObfuscationPattern =
    C8yPactPreprocessorDefaultOptions.obfuscationPattern;

  options?: C8yPactPreprocessorOptions;

  protected reservedKeys = ["id", "pact", "info", "records"];

  constructor(options?: C8yPactPreprocessorOptions) {
    this.options = options;
  }

  /** {@inheritDoc C8yPactPreprocessor.apply} */
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

      if (o?.regexReplace != null) {
        Object.entries(o.regexReplace).forEach(([key, value]) => {
          const patterns = Array.isArray(value) ? value : [value];
          this.applyRegexReplace(obj, key, patterns, ignoreCase);
        });
      }

      this.filterValidKeys(obj, o.obfuscate ?? []).forEach((key) => {
        this.obfuscateKey(obj, key, obfuscationPattern, ignoreCase);
      });

      this.filterValidKeys(obj, o.ignore ?? []).forEach((key) => {
        this.removeKey(obj, key, ignoreCase);
      });
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
      if (!_.isObjectLike(currentObj)) return;

      if (_.isArray(currentObj)) {
        // For arrays of objects, recurse into each element using the same path
        // so that array indices are not included in path matching.
        currentObj.forEach((item) => {
          if (_.isObjectLike(item)) {
            recursiveFilter(item, currentPath);
          }
        });
        return;
      }

      Object.keys(currentObj).forEach((key) => {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        if (!shouldKeep(fullPath)) {
          _.unset(currentObj, key);
        } else if (
          !keepPaths.map((k) => prepKey(k)).includes(prepKey(fullPath))
        ) {
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

  private removeKey(obj: any, key: string, ignoreCase?: boolean): void {
    const keyPath = key.split(".");
    if (this.hasKey(keyPath, "set-cookie")) {
      this.removeSetCookie(obj, keyPath, ignoreCase);
    } else if (this.hasKey(keyPath, "cookie")) {
      this.removeCookie(obj, keyPath, ignoreCase);
    } else {
      this.traverseKeyPath(obj, key, ignoreCase, (parent, k) =>
        _.unset(parent, k)
      );
    }
  }

  private removeSetCookie(
    obj: any,
    keyParts: string[],
    ignoreCase?: boolean
  ): void {
    const { name, keyPath, cookieHeader } = this.getCookieObject(
      obj,
      keyParts,
      ignoreCase
    );
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

  private removeCookie(
    obj: any,
    keyParts: string[],
    ignoreCase?: boolean
  ): void {
    const { name, keyPath, cookieHeader } = this.getCookieObject(
      obj,
      keyParts,
      ignoreCase
    );
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

  /**
   * Unified key-path traversal. Calls `fn(parent, resolvedKey)` on every
   * matching leaf. Handles recursive descent (`..leafKey` / `prefix..leafKey`)
   * and regular dot-/bracket-separated paths including array indices.
   */
  private traverseKeyPath(
    obj: any,
    key: string,
    ignoreCase: boolean | undefined,
    fn: (parent: any, key: string) => void
  ): void {
    if (key.includes("..")) {
      const sep = key.indexOf("..");
      const prefix = key.slice(0, sep);
      const leafKey = key.slice(sep + 2);
      if (!leafKey) return;
      let target: any = obj;
      if (prefix) {
        const resolvedPrefix =
          ignoreCase === true
            ? (toSensitiveObjectKeyPath(obj, prefix) ?? prefix)
            : prefix;
        target = _.get(obj, resolvedPrefix);
        if (target == null) return;
      }
      this.applyRecursive(target, leafKey, fn, ignoreCase);
      return;
    }

    const walk = (currentObj: any, remainingParts: string[]): void => {
      if (!currentObj || remainingParts.length === 0) return;
      const [rawKey, ...restKeys] = remainingParts;
      const currentKey =
        ignoreCase === true
          ? (toSensitiveObjectKeyPath(currentObj, rawKey) ?? rawKey)
          : rawKey;
      const target = _.get(currentObj, currentKey);
      if (restKeys.length === 0) {
        fn(currentObj, currentKey);
      } else if (_.isArray(target)) {
        const [peekKey] = restKeys;
        if (peekKey != null && !isNaN(parseInt(peekKey))) {
          walk(target, restKeys); // numeric: consume the index on next iteration
        } else {
          target.forEach((item) => {
            if (item != null) walk(item, restKeys);
          });
        }
      } else {
        walk(target, restKeys);
      }
    };
    walk(obj, key.split("."));
  }

  /**
   * Applies a list of regex-replace patterns to the value at the given key path.
   */
  private applyRegexReplace(
    obj: any,
    key: string,
    patterns: string[],
    ignoreCase?: boolean
  ): void {
    this.traverseKeyPath(obj, key, ignoreCase, (parent, k) => {
      const v = parent[k];
      if (v == null) return;
      let result = v;
      for (const pattern of patterns) {
        try {
          result = performRegexReplace(result, parseRegexReplace(pattern));
        } catch {
          // ignore invalid regex
        }
      }
      parent[k] = result;
    });
  }

  /**
   * Recursively walks `obj` (depth-first) and calls `fn` on every node whose
   * key matches `leafKey` (case-sensitively, or case-insensitively when
   * `ignoreCase` is true). Traverses into arrays and plain objects.
   */
  private applyRecursive(
    obj: any,
    leafKey: string,
    fn: (parent: any, key: string) => void,
    ignoreCase?: boolean
  ): void {
    if (!_.isObjectLike(obj)) return;
    if (_.isArray(obj)) {
      obj.forEach((item) => this.applyRecursive(item, leafKey, fn, ignoreCase));
      return;
    }
    // Apply at this level if a matching key exists
    const matchingKey = Object.keys(obj).find((k) =>
      ignoreCase === true
        ? k.toLowerCase() === leafKey.toLowerCase()
        : k === leafKey
    );
    if (matchingKey !== undefined) {
      fn(obj, matchingKey);
    }
    // Recurse into all child values
    Object.values(obj).forEach((value) =>
      this.applyRecursive(value, leafKey, fn, ignoreCase)
    );
  }

  private obfuscateKey(
    obj: any,
    key: string,
    pattern?: string,
    ignoreCase?: boolean
  ): void {
    const p = pattern ?? C8yDefaultPactPreprocessor.defaultObfuscationPattern;
    const keyParts = key.split(".");

    if (this.hasKey(keyParts, "set-cookie")) {
      this.obfuscateSetCookie(obj, keyParts, p, ignoreCase);
    } else if (this.hasKey(keyParts, "cookie")) {
      this.obfuscateCookie(obj, keyParts, p, ignoreCase);
    } else {
      const isAuthorizationKey = this.hasKey(keyParts, "authorization");
      this.traverseKeyPath(obj, key, ignoreCase, (parent, k) => {
        const value = parent[k];
        if (value == null) return;
        const isAuthKey =
          isAuthorizationKey ||
          (ignoreCase === true
            ? k.toLowerCase() === "authorization"
            : k === "authorization");
        const authMatch =
          isAuthKey && _.isString(value)
            ? value.match(/^(Bearer|Basic)\s+(.+)$/i)
            : null;
        parent[k] =
          authMatch && authMatch[2]?.trim() ? `${authMatch[1]} ${p}` : p;
      });
    }
  }

  private obfuscateSetCookie(
    obj: any,
    keyParts: string[],
    obfuscationPattern: string,
    ignoreCase?: boolean
  ): void {
    const { name, keyPath, cookieHeader } = this.getCookieObject(
      obj,
      keyParts,
      ignoreCase
    );
    if (!cookieHeader) return;

    const cookies =
      setCookieParser.parse(cookieHeader, { decodeValues: false }) ?? [];

    if (cookies.length) {
      const fixedCookies = cookies.reduce((acc, cookie) => {
        const n = name?.toLowerCase();
        const shouldObfuscate = !n || (n && n === cookie.name?.toLowerCase());
        const cookieValue = shouldObfuscate
          ? (obfuscationPattern ?? "")
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
    obfuscationPattern: string,
    ignoreCase?: boolean
  ): void {
    const { name, keyPath, cookieHeader } = this.getCookieObject(
      obj,
      keyParts,
      ignoreCase
    );
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
    keyParts: string[],
    ignoreCase?: boolean
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

    // Resolve case-sensitive path only if ignoreCase is enabled
    const keyPath =
      ignoreCase === true
        ? (toSensitiveObjectKeyPath(obj, keyParts) ?? keyParts.join("."))
        : keyParts.join(".");
    const cookieHeader = _.get(obj, keyPath);
    return { name, keyPath, cookieHeader };
  }
}

export function parseRegexReplace(input: string): {
  pattern: RegExp;
  replacement: string;
} {
  if (!input || !_.isString(input)) {
    throw new Error(
      "Invalid replacement expression input. Regex must be a string."
    );
  }

  // Match a regex pattern with replacement in format /pattern/replacement/flags
  const match = input.match(/^\/(.+?)(?<!\\)\/(.*?)(?<!\\)\/([gimsuy]*)$/);

  if (!match) {
    throw new Error(`Invalid replacement regular expression: ${input}`);
  }

  const [, patternStr, replacement, flags] = match;

  return {
    pattern: new RegExp(patternStr, flags),
    replacement: replacement,
  };
}

export function performRegexReplace(
  input: string | any,
  regexes:
    | {
        pattern: RegExp;
        replacement: string;
      }[]
    | {
        pattern: RegExp;
        replacement: string;
      }
): string | any {
  if (!input) return input;

  // Convert single regex to array for uniform handling
  const regexArray = Array.isArray(regexes) ? regexes : [regexes];
  if (regexArray.length === 0) return input;

  // Direct string replacement
  if (_.isString(input)) {
    return regexArray.reduce(
      (result, regex) => result.replace(regex.pattern, regex.replacement),
      input
    );
  }

  // Object/array traversal - do a single traversal applying all regexes
  if (_.isObjectLike(input)) {
    return _.cloneDeepWith(input, (value) => {
      if (_.isString(value)) {
        // Apply all regex replacements to the string value
        return regexArray.reduce(
          (result, regex) => result.replace(regex.pattern, regex.replacement),
          value
        );
      }
      return undefined; // Return undefined for default cloning
    });
  }

  // Return unchanged for other types
  return input;
}
