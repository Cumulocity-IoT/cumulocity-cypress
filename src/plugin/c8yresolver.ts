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
import { C8yDefaultPactMatcher } from "../shared/c8ypact/matcher";
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
      // $refs in excluded paths are not resolved, so they must not be rewritten
      if (isExcludedPath([...currentPath, nextPathSegment].map(String))) {
        continue;
      }
      traverseAndPreprocessRefs(
        value,
        [...currentPath, nextPathSegment],
        collectedParams,
        baseFolder
      );
    }
  }
}

/**
 * Checks if a path in the pact is excluded from dereferencing. Excluded are JSON
 * Schemas, as their $refs are schema references relative to the root of the schema,
 * not pact references. See {@link isSchemaKey}. Also excluded are other keys starting
 * with "$", such as the JSON Schema keyword "$defs".
 *
 * @param segments The segments of the path. For paths within external files, the
 * first segment is not checked unless it is a C8yPact key.
 */
function isExcludedPath(segments: string[]): boolean {
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
      isSchemaKey(currentSegment, segments[i - 1]) ||
      currentSegment.startsWith("$") ||
      currentSegment.startsWith("%24")
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if the value of a key in the pact is a JSON Schema:
 * - jsonSchema
 * - options.schema of a record, the schema passed to cy.c8yclient
 * - keys starting with "$" that are schema matcher keys, like "$body". JSON Schema
 *   keywords, like "$defs", are not.
 */
function isSchemaKey(key: string, parentKey?: string | number): boolean {
  if (key === "jsonSchema") return true;
  if (key === "schema" && parentKey === "options") return true;
  return (
    key.startsWith("$") && !C8yDefaultPactMatcher.JSON_SCHEMA_KEYWORDS.has(key)
  );
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

/**
 * Key that replaces "$ref" while resolving, for references that are kept as literal
 * values. $RefParser only processes keys named "$ref", so it neither resolves nor
 * loads these references.
 */
const LITERAL_REF_KEY = "\u0000c8y:literal:$ref";

/**
 * A $ref in a recorded request or response body that is kept as literal value.
 */
interface LiteralRefInfo {
  keyPath: (string | number)[]; // Path to the object containing this $ref
  ref: string;
}

/**
 * Parses the fragment of a $ref (without the leading "#") into JSON pointer segments.
 * Returns undefined if the fragment is not a JSON pointer, for example a JSON Schema
 * anchor like "#foo".
 */
function parseJsonPointer(fragment: string): string[] | undefined {
  if (fragment === "") return [];
  if (!fragment.startsWith("/")) return undefined;
  return fragment
    .substring(1)
    .split("/")
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // keep the segment as is if it is not valid percent-encoding
      }
      return decoded.replace(/~1/g, "/").replace(/~0/g, "~");
    });
}

/**
 * Checks if the JSON pointer segments resolve within root. Returns "ref" if the
 * pointer leads into an object with a $ref, so the target can only be found by
 * resolving that reference first.
 */
function resolvesPointer(root: any, segments: string[]): boolean | "ref" {
  let node = root;
  for (const segment of segments) {
    if (node == null || typeof node !== "object") return false;
    if (Object.prototype.hasOwnProperty.call(node, segment)) {
      node = node[segment];
    } else {
      return _.isString(node.$ref) ? "ref" : false;
    }
  }
  return true;
}

/**
 * Returns the file path for the location part of a $ref, or undefined if the location
 * is a URL with a scheme other than file:.
 */
function refLocationToFilePath(
  location: string,
  baseFolder?: string
): string | undefined {
  if (/^file:/i.test(location)) {
    try {
      return fileURLToPath(location);
    } catch {
      return undefined;
    }
  }
  if (path.isAbsolute(location)) return location;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(location)) return undefined;
  return path.resolve(baseFolder ?? process.cwd(), location);
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Splits a $ref into location, fragment (without "#"), and query (without "?").
 */
function splitRef(ref: string): {
  location: string;
  fragment: string;
  query?: string;
} {
  const queryIndex = ref.indexOf("?");
  const refWithoutQuery =
    queryIndex === -1 ? ref : ref.substring(0, queryIndex);
  const fragmentIndex = refWithoutQuery.indexOf("#");
  return {
    location:
      fragmentIndex === -1
        ? refWithoutQuery
        : refWithoutQuery.substring(0, fragmentIndex),
    fragment:
      fragmentIndex === -1 ? "" : refWithoutQuery.substring(fragmentIndex + 1),
    query: queryIndex === -1 ? undefined : ref.substring(queryIndex + 1),
  };
}

/**
 * Decides if a $ref in a recorded request or response body is a literal value of the
 * body, for example of a JSON Schema returned by a service, or a pact reference.
 *
 * - References to a URL, like https://, are literal.
 * - Internal references ("#/...") whose target exists within the body are literal,
 *   as "#" refers to the root of the body. This takes precedence over the pact.
 * - Internal references whose target exists in the pact, and references to existing
 *   files, are pact references.
 * - All other references are literal, as they can not be resolved.
 */
