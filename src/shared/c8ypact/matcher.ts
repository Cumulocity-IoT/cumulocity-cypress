import _ from "lodash";
import * as datefns from "date-fns";
import { C8ySchemaMatcher } from "./schema";
import { get_i } from "../util";

/**
 * Matcher for C8yPactRecord objects. Use C8yPactMatcher to match any two
 * records. Depending on the matcher implementation an Error will be thrown
 * or boolean is returned.
 */
export interface C8yPactMatcher {
  /**
   * Matches objectToMatch against objectPact. Returns false if objectToMatch
   * does not match objectPact or throws an error with details on failing match.
   *
   * @param obj1 Object to match.
   * @param obj2 Pact to match obj1 against.
   * @param {C8yPactMatcherOptions} options The C8yPactMatcherOptions to use for matching.
   */
  match: (
    objectToMatch: any,
    objectPact: any,
    options?: C8yPactMatcherOptions
  ) => boolean;
}

/**
 * Error thrown when a C8yPactMatcher fails to match two objects.
 * Contains the actual and expected values, the key that failed to match and
 * the key path of the property that failed to match.
 * The key path is a string representation of the path to the property that failed to match.
 * For example: "body > id" for a property "id" in the "body" object.
 * This error is used to provide detailed information about the match failure.
 */
export class C8yPactMatchError extends Error {
  actual: any;
  expected: any;
  key?: string;
  keyPath?: string;
  schema?: any;

  constructor(
    message: string,
    options: {
      actual: any;
      expected: any;
      key?: string;
      keyPath?: string;
      schema?: any;
    }
  ) {
    super(message);
    this.name = "C8yPactMatchError";
    this.actual = options.actual;
    this.expected = options.expected;
    this.key = options.key;
    this.keyPath = options.keyPath;
    this.schema = options.schema;
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, C8yPactMatchError);
    }
  }
}

export interface C8yPactMatcherOptions {
  strictMatching?: boolean;
  matchSchemaAndObject?: boolean;
  loggerProps?: { [key: string]: any };
  schemaMatcher?: C8ySchemaMatcher;
  parents?: (string | number)[];
  ignoreCase?: boolean;
  ignorePrimitiveArrayOrder?: boolean;
}

/**
 * Default implementation of C8yPactMatcher to match C8yPactRecord objects. Pacts
 * are matched by comparing the properties of the objects using property matchers.
 * If no property matcher is configured for a property, the property will be matched
 * by equality. Disable Cypress.c8ypact.config.strictMatching to ignore properties that are
 * missing in matched objects. In case objects do not match an C8yPactError is thrown.
 */
export class C8yDefaultPactMatcher implements C8yPactMatcher {
  propertyMatchers: { [key: string]: C8yPactMatcher } = {};

  static schemaMatcher: C8ySchemaMatcher;
  static matchSchemaAndObject = false;
  static options?: C8yPactMatcherOptions;

  options?: C8yPactMatcherOptions;

  /**
   * Standard JSON Schema keywords that start with $ but are not schema matcher keys.
   * These should be treated as regular object properties.
   * @see https://json-schema.org/understanding-json-schema/reference
   */
  private static readonly JSON_SCHEMA_KEYWORDS = new Set([
    "$schema",
    "$id",
    "$ref",
    "$comment",
    "$defs",
    "$vocabulary",
    "$anchor",
    "$dynamicRef",
    "$dynamicAnchor",
    "$recursiveRef",
    "$recursiveAnchor",
  ]);

  constructor(
    propertyMatchers: { [key: string]: C8yPactMatcher } = {
      body: new C8yPactBodyMatcher(),
      requestBody: new C8yPactBodyMatcher(),
      duration: new C8yNumberMatcher(),
      date: new C8yIgnoreMatcher(),
      Authorization: new C8yIgnoreMatcher(),
      auth: new C8yIgnoreMatcher(),
      options: new C8yIgnoreMatcher(),
      createdObject: new C8yIgnoreMatcher(),
      location: new C8yIgnoreMatcher(),
      url: new C8yIgnoreMatcher(),
      "X-XSRF-TOKEN": new C8yIgnoreMatcher(),
      lastMessage: new C8yISODateStringMatcher(),
    },
    options?: C8yPactMatcherOptions
  ) {
    this.propertyMatchers = propertyMatchers;
    this.options = options;
  }

