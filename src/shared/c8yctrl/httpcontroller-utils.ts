/* eslint-disable import/no-named-as-default-member */
import _ from "lodash";

export function toBoolean(input: string, defaultValue: boolean): boolean {
  if (input == null || !_.isString(input)) return defaultValue;
  const booleanString = input.toString().toLowerCase();
  if (booleanString == "true" || booleanString === "1") return true;
  if (booleanString == "false" || booleanString === "0") return false;
  return defaultValue;
}