function isLiteralRef(
  ref: string,
  body: any,
  pact: any,
  baseFolder?: string
): boolean {
  const { location, fragment } = splitRef(ref);
  if (location === "") {
    const segments = parseJsonPointer(fragment);
    if (segments == null) return true;
    if (resolvesPointer(body, segments) === true) return true;
    return resolvesPointer(pact, segments) === false;
  }

  const filePath = refLocationToFilePath(location, baseFolder);
  return filePath == null || !isFile(filePath);
}

function collectRefs(
  node: any,
  currentPath: (string | number)[],
  collected: LiteralRefInfo[]
): void {
  if (node == null || typeof node !== "object") return;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (key === "$ref" && _.isString(value)) {
      collected.push({ keyPath: currentPath, ref: value });
    } else if (typeof value === "object" && value !== null) {
      const segment = Array.isArray(node) ? parseInt(key) : key;
      collectRefs(value, [...currentPath, segment], collected);
    }
  }
}

/**
 * Finds the $ref references in recorded request and response bodies of the pact
 * that are literal values. See {@link isLiteralRef}.
 */
function findLiteralRefs(pact: any, baseFolder?: string): LiteralRefInfo[] {
  const literalRefs: LiteralRefInfo[] = [];
  if (!Array.isArray(pact?.records)) return literalRefs;

  pact.records.forEach((record: any, index: number) => {
    for (const key of ["request", "response"]) {
      const body = record?.[key]?.body;
      if (body == null || typeof body !== "object") continue;

      const refs: LiteralRefInfo[] = [];
      collectRefs(body, ["records", index, key, "body"], refs);
      literalRefs.push(
        ...refs.filter((info) =>
          isLiteralRef(info.ref, body, pact, baseFolder)
        )
      );
    }
  });
  return literalRefs;
}

/**
 * Finds the $ref references to http(s) URLs in the pact, outside of recorded bodies
 * as these are covered by {@link findLiteralRefs}. Without http resolver, $RefParser
 * can not load these references, so they are kept as literal values.
 */
function findUrlRefs(pact: any): LiteralRefInfo[] {
  const refs: LiteralRefInfo[] = [];
  collectRefs(pact, [], refs);
  return refs.filter(
    (info) =>
      /^https?:\/\//i.test(info.ref) &&
      !(
        info.keyPath[0] === "records" &&
        ["request", "response"].includes(info.keyPath[2] as string) &&
        info.keyPath[3] === "body"
      )
  );
}

/**
 * Renames a key of an object in place, keeping the order of the keys.
 */
function renameKey(obj: Record<string, any>, from: string, to: string): void {
  const entries = Object.entries(obj);
  for (const key of Object.keys(obj)) {
    delete obj[key];
  }
  for (const [key, value] of entries) {
    obj[key === from ? to : key] = value;
  }
}

/**
 * Renames all LITERAL_REF_KEY keys back to "$ref". Objects can be referenced from
 * more than one location after dereferencing, so the whole document is traversed.
 */
function restoreLiteralRefs(node: any, visited = new WeakSet<object>()): void {
  if (node == null || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);
  if (Object.prototype.hasOwnProperty.call(node, LITERAL_REF_KEY)) {
    renameKey(node, LITERAL_REF_KEY, "$ref");
  }
  for (const value of Object.values(node)) {
    restoreLiteralRefs(value, visited);
  }
}

/**
 * Finds the JSON Schemas in the pact, see {@link isSchemaKey}. Schemas within
 * schemas are not returned.
 */
function findSchemas(
  node: any,
  currentPath: (string | number)[],
  collected: (string | number)[][]
): void {
  if (node == null || typeof node !== "object") return;
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (value == null || typeof value !== "object") continue;
    const segment = Array.isArray(node) ? parseInt(key) : key;
    const keyPath = [...currentPath, segment];
    if (
      !Array.isArray(node) &&
      isSchemaKey(key, currentPath[currentPath.length - 1])
    ) {
      collected.push(keyPath);
    } else {
      findSchemas(value, keyPath, collected);
    }
  }
}

/**
 * Inlines the $refs to files in the JSON Schemas of the pact, see {@link isSchemaKey}.
 * Uses $RefParser.bundle(), so a $ref within a file is rewritten to point to its new
 * location in the schema, and a schema that refers to itself is kept as a $ref.
 *
 * Internal $refs ("#/definitions/x") of the schema are kept, as they refer to the root
 * of the schema and not of the pact. $refs that can not be inlined, for example to a
 * missing file, are kept as they are.
 *
 * @returns The number of $refs that are hidden with LITERAL_REF_KEY.
 */
