// default locales to be registered automatically
import localeDe from "@angular/common/locales/de";
import localeEn from "@angular/common/locales/en-GB";

import { normalizeLocaleId } from "../../shared/date";
import { getLastDefinedValue, shortestUniquePrefixes } from "../../shared/util";

import { Locale } from "date-fns";
import * as dateFnsDe from "date-fns/locale/de";
import * as dateFnsEnGB from "date-fns/locale/en-GB";

const { _ } = Cypress;

// https://angular.io/api/common/DatePipe#pre-defined-format-options
// https://github.com/angular/angular/blob/9847085448feff29ac6d51493e224250990c3ff0/packages/common/src/pipes/date_pipe.ts#L58
// not imported from @angular/common to avoid requiring jit at runtime
export enum FormatWidth {
  Short,
  Medium,
  Long,
  Full,
}

export { localeDe, localeEn };

// Some i18n functions from Angular are used directly in here. This is required to not have Angular in a particular
// version as a dependency of this package. locales must be imported in the tests with the version used in the project.

// See as sources:
// https://github.com/angular/angular/tree/6f5dabe0d25a5660b7c3001041449b4622dd8924/packages/core/src/i18n
// https://github.com/angular/angular/tree/6f5dabe0d25a5660b7c3001041449b4622dd8924/packages/common/src/i18n
// https://github.com/angular/angular/blob/6f5dabe0d25a5660b7c3001041449b4622dd8924/packages/common/src/i18n/locale_data_api.ts
// https://github.com/angular/angular/blob/6f5dabe0d25a5660b7c3001041449b4622dd8924/packages/core/src/i18n/locale_data_api.ts

export enum NgLocaleDataIndex {
  LocaleId = 0,
  DayPeriodsFormat,
  DayPeriodsStandalone,
  DaysFormat,
  DaysStandalone,
  MonthsFormat,
  MonthsStandalone,
  Eras,
  FirstDayOfWeek,
  WeekendRange,
  DateFormat,
  TimeFormat,
  DateTimeFormat,
  NumberSymbols,
  NumberFormats,
  CurrencyCode,
  CurrencySymbol,
  CurrencyName,
  Currencies,
  Directionality,
  PluralCase,
  ExtraData,
  DfnsLocale,
}

const LOCALE_DATA: any = {};

export function getNgLocaleId(locale: string): string {
  const data = getNgLocale(locale);
  return data[NgLocaleDataIndex.LocaleId];
}

/**
 * Registers a locale with the given ID and data. Registered locale can be used
 * with `cy.setLanguage` to set the locale for date formatting and other 
 * locale-specific operations in `cy.toDate`, `cy.toISODate`, etc.
 * @param c8yLocaleId The Cumulocity locale ID (e.g., "en", "de").
 * @param angularLocale The Angular locale data.
 * @param dfnsLocale The date-fns locale data (optional).
 * @param extraData Additional data to be stored in the locale (optional).
 */
export function registerLocale(
  c8yLocaleId: string,
  angularLocale: unknown[],
  dfnsLocale: Locale | null = null,
  extraData: unknown = undefined
) {
  const angularId = normalizeLocaleId(c8yLocaleId);
  LOCALE_DATA[angularId] = angularLocale;
  if (extraData) {
    LOCALE_DATA[angularId][NgLocaleDataIndex.ExtraData] = extraData;
  }

  LOCALE_DATA[angularId][NgLocaleDataIndex.DfnsLocale] = {
    ...(dfnsLocale || {}),
    localize: {
      ...dfnsLocale?.localize,
      month: buildLocalizeFn({
        values: monthValuesForLocale(angularId),
        defaultWidth: "wide",
      }),
      day: buildLocalizeFn({
        values: dayValuesForLocale(angularId),
        defaultWidth: "wide",
      }),
    },
    // node_modules/date-fns/locale/en-US/_lib/match/index.js
    match: {
      ...dfnsLocale?.match,
      month: buildMatchFn({
        matchPatterns: matchMonthPatterns(angularId),
        defaultMatchWidth: "wide",
        parsePatterns: parseMonthPatterns(angularId),
        defaultParseWidth: "any",
      }),
      day: buildMatchFn({
        matchPatterns: matchDayPatterns(angularId),
        defaultMatchWidth: "wide",
        parsePatterns: parseDayPatterns(angularId),
        defaultParseWidth: "any",
      }),
    },
  };
}

/**
 * Registers default locales `de` and `en` with their respective 
 * Angular and date-fns locales for use in tests.
 */
