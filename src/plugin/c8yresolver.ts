import $RefParser, {
  JSONParserError,
  JSONParserErrorGroup,
} from "@apidevtools/json-schema-ref-parser";
import * as path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import * as fs from "fs";

import lodash1 from "lodash";
import * as lodash2 from "lodash";
import { C8yPact, C8yPactObjectKeys } from "../shared/c8ypact/c8ypact";
const _ = lodash1 || lodash2;

interface RefParameterizationInfo {
  keyPath: (string | number)[];
  params: Record<string, any>;
  originalRefValue: string;
}

function traverseAndPreprocessRefs(
  currentNode: any,
  currentPath: (string | number)[],
  collectedParams: RefParameterizationInfo[],
  baseFolder?: string
): void {
  if (typeof currentNode !== "object" || currentNode === null) {
    return;
  }

  for (const key in currentNode) {
    if (!Object.prototype.hasOwnProperty.call(currentNode, key)) {
      continue;
    }

    const value = currentNode[key];

    if (key === "$ref" && _.isString(value)) {
      const originalRefValue = value; // Save the full original $ref string

      // 1. Separate query string first
      const queryIndex = originalRefValue.indexOf("?");
      const basePathAndFragment =
        queryIndex === -1
          ? originalRefValue
          : originalRefValue.substring(0, queryIndex);
      const queryStringPart =
        queryIndex === -1 ? "" : originalRefValue.substring(queryIndex);

      // 2. Separate fragment from the base path
      const fragmentIndex = basePathAndFragment.indexOf("#");
      const mainPathPart = // Ensure this is const
        fragmentIndex === -1
          ? basePathAndFragment
          : basePathAndFragment.substring(0, fragmentIndex);
      const fragmentPart =
        fragmentIndex === -1
          ? ""
          : basePathAndFragment.substring(fragmentIndex); // Includes the '#'

      let processedMainPath = mainPathPart;

      // 3. Transform mainPathPart if it's a potential local file path
      // Use regex to robustly detect URI schemes and internal refs
      if (
        !/^#/.test(mainPathPart) && // Excludes internal refs like "#/definitions/foo"
        !_.isEmpty(mainPathPart) && // Excludes empty paths
        !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(mainPathPart) // Excludes any URI scheme (e.g., http://, https://, file://, custom://)
      ) {
        if (baseFolder) {
          if (path.isAbsolute(mainPathPart)) {
            // Absolute OS path given, convert to file URI, ignore baseFolder for this path
            processedMainPath = pathToFileURL(mainPathPart).href;
          } else {
            // Relative OS path, resolve against baseFolder and convert to file URI
            processedMainPath = pathToFileURL(
              path.resolve(baseFolder, mainPathPart)
            ).href;
          }
        } else {
          // No baseFolder provided.
          // Resolve mainPathPart against CWD (if relative) or use as is (if absolute),
          // then convert to file URI. This ensures all file paths become absolute file:// URLs.
          // process.cwd() should return the mocked CWD in a test environment.
          processedMainPath = pathToFileURL(
            path.resolve(process.cwd(), mainPathPart)
          ).href;
        }
      }
      // If mainPathPart starts with "#", or is empty (from an internal ref like "#/foo"),
      // or starts with a known URI scheme, it's not modified here.

      // 4. Reconstruct the final $ref value in the document for $RefParser
      let finalRefValue: string;
      if (processedMainPath === "" && fragmentPart === "") {
        // Handles cases like originalRefValue = "" or originalRefValue = "?query=val"
        // These should point to the root of the current document.
        finalRefValue = "#" + queryStringPart;
      } else {
        finalRefValue = processedMainPath + fragmentPart + queryStringPart;
      }
      currentNode[key] = finalRefValue;

      // Construct the clean reference string for $RefParser
      // This ensures query parameters are NOT included in the ref path itself.
      let refForParser: string;
      if (processedMainPath) {
        // We have a scheme (http, file) or a path that will be resolved by the parser.
        // Add fragment if it exists (e.g., "file:///doc.json#/foo").
        // If fragmentPart is empty, it refers to the root of the external document.
        refForParser = processedMainPath + (fragmentPart || "");
      } else {
        // No processedMainPath, so it's an internal reference to the current document.
        // fragmentPart would be like "#/definitions/foo", or "#" (if originalRef was "#" or "#?query"),
        // or "" (if originalRef was "" or "?query", making baseRefPath "", thus mainPathPart and fragmentPart also "").
        // Default to "#" to reference the root of the current document if fragmentPart is empty.
        refForParser = fragmentPart || "#";
      }

      // Update the $ref in the document with the clean reference for $RefParser
      currentNode[key] = refForParser;

      // 5. Parameter collection logic (uses originalRefValue for query parsing)
      if (queryIndex !== -1) {
        const params: Record<string, any> = {};
        new URLSearchParams(originalRefValue.substring(queryIndex + 1)).forEach(
          (paramValue, paramKey) => {
            const intMatch = paramValue.match(/^Int\(([-+]?\d+)\)$/);
            const floatMatch = paramValue.match(/^Float\(([-+]?\d*\.?\d+)\)$/);
            const boolMatch = paramValue.match(/^Bool\((true|false)\)$/i);

            if (intMatch) {
              params[paramKey] = parseInt(intMatch[1], 10);
            } else if (floatMatch) {
              params[paramKey] = parseFloat(floatMatch[1]);
            } else if (boolMatch) {
              params[paramKey] = boolMatch[1].toLowerCase() === "true";
            } else {
              params[paramKey] = paramValue;
            }
          }
        );

        collectedParams.push({
          keyPath: [...currentPath], // Path to the object containing this $ref
          params,
          originalRefValue: originalRefValue, // Store the original full $ref for post-processing
        });
      }
    } else if (typeof value === "object" && value !== null) {
      const nextPathSegment = Array.isArray(currentNode) ? parseInt(key) : key;
      traverseAndPreprocessRefs(
        value,
        [...currentPath, nextPathSegment],
        collectedParams,
        baseFolder
      );
    }
  }
}