async function bundleSchemaFileRefs(
  doc: any,
  baseFolder: string | undefined,
  parserOptions: any,
  log?: (message: string) => void
): Promise<number> {
  const schemaPaths: (string | number)[][] = [];
  findSchemas(doc, [], schemaPaths);

  let hiddenRefs = 0;
  for (const schemaPath of schemaPaths) {
    const schema = getValueByPath(doc, schemaPath);
    const refs: LiteralRefInfo[] = [];
    collectRefs(schema, [], refs);

    let fileRefs = 0;
    for (const info of refs) {
      const holder = info.keyPath.length
        ? getValueByPath(schema, info.keyPath)
        : schema;
      const refPath = [...schemaPath, ...info.keyPath].join("/");
      const { location, fragment, query } = splitRef(info.ref);

      let fileUrl: string | undefined = undefined;
      let reason: string | undefined = undefined;
      if (location !== "") {
        const filePath = refLocationToFilePath(location, baseFolder);
        if (query != null) {
          reason = "parameters are not supported in JSON Schemas";
        } else if (filePath == null || !isFile(filePath)) {
          reason = "it does not refer to a file";
        } else if (parseJsonPointer(fragment) == null) {
          reason = "its fragment is not a JSON pointer";
        } else {
          fileUrl = pathToFileURL(filePath).href;
        }
      }

      if (fileUrl != null) {
        holder.$ref = fragment ? `${fileUrl}#${fragment}` : fileUrl;
        fileRefs++;
      } else {
        // internal $refs of the schema, and $refs that can not be inlined
        if (reason != null) {
          log?.(`Keeping $ref "${info.ref}" at ${refPath} as ${reason}.`);
        }
        renameKey(holder, "$ref", LITERAL_REF_KEY);
        hiddenRefs++;
      }
    }

    if (fileRefs === 0) continue;

    log?.(`Inlining $refs to files in JSON Schema at ${schemaPath.join("/")}.`);
    const base = pathToFileURL(
      path.join(path.resolve(baseFolder ?? process.cwd()), path.sep)
    ).href;
    const bundled = await $RefParser.bundle(base, schema, parserOptions);
    setValueByPath(doc, schemaPath, _.cloneDeep(bundled));
  }
  return hiddenRefs;
}

/**
 * Resolver for file: URLs. Required, as the plugin loads @c8y/client, which loads
 * isomorphic-cometd. Its Node.js implementation cometd-nodejs-client defines a global
 * `window`. The built-in file resolver of $RefParser then assumes it runs in a
 * browser and does not read any file, failing with "UnmatchedResolverError: Could not
 * find resolver for file://...". Reading with `fs` also supports a mocked `fs` in tests.
 */
const fileResolver = {
  order: 1,
  canRead: /^file:/i,
  read: async (file: any) => {
    const filePath = fileURLToPath(file.url);
    return fs.readFileSync(filePath, "utf8");
  },
};

export async function resolveRefs(
  doc: C8yPact,
  baseFolder?: string, // Optional base folder for resolving relative file paths
  parserOptions?: any, // Optional custom options for $RefParser
  log?: (message: string) => void
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

  // 0. Hide $refs in recorded bodies that are literal values from $RefParser. The
  // recorded data itself is not changed, the keys are restored after dereferencing.
  const literalRefs = findLiteralRefs(doc, baseFolder);
  // http(s) $refs are only loaded if the http resolver is enabled with parserOptions
  if (!_.get(parserOptions, ["resolve", "http"])) {
    literalRefs.push(...findUrlRefs(doc));
  }
  for (const info of literalRefs) {
    log?.(
      `Keeping $ref "${info.ref}" at ${info.keyPath.join("/")} as literal value.`
    );
    const holder = getValueByPath(docForProcessing, info.keyPath);
    renameKey(holder, "$ref", LITERAL_REF_KEY);
  }

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
        return isExcludedPath(segments);
      },
    },
    continueOnError: true,
    resolve: {
      // Do not load $refs to http(s) URLs. Loading a pact must not make network
      // requests to URLs found in the pact. Enable with parserOptions if needed.
      http: false,
      file: fileResolver,
    },
  };

  // Merge custom options with defaults
  const mergedOptions = _.merge({}, defaultOptions, parserOptions);

  // 1. Inline $refs to files in JSON Schemas, which are excluded from dereferencing
  const hiddenSchemaRefs = await bundleSchemaFileRefs(
    docForProcessing,
    baseFolder,
    mergedOptions,
    log
  );

  // 2. Custom "parsing" step: Traverse, transform $refs, collect parameterization info
  traverseAndPreprocessRefs(
    docForProcessing,
    [],
    parameterizationInfoList,
    baseFolder
  );

  // 3. Dereference using the standard mechanism with the preprocessed document
  const dereferencedDoc = await $RefParser.dereference(
    docForProcessing,
    mergedOptions
  );

  // 4. Post-Dereferencing Replacement
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

  if (literalRefs.length > 0 || hiddenSchemaRefs > 0) {
    restoreLiteralRefs(finalDoc);
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
