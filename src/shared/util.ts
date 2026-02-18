import _ from "lodash";
import * as setCookieParser from "set-cookie-parser";
import * as libCookie from "cookie";
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

export function sanitizeStringifiedObject(obj: any): any {
  if (!_.isString(obj)) {
    return obj;
  }
  const regex =
    /((?:"password"|'password'|password|"token"|'token'|token)\s*:\s*["']?)(.*?)(["']|,|\s|}|$)/gi;
  return obj.replace(regex, "$1***$3");
}

/**
 * Gets the case-sensitive path for a given case-insensitive path. The path is
 * assumed to be a dot-separated string. If the path is an array, it is assumed
 * to be a list of keys.
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
      } else {
        // Handle non-numeric keys in arrays
        if (current.length > 0 && _.isString(current[0])) {
          const matchedIndex = current.findIndex(
            (item) => _.isString(item) && item.toLowerCase() === key.toLowerCase()
          );
          if (matchedIndex !== -1) {
            actualPath.push(String(matchedIndex));
            current = current[matchedIndex];
            continue;
          }
        }
        // If not found or array doesn't contain strings, return undefined
        return undefined;
      }
      // Index out of bounds
      return undefined;
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
        return undefined;
      }
    } else {
      return undefined;
    }
  }

  return actualPath.join(".");
}

/**
 * Gets the value of a case-insensitive key path from an object. The path is
 * assumed to be a dot-separated string. If the path is an array, it is assumed
 * to be a list of keys.
 *
 * This function supports deep access to cookie and set-cookie headers, e.g.
 * `requestHeaders.cookie.authorization`. Cookie headers are parsed and the value
 * of the specified cookie is returned. If the cookie is not found, undefined is returned.
 *
 * @example
 * get_i(obj, "obj.key.token")
 * get_i(obj, ["obj", "key", "token"])
 * get_i(obj, "obj.key[0].token")
 * get_i(obj, "obj.key.0.token")
 * get_i(obj, "requestHeaders.cookie.authorization")
 * get_i(obj, "requestHeaders.set-cookie.authorization")
 *
 * @param obj The object to query
 * @param keyPath The case-insensitive key path to find
 * @returns The value of the key path if found, undefined otherwise
 */
export function get_i(obj: any, keyPath: string | string[]): any | undefined {
  if (obj == null || keyPath == null) return undefined;
  
  // Handle case where obj itself is an array of strings with a single key lookup
  const keys = _.isArray(keyPath)
    ? (keyPath as string[]).filter((k) => !_.isEmpty(k))
    : (keyPath as string).split(/[.[\]]/g).filter((k) => !_.isEmpty(k));
  
  if (keys.length === 1 && _.isArray(obj) && obj.length > 0 && _.isString(obj[0])) {
    const matchedString = obj.find(
      (item) => _.isString(item) && item.toLowerCase() === keys[0].toLowerCase()
    );
    if (matchedString !== undefined) {
      return matchedString;
    }
  }
  
  const sensitivePath = toSensitiveObjectKeyPath(obj, keyPath);
  let direct: any = undefined;

  // Try direct access first if we have a valid path
  if (sensitivePath != null) {
    direct = _.get(obj, sensitivePath);
    if (direct !== undefined) return direct;
  }

  // Handle cookie and set-cookie deep access, e.g. requestHeaders.cookie.authorization
  if (!keys || keys.length === 0) return undefined;

  const indexOfKey = (arr: string[], val: string) =>
    arr.findIndex((k) => k.toLowerCase() === val.toLowerCase());

  const cookieIdx = indexOfKey(keys, "cookie");
  const setCookieIdx = indexOfKey(keys, "set-cookie");

  // Helper to resolve the real path up to a certain index (inclusive)
  const resolvePathUpTo = (idx: number): string | undefined => {
    const part = keys.slice(0, idx + 1);
    return toSensitiveObjectKeyPath(obj, part) ?? part.join(".");
  };

  // requestHeaders.cookie.<name>
  if (cookieIdx >= 0) {
    const parentPath = resolvePathUpTo(cookieIdx);
    const cookieHeader: any = parentPath ? _.get(obj, parentPath) : undefined;
    const cookieName = keys[cookieIdx + 1];
    if (cookieHeader == null) return undefined;
    if (!cookieName) return cookieHeader; // return full header if no name

    // Parse Cookie header string into key/value
    if (_.isString(cookieHeader)) {
      const parsed = libCookie.parse(cookieHeader);
      const matchKey = Object.keys(parsed).find(
        (k) => k.toLowerCase() === cookieName.toLowerCase()
      );
      return matchKey ? parsed[matchKey] : undefined;
    }
    return undefined;
  }

  // headers.set-cookie.<name>
  if (setCookieIdx >= 0) {
    const parentPath = resolvePathUpTo(setCookieIdx);
    const setCookieHeader: any = parentPath
      ? _.get(obj, parentPath)
      : undefined;
    const cookieName = keys[setCookieIdx + 1];
    if (setCookieHeader == null) return undefined;
    if (!cookieName) return setCookieHeader; // return full header if no name

    // Parse Set-Cookie header (array or string)
    const headerInput = _.isString(setCookieHeader)
      ? setCookieParser.splitCookiesString(setCookieHeader)
      : setCookieHeader;
    const cookies = setCookieParser.parse(headerInput as any, {
      decodeValues: false,
    });
    const found = (cookies || []).find(
      (c: any) => c?.name?.toLowerCase() === cookieName.toLowerCase()
    );
    return found?.value;
  }

  // Handle arrays of strings with case-insensitive matching
  // For paths like "headers.authorization" where headers is ["Content-Type", "Authorization"]
  for (let i = 0; i < keys.length; i++) {
    const parentPath = resolvePathUpTo(i);
    const parentValue = parentPath ? _.get(obj, parentPath) : undefined;
    
    if (_.isArray(parentValue) && parentValue.length > 0 && _.isString(parentValue[0])) {
      const searchKey = keys[i + 1];
      if (searchKey) {
        const index = parseInt(searchKey);
        if (isNaN(index)) {
          // Non-numeric key, try to find case-insensitive match in string array
          const matchedString = parentValue.find(
            (item) => _.isString(item) && item.toLowerCase() === searchKey.toLowerCase()
          );
          if (matchedString !== undefined) {
            return matchedString;
          }
        }
      }
    }
  }

  return direct;
}

/**
 * Returns the shortest unique prefixes for the given words. The prefixes are
 * unique in the sense that they are not prefixes of any other word in the list.
 *
 * @param words The list of words to find the prefixes for.
 * @returns The list of shortest unique prefixes.
 */
export function shortestUniquePrefixes(words: string[]) {
  class TrieNode {
    public children: Map<string, TrieNode>;
    public isEndOfWord: boolean;
    public count: number;

    constructor() {
      this.children = new Map();
      this.isEndOfWord = false;
      this.count = 0;
    }
  }

  const insertWord = (root: TrieNode, word: string) => {
    let currentNode: TrieNode | undefined = root;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!currentNode?.children.has(char)) {
        currentNode?.children.set(char, new TrieNode());
      }
      currentNode = currentNode?.children.get(char);
      if (currentNode) {
        currentNode.count++;
      }
    }
    if (currentNode) {
      currentNode.isEndOfWord = true;
    }
  };

  const root = new TrieNode();
  const prefixes: string[] = [];

  // Build the trie with all words
  for (const word of words) {
    insertWord(root, word);
  }

  // Find the shortest unique prefix for each word
  for (const word of words) {
    if (word.length === 0) {
      prefixes.push("");
      continue;
    }

    let currentNode: TrieNode | undefined = root;
    let prefix = "";
    let foundUniquePrefix = false;

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      prefix += char;
      currentNode = currentNode?.children.get(char);

      // If this node has a count of 1, it means this prefix is unique
      if (currentNode && currentNode.count === 1) {
        prefixes.push(prefix);
        foundUniquePrefix = true;
        break;
      }
    }

    // If no unique prefix is found, use the entire word
    if (!foundUniquePrefix) {
      prefixes.push(word);
    }
  }

  return prefixes;
}