  match(obj1: any, obj2: any, options?: C8yPactMatcherOptions): boolean {
    if (obj1 === obj2) return true;

    options = _.defaults(
      {},
      options,
      this.options,
      C8yDefaultPactMatcher.options
    );

    const parents = options?.parents ?? [];
    const strictMatching = options?.strictMatching ?? false;
    const ignorePrimitiveArrayOrder =
      options?.ignorePrimitiveArrayOrder ?? true;
    const matchSchemaAndObject =
      options?.matchSchemaAndObject ??
      C8yDefaultPactMatcher.matchSchemaAndObject;

    const schemaMatcher =
      options?.schemaMatcher || C8yDefaultPactMatcher.schemaMatcher;

    const addLoggerProps = (props: any, message?: string, key?: string) => {
      if (options?.loggerProps) {
        options.loggerProps.error = message;
        options.loggerProps.key = key;
        options.loggerProps.keypath = keyPath(key);
        options.loggerProps.objects =
          key && _.isPlainObject(obj1) && _.isPlainObject(obj2)
            ? [_.pick(obj1, [key]), _.pick(obj2, [key])]
            : [obj1, obj2];
      }
    };

    const throwPactError = (message: string, key?: string) => {
      const newErr = new C8yPactMatchError(
        `Pact validation failed! ${message}`,
        {
          actual: obj1,
          expected: obj2,
          ...(key != null ? { key, keyPath: keyPath(key) } : {}),
        }
      );

      addLoggerProps(options?.loggerProps, newErr.message, key);
      throw newErr;
    };

    const throwSchemaError = (
      message: string,
      key?: string,
      schema?: any,
      value?: any
    ) => {
      const newErr = new C8yPactMatchError(
        `Pact validation failed! ${message}`,
        {
          actual: value ?? obj1,
          expected: schema ?? obj2,
          key,
          keyPath: keyPath(key),
          schema: schema,
        }
      );

      addLoggerProps(options?.loggerProps, newErr.message, key);
      throw newErr;
    };

    const keyPath = (k?: string | (string | number)[]) => {
      if (_.isArray(k)) {
        const segments = k.map((segment) => segment.toString());
        return segments.join(" > ");
      }
      return `${[...parents, ...(k ? [k] : [])].join(" > ")}`;
    };

    const isArrayOfPrimitivesOrNull = (value: any) => {
      if (!_.isArray(value)) {
        return false;
      }
      const primitiveTypes = ["undefined", "boolean", "number", "string"];
      return (
        value.filter((p) => primitiveTypes.includes(typeof p) || p === null)
          .length === value.length
      );
    };

    const matchArraysOfPrimitives = (
      value: any[],
      pact: any[],
      parents: (string | number)[]
    ) => {
      if (value.length !== pact.length) {
        throwPactError(
          `Arrays with key "${keyPath(parents)}" have different lengths.`,
          keyPath(parents)
        );
      }
      const diff: number[] = [];
      const sortedValue = ignorePrimitiveArrayOrder
        ? [...value].sort()
        : [...value];
      const sortedPact = ignorePrimitiveArrayOrder
        ? [...pact].sort()
        : [...pact];

      for (let i = 0; i < sortedValue.length; i++) {
        if (
          i >= sortedValue.length ||
          i >= sortedPact.length ||
          sortedValue[i] !== sortedPact[i]
        ) {
          diff.push(i);
        }
      }

      if (diff.length === 0) {
        return;
      } else {
        throwPactError(
          `Arrays with key "${keyPath(parents)}" have mismatches at indices "${diff}".`,
          keyPath(parents)
        );
      }
    };

    if (_.isString(obj1) && _.isString(obj2) && !_.isEqual(obj1, obj2)) {
      throwPactError(`"${keyPath()}" text did not match.`);
    }

    if (!_.isObject(obj1) || !_.isObject(obj2)) {
      throwPactError(
        `Expected 2 objects as input for matching, but got "${typeof obj1}" and ${typeof obj2}".`
      );
    }

    if (_.isArray(obj1) && _.isArray(obj2)) {
      if (obj1.length !== obj2.length) {
        throwPactError(
          `Arrays at "${_.isEmpty(parents) ? "root" : keyPath()}" have different lengths.`
        );
      }
    }

    if (_.isArray(obj1) !== _.isArray(obj2)) {
      throwPactError(
        `Type mismatch at "${_.isEmpty(parents) ? "root" : keyPath()}". Expected ${_.isArray(obj2) ? "array" : "object"} but got ${_.isArray(obj1) ? "array" : "object"}.`
      );
    }

    // get keys of objects without schema keys and schema keys separately
    const objectKeys = Object.keys(obj1).filter(
      (k) => !this.isSchemaMatcherKey(k)
    );
    const schemaKeys = Object.keys(obj2).filter((k) =>
      this.isSchemaMatcherKey(k)
    );
    // normalize pact keys and remove keys that have a schema defined
    // we do not want for example body and $body
    const pactKeys =
      matchSchemaAndObject === true
        ? Object.keys(obj2)
        : Object.keys(obj2).reduce((acc, key) => {
            if (!schemaKeys.includes(`$${key}`)) {
              acc.push(key);
            }
            return acc;
          }, [] as string[]);

    if (_.isEmpty(objectKeys) && _.isEmpty(pactKeys)) {
      return true;
    }

    const removeSchemaPrefix = (key: string) =>
      this.isSchemaMatcherKey(key) ? key.slice(1) : key;

    const findActualKey = (obj: any, keyToFind: string): string => {
      if (!options?.ignoreCase) return keyToFind;
      if (obj == null || !_.isObject(obj)) return keyToFind;

      const actualKey = Object.keys(obj).find(
        (k) => k.toLowerCase() === keyToFind.toLowerCase()
      );
      return actualKey ?? keyToFind;
    };

    // if strictMatching is disabled, only check properties of the pact for object matching
    // strictMatching for schema matching is considered within the matcher -> schema.additionalProperties
    const keys = !strictMatching ? pactKeys : objectKeys;
    for (const key of keys) {
      // schema is always defined on the pact object - needs special consideration
      const isSchema =
        this.isSchemaMatcherKey(key) || schemaKeys.includes(`$${key}`);

      // Resolve actual keys with correct casing when ignoreCase is enabled
      const valueSourceObj = strictMatching || isSchema ? obj1 : obj2;
      const pactSourceObj = strictMatching || isSchema ? obj2 : obj1;

      const keyForValue = findActualKey(
        valueSourceObj,
        removeSchemaPrefix(key)
      );

      const keyForPact = findActualKey(
        pactSourceObj,
        isSchema && !key.startsWith("$") ? `$${key}` : key
      );

      const value = _.get(valueSourceObj, keyForValue);
      let pact = _.get(pactSourceObj, keyForPact);

      if (
        !isSchema &&
        !this.isKeyPathInObject(
          strictMatching ? pactKeys : objectKeys,
          key,
          options?.ignoreCase
        )
      ) {
        throwPactError(
          `"${keyPath(key)}" not found in ${
            strictMatching ? "pact" : "response"
          } object.`
        );
      }
      if (isSchema) {
        const errorKey = removeSchemaPrefix(key);
        if (!schemaMatcher) {
          throwSchemaError(
            `No schema matcher registered to validate "${keyPath(errorKey)}".`,
            errorKey,
            pact,
            value
          );
        }
        try {
          if (!schemaMatcher.match(value, pact, strictMatching)) {
            throwSchemaError(
              `Schema for "${keyPath(errorKey)}" does not match.`,
              errorKey,
              pact,
              value
            );
          }
        } catch (error: any) {
          throwSchemaError(
            `Schema for "${keyPath(errorKey)}" does not match (${
              error?.message ?? error
            }).`,
            errorKey,
            pact,
            value
          );
        }

        if (!matchSchemaAndObject) {
          continue;
        }
        const keyForSchemaAndObject = findActualKey(
          strictMatching ? obj2 : obj1,
          key
        );
        pact = _.get(strictMatching ? obj2 : obj1, keyForSchemaAndObject);
      }

      if (this.getPropertyMatcher(key, options?.ignoreCase) != null) {
        if (!strictMatching && !value) {
          continue;
        }
        try {
          const result = this.getPropertyMatcher(
            key,
            options?.ignoreCase
          )?.match(
            value,
            pact,
            _.extend(options, { parents: [...parents, key] })
          );
          if (!result) throw new Error("");
        } catch (error: any) {
          // calling match recursively requires to pass the root error
          if (
            _.get(error as any, "name") === "C8yPactError" ||
            _.get(error as any, "name") === "C8yPactMatchError"
          ) {
            throw error;
          } else {
            throwPactError(
              `Values for "${keyPath(key)}" do not match.${
                error != null ? " " + (error?.message ?? error) : ""
              }`,
              key
            );
          }
        }
      } else if (
        isArrayOfPrimitivesOrNull(value) &&
        isArrayOfPrimitivesOrNull(pact)
      ) {
        matchArraysOfPrimitives(value, pact, [...parents, key]);
      } else if (_.isArray(value) && _.isArray(pact)) {
        if (value.length !== pact.length) {
          throwPactError(
            `Arrays with key "${keyPath(key)}" have different lengths.`,
            key
          );
        }
        for (let i = 0; i < value.length; i++) {
          if (
            isArrayOfPrimitivesOrNull(value[i]) &&
            isArrayOfPrimitivesOrNull(pact[i])
          ) {
            matchArraysOfPrimitives(value[i], pact[i], [...parents, key, i]);
          } else {
            this.match(
              value[i],
              pact[i],
              _.extend(options, { parents: [...parents, key, i] })
            );
          }
        }
      } else if (_.isObjectLike(value) && _.isObjectLike(pact)) {
        if (
          isArrayOfPrimitivesOrNull(value) &&
          isArrayOfPrimitivesOrNull(pact)
        ) {
          matchArraysOfPrimitives(value, pact, [...parents, key]);
        } else {
          // if strictMatching is disabled, value1 and value2 have been swapped
          // swap back to ensure swapping in next iteration works as expected
          this.match(
            strictMatching ? value : pact,
            strictMatching ? pact : value,
            _.extend(options, { parents: [...parents, key] })
          );
        }
      } else {
        if (value != null && pact != null && !_.isEqual(value, pact)) {
          throwPactError(`Values for "${keyPath(key)}" do not match.`, key);
        }
      }
    }

    return true;
  }

