import _ from "lodash";
import { parse } from "date-fns";

export function parseDate(
  date: string | number | Date,
  format: string
): Date | undefined {
  let parsedDate: Date | undefined = undefined;
  // try to parse as number fist, if string is passed it might be converted without format being used
  if (_.isNumber(date)) {
    parsedDate = new Date(date);
  }

  // parse with format
  if (!isValidDate(parsedDate) && _.isString(date)) {
    parsedDate = parse(<string>date, format, new Date());

    // if (!isValidDate(parsedDate) && _.isString(date)) {
    //   parsedDate = new Date(date);
    // }
  }
  if (!isValidDate(parsedDate)) {
    parsedDate = undefined;
  }
  return parsedDate;
}

export function isValidDate(date?: Date): boolean {
  return date != null && !isNaN(<any>date) && _.isDate(date);
}

export function normalizeLocaleId(localeId: string): string {
  return localeId.toLowerCase().replace(/_/g, "-");
}