// Helper: Get value from object by path using lodash
function getValueByPath(obj: any, path: (string | number)[]): any {
  return _.get(obj, path);
}

// Helper: Set value in object by path using lodash
function setValueByPath(obj: any, path: (string | number)[], value: any): void {
  _.set(obj, path, value);
}

// Helper: Replace placeholders in a copy of the target
function replacePlaceholdersInCopy(
  target: any,
  params: Record<string, any> // Changed from string to any
): any {
  if (_.isString(target)) {
    // Check if the entire string is a single placeholder
    for (const paramKey in params) {
      if (Object.prototype.hasOwnProperty.call(params, paramKey)) {
        const placeholder = `{{${paramKey}}}`;
        if (target === placeholder) {
          return params[paramKey]; // Return the raw (potentially typed) value
        }
      }
    }

    // If not a single placeholder, perform string interpolation
    let result = target;
    for (const paramKey in params) {
      if (Object.prototype.hasOwnProperty.call(params, paramKey)) {
        const placeholder = `{{${paramKey}}}`;
        // Ensure param is stringified for interpolation within a larger string
        result = result.split(placeholder).join(String(params[paramKey]));
      }
    }
    return result;
  } else if (Array.isArray(target)) {
    return target.map((item) => replacePlaceholdersInCopy(item, params));
  } else if (typeof target === "object" && target !== null) {
    const copy: { [key: string]: any } = {}; // Create a new object
    for (const key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        copy[key] = replacePlaceholdersInCopy(target[key], params);
      }
    }
    return copy;
  }
  return target; // For numbers, booleans, null, undefined
}

export async function resolveRefs(
  doc: C8yPact,
  baseFolder?: string, // Optional base folder for resolving relative file paths
  parserOptions?: any // Optional custom options for $RefParser
): Promise<C8yPact | null> {
  if (doc == null || typeof doc !== "object") {
    return doc;
  }

  // only resolve in C8yPact objects
  if (!C8yPactObjectKeys.some((key) => key in doc)) {
    return doc;
  }

  const parameterizationInfoList: RefParameterizationInfo[] = [];
  const docForProcessing = _.cloneDeep(doc);

  // 1. Custom "parsing" step: Traverse, transform $refs, collect parameterization info
  traverseAndPreprocessRefs(
    docForProcessing,
    [],
    parameterizationInfoList,
    baseFolder
  );

  // 2. Dereference using the standard mechanism with the preprocessed document
  const defaultOptions: any = {
    dereference: {
      circular: "ignore",
      excludedPathMatcher: (jsonPointerPath: string) => {
        const pathFragment = jsonPointerPath.includes("#")
          ? jsonPointerPath.substring(jsonPointerPath.indexOf("#") + 1)
          : jsonPointerPath;

        const segments = pathFragment
          .split("/")
          .filter((segment) => !_.isEmpty(segment));

        // Iterate through all actual path segments (keys or array indices).
        // Start from index 1 to skip the initial empty string if path starts with '#/'.
        for (let i = 0; i < segments.length; i++) {
          const currentSegment = segments[i];
          if (i === 0 && !C8yPactObjectKeys.includes(currentSegment)) {
            continue;
          }
          // We don't want to exclude based on the "$ref" keyword itself,
          // only based on its parent/ancestor keys.
          if (currentSegment === "$ref") {
            continue;
          }

          if (
            currentSegment === "jsonSchema" ||
            currentSegment.startsWith("$") ||
            currentSegment.startsWith("%24")
          ) {
            return true;
          }
        }
        return false;
      },
    },
    continueOnError: true,
    resolve: {
      file: {
        order: 1,
        canRead: /^file:/i,
        read: async (file: any) => {
          // Convert file:// URL to path and read using the current fs (which may be mocked)
          const filePath = fileURLToPath(file.url);
          return fs.readFileSync(filePath, "utf8");
        },
      },
    },
  };

  // Merge custom options with defaults
  const mergedOptions = _.merge({}, defaultOptions, parserOptions);

  const dereferencedDoc = await $RefParser.dereference(
    docForProcessing,
    mergedOptions
  );

  // 3. Post-Dereferencing Replacement
  const finalDoc = dereferencedDoc;
  for (const info of parameterizationInfoList) {
    const resolvedValueAtPath = getValueByPath(finalDoc, info.keyPath);
    if (typeof resolvedValueAtPath !== "undefined") {
      const replacedAndFinalValue = replacePlaceholdersInCopy(
        resolvedValueAtPath,
        info.params
      );
      setValueByPath(finalDoc, info.keyPath, replacedAndFinalValue);
    }
  }

  return _.pick(finalDoc, C8yPactObjectKeys) as C8yPact;
}

export function logJSONParserErrorGroup(
  error: JSONParserErrorGroup,
  logger: (...args: any[]) => any
) {
  if (!(error instanceof JSONParserErrorGroup)) return;

  logger(`  Error Type: JSONParserErrorGroup`);
  logger(`  Summary: ${error.message}`); // Main message from the error group

  logger(`  Individual Errors:`);
  error.errors.forEach((errorItem: JSONParserError, index: number) => {
    const errorPath =
      errorItem.path && Array.isArray(errorItem.path)
        ? errorItem.path.join("/")
        : "N/A";
    logger(`    Error ${index + 1}:`);
    logger(`      Name: ${errorItem.name}`);
    logger(`      Message: ${errorItem.message}`);
    logger(`      Path in Document: ${errorPath}`); // JSON Pointer path within the document
  });
}