  /**
   * Check if a key is a schema matcher key (starts with $ but is not a standard JSON Schema keyword)
   */
  private isSchemaMatcherKey(key: string): boolean {
    if (!key.startsWith("$")) {
      return false;
    }
    return !C8yDefaultPactMatcher.JSON_SCHEMA_KEYWORDS.has(key);
  }

  private isKeyPathInObject(
    keys: any,
    keyPath: string,
    ignoreCase = false
  ): boolean {
    if (!Array.isArray(keys)) {
      return false;
    }
    if (ignoreCase) {
      const lowerKeyPath = keyPath.toLowerCase();
      return keys.some(
        (item) =>
          typeof item === "string" && item.toLowerCase() === lowerKeyPath
      );
    }
    return keys.includes(keyPath);
  }

  /**
   * Returns the property matcher for the given property name.
   * @param key The property name to get the matcher for.
   * @param ignoreCase Whether to ignore the case of the property name.
   */
  getPropertyMatcher(key: string, ignoreCase = false) {
    if (ignoreCase) {
      return get_i(this.propertyMatchers, key);
    }
    return this.propertyMatchers[key];
  }

  /**
   * Adds a new property matcher for the given property name.
   */
  addPropertyMatcher(propertyName: string, matcher: C8yPactMatcher) {
    this.propertyMatchers[propertyName] = matcher;
  }

