import _ from "lodash";
import * as datefns from "date-fns";
import { C8ySchemaMatcher } from "./schema";

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

export interface C8yPactMatcherOptions {
  strictMatching?: boolean;
  loggerProps?: { [key: string]: any };
  schemaMatcher?: C8ySchemaMatcher;
  parents?: string[];
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
    }
  ) {
    this.propertyMatchers = propertyMatchers;
  }

  match(obj1: any, obj2: any, options?: C8yPactMatcherOptions): boolean {
    if (obj1 === obj2) return true;

    const parents = options?.parents ?? [];
    const strictMatching = options?.strictMatching ?? false;
    const schemaMatcher =
      options?.schemaMatcher || C8yDefaultPactMatcher.schemaMatcher;

    const throwPactError = (message: string, key?: string) => {
      const errorMessage = `Pact validation failed! ${message}`;
      const newErr = new Error(errorMessage);
      newErr.name = "C8yPactError";
      if (options?.loggerProps) {
        options.loggerProps.error = errorMessage;
        options.loggerProps.key = key;
        options.loggerProps.keypath = keyPath(key);
        options.loggerProps.objects =
          key && _.isPlainObject(obj1) && _.isPlainObject(obj2)
            ? [_.pick(obj1, [key]), _.pick(obj2, [key])]
            : [obj1, obj2];
      }

      throw newErr;
    };

    const keyPath = (k?: string) => {
      return `${[...parents, ...(k ? [k] : [])].join(" > ")}`;
    };

    const isArrayOfPrimitives = (value: any) => {
      if (!_.isArray(value)) {
        return false;
      }
      const primitiveTypes = ["undefined", "boolean", "number", "string"];
      return (
        value.filter((p) => primitiveTypes.includes(typeof p)).length ===
        value.length
      );
    };

    if (_.isString(obj1) && _.isString(obj2) && !_.isEqual(obj1, obj2)) {
      throwPactError(`"${keyPath()}" text did not match.`);
    }

    if (!_.isObject(obj1) || !_.isObject(obj2)) {
      throwPactError(
        `Expected 2 objects as input for matching, but got "${typeof obj1}" and ${typeof obj2}".`
      );
    }

    // get keys of objects without schema keys and schema keys separately
    const objectKeys = Object.keys(obj1).filter((k) => !k.startsWith("$"));
    const schemaKeys = Object.keys(obj2).filter((k) => k.startsWith("$"));
    // normalize pact keys and remove keys that have a schema defined
    // we do not want for example body and $body
    const pactKeys = Object.keys(obj2).reduce((acc, key) => {
      if (!schemaKeys.includes(`$${key}`)) {
        acc.push(key);
      }
      return acc;
    }, [] as string[]);

    if (_.isEmpty(objectKeys) && _.isEmpty(pactKeys)) {
      return true;
    }

    const removeSchemaPrefix = (key: string) =>
      key.startsWith("$") ? key.slice(1) : key;

    // if strictMatching is disabled, only check properties of the pact for object matching
    // strictMatching for schema matching is considered within the matcher -> schema.additionalProperties
    const keys = !strictMatching ? pactKeys : objectKeys;
    for (const key of keys) {
      // schema is always defined on the pact object - needs special consideration
      const isSchema = key.startsWith("$") || schemaKeys.includes(`$${key}`);

      const value = _.get(
        strictMatching || isSchema ? obj1 : obj2,
        removeSchemaPrefix(key)
      );
      const pact = _.get(
        strictMatching || isSchema ? obj2 : obj1,
        isSchema && !key.startsWith("$") ? `$${key}` : key
      );

      if (
        !(strictMatching ? pactKeys : objectKeys).includes(key) &&
        !isSchema
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
          throwPactError(
            `No schema matcher registered to validate "${keyPath(errorKey)}".`,
            errorKey
          );
        }
        try {
          if (!schemaMatcher.match(value, pact, strictMatching)) {
            throwPactError(
              `Schema for "${keyPath(errorKey)}" does not match.`,
              errorKey
            );
          }
        } catch (error) {
          throwPactError(
            `Schema for "${keyPath(errorKey)}" does not match. (${error})`,
            errorKey
          );
        }
      } else if (this.propertyMatchers[key] != null) {
        if (!strictMatching && !value) {
          continue;
        }
        if (
          !this.propertyMatchers[key].match(
            value,
            pact,
            _.extend(options, { parents: [...parents, key] })
          )
        ) {
          throwPactError(`Values for "${keyPath(key)}" do not match.`, key);
        }
      } else if (isArrayOfPrimitives(value) && isArrayOfPrimitives(pact)) {
        const v = [value, pact].sort(
          (a1: any[], a2: any[]) => a2.length - a1.length
        );
        const diff = _.difference(v[0], v[1]);
        if (_.isEmpty(diff)) {
          continue;
        } else {
          throwPactError(
            `Array with key "${keyPath(key)}" has unexpected values "${diff}".`,
            key
          );
        }
      } else if (_.isArray(value) && _.isArray(pact)) {
        if (value.length !== pact.length) {
          throwPactError(
            `Array with key "${keyPath(key)}" has different lengths.`,
            key
          );
        }
        for (let i = 0; i < value.length; i++) {
          this.match(
            value[i],
            pact[i],
            _.extend(options, { parents: [...parents, key, `${i}`] })
          );
        }
      } else if (_.isObjectLike(value) && _.isObjectLike(pact)) {
        // if strictMatching is disabled, value1 and value2 have been swapped
        // swap back to ensure swapping in next iteration works as expected
        this.match(
          strictMatching ? value : pact,
          strictMatching ? pact : value,
          _.extend(options, { parents: [...parents, key] })
        );
      } else {
        if (value != null && pact != null && !_.isEqual(value, pact)) {
          throwPactError(`Values for "${keyPath(key)}" do not match.`, key);
        }
      }
    }

    return true;
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
    this.addPropertyMatcher("owner", new C8yIgnoreMatcher());
    this.addPropertyMatcher("tenantId", new C8yIgnoreMatcher());
    this.addPropertyMatcher(
      "lastPasswordChange",
      new C8yISODateStringMatcher()
    );
  }
}

export class C8yIdentifierMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    return (
      _.isString(obj1) &&
      /^\d+$/.test(obj1) &&
      _.isString(obj2) &&
      /^\d+$/.test(obj2)
    );
  }
}

export class C8yNumberMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    return _.isNumber(obj1) && _.isNumber(obj2);
  }
}

export class C8yStringMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    return _.isString(obj1) && _.isString(obj2);
  }
}

export class C8yIgnoreMatcher implements C8yPactMatcher {
  match(): boolean {
    return true;
  }
}

export class C8ySameTypeMatcher implements C8yPactMatcher {
  match(obj1: any, obj2: any): boolean {
    return typeof obj1 === typeof obj2;
  }
}

export class C8yISODateStringMatcher {
  match(obj1: any, obj2: any): boolean {
    if (!_.isString(obj1) || !_.isString(obj2)) {
      return false;
    }

    const d1 = datefns.parseISO(obj1);
    const d2 = datefns.parseISO(obj2);
    return datefns.isValid(d1) && datefns.isValid(d2);
  }
}