export function registerDefaultLocales() {
  registerLocale(
    "de",
    // @ts-expect-error
    !isModule(localeDe) ? localeDe : localeDe.default,
    (dateFnsDe as any).default || (dateFnsDe as any)
  );
  registerLocale(
    "en",
    // @ts-expect-error
    !isModule(localeEn) ? localeEn : localeEn.default,
    (dateFnsEnGB as any).default || (dateFnsEnGB as any)
  );
}

export function getNgLocale(localeId: string): any {
  const getNgLocaleData = (localeId: string) => {
    const normalizedLocale = normalizeLocaleId(localeId);
    if (!(normalizedLocale in LOCALE_DATA)) {
      LOCALE_DATA[normalizedLocale] =
        // @ts-expect-error
        globalThis.ng?.common?.locales?.[normalizedLocale];
    }
    return LOCALE_DATA[normalizedLocale];
  };

  const normalizedLocale = normalizeLocaleId(localeId);
  let match = getNgLocaleData(normalizedLocale);
  if (match) {
    return match;
  }
  // let's try to find a parent locale
  const parentLocale = normalizedLocale.split("-")[0];
  match = getNgLocaleData(parentLocale);
  if (match) {
    return match;
  }
  throw new Error(`Missing locale data for the locale "${localeId}".`);
}

export function localizedTimeFormat(
  localeId: string = "en",
  formatWidth: FormatWidth | number = FormatWidth.Short
): string {
  return getLocaleValue(localeId, NgLocaleDataIndex.TimeFormat, formatWidth);
}

export function localizedDateFormat(
  localeId: string = "en",
  formatWidth: FormatWidth | number = FormatWidth.Short
): string {
  return getLocaleValue(localeId, NgLocaleDataIndex.DateFormat, formatWidth);
}

export function localizedDateTimeFormat(
  localeId: string = "en",
  formatWidth: FormatWidth | number = FormatWidth.Short
): string {
  const fullTime = getLocaleValue(
    localeId,
    NgLocaleDataIndex.TimeFormat,
    formatWidth
  );
  const fullDate = getLocaleValue(
    localeId,
    NgLocaleDataIndex.DateFormat,
    formatWidth
  );
  return formatDateTime(
    getLocaleValue(localeId, NgLocaleDataIndex.DateTimeFormat, formatWidth),
    [fullTime, fullDate]
  );
}

// https://github.com/angular/angular/blob/fe691935091aaf7090864c8111a15f7cc7e53b6c/packages/common/src/i18n/format_date.ts#L201
function formatDateTime(str: string, opt_values: any): string {
  if (opt_values) {
    str = str.replace(/\{([^}]+)}/g, function (match, key) {
      return opt_values != null && key in opt_values ? opt_values[key] : match;
    });
  }
  return str;
}

function isModule(module: any): boolean {
  return (
    // @ts-expect-error
    module && _.isObject(module) && module.default && !_.isEmpty(module.default)
  );
}

function getLocaleValue(
  locale: string,
  index: NgLocaleDataIndex,
  width: FormatWidth
): string {
  const data = getNgLocale(locale);
  const result = getLastDefinedValue<string>(data[index], width);
  if (!result) {
    throw new Error(
      `Missing value for locale "${locale}" and width "${width}".`
    );
  }
  return result;
}

// var parseDayPatterns = {
//   narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
//   any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i]
// };
function parseDayPatterns(locale: string): {
  narrow: RegExp[];
  any: RegExp[];
} | null {
  const l = getNgLocale(locale);
  if (!l) return null;

  const dayData =
    l[NgLocaleDataIndex.DaysStandalone] ?? l[NgLocaleDataIndex.DaysFormat];
  const result = {
    narrow: dayData[0].map(
      (m: string) => new RegExp("^" + _.lowerCase(m).substring(0, 1), "i")
    ),
    any: shortestUniquePrefixes(dayData[2]).map(
      (m: string) => new RegExp("^" + _.lowerCase(m), "i")
    ),
  };
  return result;
}

// var matchDayPatterns = {
//   narrow: /^[smdmf]/i,
//   short: /^(so|mo|di|mi|do|fr|sa)/i,
//   abbreviated: /^(son?|mon?|die?|mit?|don?|fre?|sam?)\.?/i,
//   wide: /^(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)/i
// };
function matchDayPatterns(locale: string): any | null {
  const l = getNgLocale(locale);
  if (!l) return null;

  const dayData =
    l[NgLocaleDataIndex.DaysStandalone] ?? l[NgLocaleDataIndex.DaysFormat];
  const result = {
    narrow: new RegExp("^[" + _.uniq(dayData[0]).join("|") + "]", "i"),
    short: new RegExp("^(" + _.uniq(dayData[3]).join("|") + ")", "i"),
    abbreviated: new RegExp("^(" + dayData[1].join("|") + ")", "i"),
    wide: new RegExp("^(" + dayData[2].join("|") + ")", "i"),
  };
  return result;
}