  /**
   * Removes the property matcher for the given property name.
   */
  removePropertyMatcher(propertyName: string) {
    delete this.propertyMatchers[propertyName];
  }
}

/**
 * Extends C8yDefaultPactMatcher with default property matchers for Cumulocity
 * response bodies. It has rules configured at least for the following properties:
 * id, statistics, lastUpdated, creationTime, next, self, password, owner, tenantId
 * and lastPasswordChange. It is registered for the properties body and requestBody.
 */
export class C8yPactBodyMatcher extends C8yDefaultPactMatcher {
  constructor(propertyMatchers = {}) {
    super(propertyMatchers);

    this.addPropertyMatcher("id", new C8ySameTypeMatcher());
    this.addPropertyMatcher("statistics", new C8yIgnoreMatcher());
    this.addPropertyMatcher("lastUpdated", new C8yISODateStringMatcher());
    this.addPropertyMatcher("creationTime", new C8yISODateStringMatcher());
    this.addPropertyMatcher("next", new C8yIgnoreMatcher());
    this.addPropertyMatcher("self", new C8yIgnoreMatcher());
    this.addPropertyMatcher("password", new C8yIgnoreMatcher());
    this.addPropertyMatcher("owner", new C8ySameTypeMatcher());
    this.addPropertyMatcher("tenantId", new C8yIgnoreMatcher());
    this.addPropertyMatcher(
      "lastPasswordChange",
      new C8yISODateStringMatcher()
    );
  }
}