export function getLastDefinedValue<T>(
  data: T[],
  index: number
): T | undefined {
  const value = _.findLast(
    data.slice(0, index + 1),
    (item) => !_.isUndefined(item)
  );
  if (value !== undefined) {
    return value;
  }
  return undefined;
}

/**
 * Converts a value to an array. If the value is an array, it is returned as is.
 * @param value The value to convert to an array
 * @returns The value as an array if it is not already an array
 */
export function to_array<T>(value: T | T[] | undefined): T[] | undefined {
  if (value == null) return undefined;
  if (_.isArray(value)) return value;
  return [value];
}

/**
 * Converts a string value to a boolean. Supported values are "true", "false", "1", and "0".
 * @param input The input string to convert to a boolean
 * @param defaultValue The default value to return if the input is not a valid boolean string
 * @returns The boolean value of the input string or the default value if the input is not a valid boolean string
 */
export function to_boolean(input: string, defaultValue: boolean): boolean {
  if (input == null || !_.isString(input)) return defaultValue;
  const booleanString = input.toString().toLowerCase();
  if (booleanString == "true" || booleanString === "1") return true;
  if (booleanString == "false" || booleanString === "0") return false;
  return defaultValue;
}

export function buildTestHierarchy<T>(
  objects: T[],
  hierarchyfn: (obj: T) => string[] | undefined
): C8yTestHierarchyTree<T> {
  const tree: C8yTestHierarchyTree<T> = {};
  objects.forEach((item) => {
    const titles = hierarchyfn(item);
    if (titles) {
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
    }
  });
  return tree;
}
