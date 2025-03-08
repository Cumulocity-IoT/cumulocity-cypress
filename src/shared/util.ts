import _ from "lodash";

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
    '$1$2$3: $4***$5$6'
  );
}

export function toBoolean(input: string, defaultValue: boolean): boolean {
  if (input == null || !_.isString(input)) return defaultValue;
  const booleanString = input.toString().toLowerCase();
  if (booleanString == "true" || booleanString === "1") return true;
  if (booleanString == "false" || booleanString === "0") return false;
  return defaultValue;
}