export class C8yIdentifierMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    [obj1, obj2].forEach((id) => {
      if (_.isString(id) === false || /^\d+$/.test(id) === false) {
        throw new Error(`Value "${id}" is not a valid identifier.`);
      }
    });
    return true;
  }
}

export class C8yNumberMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    [obj1, obj2].forEach((n) => {
      if (!_.isNumber(n) || _.isNaN(n)) {
        throw new Error(`Value "${obj1}" is not a number.`);
      }
    });
    return true;
  }
}

export class C8yStringMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    [obj1, obj2].forEach((s) => {
      if (!_.isString(s)) {
        throw new Error(`Value "${s}" is not a string.`);
      }
    });
    return true;
  }
}

export class C8yIgnoreMatcher implements C8yPactMatcher {
  match(): boolean {
    return true;
  }
}

export class C8ySameTypeMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    const result = typeof obj1 === typeof obj2;
    if (!result) {
      throw new Error(
        `Values are not of same type. Expected ${typeof obj1} but got ${typeof obj2}`
      );
    }
    return result;
  }
}

export class C8yISODateStringMatcher {
  match(obj1: any, obj2: any): boolean {
    // validate regex as parseISO does not throw an error for invalid dates
    // and is not strict enough for our use case
    // https://regex101.com/library/6gJsuQ?filterFlavors=javascript&page=9
    const isoRegex = new RegExp(
      /^((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)|(02)-(0[1-9]|1\d|2[0-8])))T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}([+-]([01]\d|2[0-3]):[0-5]\d|Z)$/
    );

    [obj1, obj2].forEach((obj) => {
      if (!_.isString(obj)) {
        throw new Error(`Value "${obj}" is not a string.`);
      }
      if (!isoRegex.test(obj)) {
        throw new Error(`Value "${obj}" is not a valid ISO date string.`);
      }
    });

    const d1 = datefns.parseISO(obj1);
    const d2 = datefns.parseISO(obj2);
    return datefns.isValid(d1) && datefns.isValid(d2);
  }
}
