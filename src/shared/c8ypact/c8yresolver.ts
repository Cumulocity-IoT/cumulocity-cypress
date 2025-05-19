import $RefParser from "@apidevtools/json-schema-ref-parser";
import { URLSearchParams } from "url";

import lodash1 from "lodash";
import * as lodash2 from "lodash";
const _ = lodash1 || lodash2;

interface RefParameterizationInfo {
  // Path to the property in the document that, after dereferencing, will hold the resolved content.
  keyPath: (string | number)[];
  params: Record<string, string>;
  originalRefValue: string; // For debugging/context
}

// Helper: Recursively find $ref properties, normalize them, and collect parameterization info.
// Modifies the documentNode in place.
function traverseAndPreprocessRefs(
  currentNode: any,
  currentPath: (string | number)[], // Path to the currentNode
  collectedParams: RefParameterizationInfo[]
): void {
  if (typeof currentNode !== "object" || currentNode === null) {
    return;
  }

  for (const key in currentNode) {
    if (Object.prototype.hasOwnProperty.call(currentNode, key)) {
      const value = currentNode[key];

      if (key === "$ref" && _.isString(value)) {
        const queryIndex = value.indexOf("?");

        if (queryIndex !== -1) {
          // Query parameters are present
          const baseRef = value.substring(0, queryIndex);
          const queryString = value.substring(queryIndex + 1);

          const params: Record<string, string> = {};
          new URLSearchParams(queryString).forEach((paramValue, paramKey) => {
            params[paramKey] = paramValue;
          });

          collectedParams.push({
            keyPath: [...currentPath], // Path to the object containing this $ref
            params,
            originalRefValue: value, // Store the original $ref with its parameters
          });
          // Update the $ref in the document to its base form (without parameters)
          currentNode[key] = baseRef;
        }
        // If queryIndex === -1 (no query parameters), the $ref string 'value'
        // in currentNode[key] is left untouched, fulfilling "keep $ref as is".
        // No conversion to file:// URI or other alteration of the base $ref path occurs.
      } else if (typeof value === "object") {
        const nextPathSegment = Array.isArray(currentNode)
          ? parseInt(key)
          : key;
        traverseAndPreprocessRefs(
          value,
          [...currentPath, nextPathSegment],
          collectedParams
        );
      }
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
  params: Record<string, string>
): any {
  if (_.isString(target)) {
    let result = target;
    for (const key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        const placeholder = `{{${key}}}`;
        result = result.split(placeholder).join(params[key]); // Basic global replacement
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

export async function resolvePact(doc: any): Promise<any> {
  if (doc == null || typeof doc !== "object") {
    return doc;
  }

  const parameterizationInfoList: RefParameterizationInfo[] = [];
  // Work on a deep clone for preprocessing to avoid modifying the original input `doc`
  const docForProcessing = _.cloneDeep(doc);

  // 1. Custom "parsing" step: Traverse and modify $refs, collect parameterization info
  traverseAndPreprocessRefs(docForProcessing, [], parameterizationInfoList);

  // 2. Dereference using the standard mechanism with the preprocessed document
  const dereferencedDoc = await $RefParser.dereference(docForProcessing, {
    dereference: {
      // Handles circular references by replacing them with a placeholder
      circular: "ignore",
    },
  });

  // 3. Post-Dereferencing Replacement
  // Operate on a clone of the dereferenced doc for the final output to ensure no side effects
  const finalDoc = _.cloneDeep(dereferencedDoc);

  for (const info of parameterizationInfoList) {
    // info.keyPath points to the object that *contained* the $ref.
    // This path in finalDoc should now hold the fully resolved (but not yet parameterized) content.
    const resolvedValueAtPath = getValueByPath(finalDoc, info.keyPath);

    if (typeof resolvedValueAtPath !== "undefined") {
      const replacedAndFinalValue = replacePlaceholdersInCopy(
        resolvedValueAtPath,
        info.params
      );
      setValueByPath(finalDoc, info.keyPath, replacedAndFinalValue);
    }
  }

  return finalDoc;
}
