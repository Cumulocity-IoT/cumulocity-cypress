import _ from "lodash";
import { C8yTestHierarchyTree } from "./types";

export function safeStringify(obj: any, indent = 2) {
  let cache: any[] = [];
  const retVal = JSON.stringify(
    obj,
    (key, value) =>
      typeof value === "object" && value !== null
        ? cache.includes(value)
          ? undefined
          : cache.push(value) && value
        : value,
    indent
  );
  cache = [];
  return retVal;
}

export function sanitizeStringifiedObject(value: string) {
  if (!value || typeof value !== "string") {
    return value;
  }
  return value.replace(
    /("?)(password)("?):\s+("?).*?(")?(\s*,?[\s\n}]+)/gi,
    "$1$2$3: $4***$5$6"
  );
}

export function toBoolean(input: string, defaultValue: boolean): boolean {
  if (input == null || !_.isString(input)) return defaultValue;
  const booleanString = input.toString().toLowerCase();
  if (booleanString == "true" || booleanString === "1") return true;
  if (booleanString == "false" || booleanString === "0") return false;
  return defaultValue;
}

/**
 * Gets the case-sensitive path for a given case-insensitive path. The path is
 * assumed to be a dot-separated string. If the path is an array, it is assumed
 * to be a list of keys.
 *
 * The function will go over all keys and return the actual case-sensitive path
 * up to the first mismatch.
 *
 * @param obj The object to query
 * @param path The case-insensitive path to find
 * @returns The actual case-sensitive path if found, undefined otherwise
 */
export function toSensitiveObjectKeyPath(
  obj: any,
  path: string | string[]
): string | undefined {
  if (!obj) return undefined;

  const keys = _.isArray(path) ? path : path.split(/[.[\]]/g);
  let current = obj;
  const actualPath: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (_.isEmpty(key)) continue;

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

/**
 * Gets the value of a case-insensitive key path from an object. The path is
 * assumed to be a dot-separated string. If the path is an array, it is assumed
 * to be a list of keys.
 *
 * @example
 * geti(obj, "obj.key.token")
 * geti(obj, ["obj", "key", "token"])
 * geti(obj, "obj.key[0].token")
 * geti(obj, "obj.key.0.token")
 *
 * @param obj The object to query
 * @param keyPath The case-insensitive key path to find
 * @returns The value of the key path if found, undefined otherwise
 */
export function get_i(
  obj: any,
  keyPath: string | string[]
): string | undefined {
  if (obj == null || keyPath == null) return undefined;
  const sensitivePath = toSensitiveObjectKeyPath(obj, keyPath);
  if (sensitivePath == null) return undefined;
  return _.get(obj, sensitivePath);
}

/**
 * Converts a value to an array. If the value is an array, it is returned as is.
 * @param value The value to convert to an array
 * @returns The value as an array if it is not already an array
 */
export function to_array<T>(value: T | T[] | undefined): T[] | undefined {
  if (value === undefined) return undefined;
  if (_.isArray(value)) return value;
  return [value];
}

export function buildTestHierarchy<T>(
  objects: T[],
  hierarchyfn: (obj: T) => string[],
): C8yTestHierarchyTree<T> {
  const tree: C8yTestHierarchyTree<T> = {};
  objects.forEach((item) => {
    const titles = hierarchyfn(item);

    let currentNode = tree;
    const protectedKeys = ["__proto__", "constructor", "prototype"];
    titles?.forEach((title, index) => {
      if (!protectedKeys.includes(title)) {
        if (!currentNode[title]) {
          currentNode[title] = index === titles.length - 1 ? item : {};
        }
        currentNode = currentNode[title] as C8yTestHierarchyTree<T>;
      }
    });
  });
  return tree;
}