function parseMonthPatterns(locale: string): {
  narrow: RegExp[];
  any: RegExp[];
} | null {
  const l = getNgLocale(locale);
  if (!l) return null;

  const monthData =
    l[NgLocaleDataIndex.MonthsStandalone] ?? l[NgLocaleDataIndex.MonthsFormat];
  const result = {
    narrow: monthData[0].map(
      (m: string) => new RegExp("^" + _.lowerCase(m).substring(0, 1), "i")
    ),
    any: shortestUniquePrefixes(monthData[2]).map(
      (m: string) => new RegExp("^" + _.lowerCase(m), "i")
    ),
  };
  return result;
}

function matchMonthPatterns(locale: string): {
  narrow: RegExp;
  abbreviated: RegExp;
  wide: RegExp;
} | null {
  const l = getNgLocale(locale);
  if (!l) return null;

  const monthData =
    l[NgLocaleDataIndex.MonthsStandalone] ?? l[NgLocaleDataIndex.MonthsFormat];
  const result = {
    narrow: new RegExp("^[" + _.uniq(monthData[0]).join("|") + "]", "i"),
    abbreviated: new RegExp("^(" + monthData[1].join("|") + ")", "i"),
    wide: new RegExp("^(" + monthData[2].join("|") + ")", "i"),
  };
  return result;
}

function monthValuesForLocale(locale: string): {
  narrow: string[];
  abbreviated: string[];
  wide: string[];
} | null {
  const l = getNgLocale(locale);
  if (!l) return null;

  const monthData =
    l[NgLocaleDataIndex.MonthsStandalone] ?? l[NgLocaleDataIndex.MonthsFormat];
  const result = {
    narrow: monthData[0],
    abbreviated: monthData[1],
    wide: monthData[2],
  };
  return result;
}

function dayValuesForLocale(locale: string): {
  narrow: string[];
  abbreviated: string[];
  wide: string[];
} | null {
  const l = getNgLocale(locale);
  if (!l) return null;

  const monthData =
    l[NgLocaleDataIndex.DaysStandalone] ?? l[NgLocaleDataIndex.DaysFormat];
  const result = {
    narrow: monthData[0],
    abbreviated: monthData[1],
    wide: monthData[2],
  };
  return result;
}

// Copied from date-fns as data-fns does not allow importing from locale files
// See https://github.com/date-fns/date-fns/issues/3686

function buildLocalizeFn(args: any) {
  return (value: any, options: any) => {
    const context = options?.context ? String(options.context) : "standalone";

    let valuesArray;
    if (context === "formatting" && args.formattingValues) {
      const defaultWidth = args.defaultFormattingWidth || args.defaultWidth;
      const width = options?.width ? String(options.width) : defaultWidth;

      valuesArray =
        args.formattingValues[width] || args.formattingValues[defaultWidth];
    } else {
      const defaultWidth = args.defaultWidth;
      const width = options?.width ? String(options.width) : args.defaultWidth;

      valuesArray = args.values[width] || args.values[defaultWidth];
    }
    const index = args.argumentCallback ? args.argumentCallback(value) : value;

    return valuesArray[index];
  };
}

export function buildMatchFn(args: any) {
  return (string: string, options: any = {}) => {
    const width = options.width;

    const matchPattern =
      (width && args.matchPatterns[width]) ||
      args.matchPatterns[args.defaultMatchWidth];
    const matchResult = string.match(matchPattern);

    if (!matchResult) {
      return null;
    }
    const matchedString = matchResult[0];

    const parsePatterns =
      (width && args.parsePatterns[width]) ||
      args.parsePatterns[args.defaultParseWidth];

    const key = Array.isArray(parsePatterns)
      ? findIndex(parsePatterns, (pattern: RegExp) =>
          pattern.test(matchedString)
        )
      : // [TODO] -- I challenge you to fix the type
        findKey(parsePatterns, (pattern: RegExp) =>
          pattern.test(matchedString)
        );

    let value;

    value = args.valueCallback ? args.valueCallback(key) : key;
    value = options.valueCallback
      ? // [TODO] -- I challenge you to fix the type
        options.valueCallback(value)
      : value;

    const rest = string.slice(matchedString.length);

    return { value, rest };
  };
}

function findKey(object: any, predicate: any) {
  for (const key in object) {
    if (
      Object.prototype.hasOwnProperty.call(object, key) &&
      predicate(object[key])
    ) {
      return key;
    }
  }
  return undefined;
}

function findIndex(array: any, predicate: any) {
  for (let key = 0; key < array.length; key++) {
    if (predicate(array[key])) {
      return key;
    }
  }
  return undefined;
}
