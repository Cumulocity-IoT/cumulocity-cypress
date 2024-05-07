// default locales to be registered automatically
import localeDe from "@angular/common/locales/de";
import localeEn from "@angular/common/locales/en-GB";

// @ts-expect-error
import buildLocalizeFn from "date-fns/locale/_lib/buildLocalizeFn";
// @ts-expect-error
import buildMatchFn from "date-fns/locale/_lib/buildMatchFn";
import { shortestUniquePrefixes } from "./localeutil";

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

export async function registerLocale(
  data: unknown[],
  c8yLocaleId: string,
  extraData: unknown = undefined,
  localeId?: string
) {
  const angularId = normalizeLocaleId(c8yLocaleId);
  LOCALE_DATA[angularId] = data;
  if (extraData) {
    LOCALE_DATA[angularId][NgLocaleDataIndex.ExtraData] = extraData;
  }

  const dfnsLocale = await loadDfnsLocale(getNgLocaleId(c8yLocaleId), localeId);
  LOCALE_DATA[angularId][NgLocaleDataIndex.DfnsLocale] = {
    ...dfnsLocale,
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

export async function registerDefaultLocales() {
  await registerLocale(
    // @ts-expect-error
    !isModule(localeDe) ? localeDe : localeDe.default,
    "de"
  );
  await registerLocale(
    // @ts-expect-error
    !isModule(localeEn) ? localeEn : localeEn.default,
    "en"
  );
}

function normalizeLocaleId(localeId: string): string {
  return localeId.toLowerCase().replace(/_/g, "-");
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
  return getLocaleTimeFormat(localeId, formatWidth);
}

export function localizedDateFormat(
  localeId: string = "en",
  formatWidth: FormatWidth | number = FormatWidth.Short
): string {
  return getLocaleDateFormat(localeId, formatWidth);
}

export function localizedDateTimeFormat(
  localeId: string = "en",
  formatWidth: FormatWidth | number = FormatWidth.Short
): string {
  const fullTime = getLocaleTimeFormat(localeId, formatWidth);
  const fullDate = getLocaleDateFormat(localeId, formatWidth);
  return formatDateTime(getLocaleDateTimeFormat(localeId, formatWidth), [
    fullTime,
    fullDate,
  ]);
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
    parsedDate = Cypress.datefns.parse(<string>date, format, new Date());

    // if (!isValidDate(parsedDate) && _.isString(date)) {
    //   parsedDate = new Date(date);
    // }
  }
  return parsedDate;
}

export function isValidDate(date?: Date): boolean {
  return date != null && !isNaN(<any>date) && _.isDate(date);
}

function isModule(module: any): boolean {
  return (
    // @ts-expect-error
    module && _.isObject(module) && module.default && !_.isEmpty(module.default)
  );
}

function getLastDefinedValue<T>(data: T[], index: number): T {
  for (let i = index; i > -1; i--) {
    if (typeof data[i] !== "undefined") {
      return data[i];
    }
  }
  throw new Error("Locale data API: locale data undefined");
}

function getLocaleTimeFormat(
  locale: string,
  width: FormatWidth | number
): string {
  const data = getNgLocale(locale);
  return getLastDefinedValue(data[NgLocaleDataIndex.TimeFormat], width);
}

function getLocaleDateFormat(
  locale: string,
  width: FormatWidth | number
): string {
  const data = getNgLocale(locale);
  return getLastDefinedValue(data[NgLocaleDataIndex.DateFormat], width);
}

function getLocaleDateTimeFormat(
  locale: string,
  width: FormatWidth | number
): string {
  const data = getNgLocale(locale);
  const dateTimeFormatData = <string[]>data[NgLocaleDataIndex.DateTimeFormat];
  return getLastDefinedValue(dateTimeFormatData, width);
}

async function loadDfnsLocale(
  angularLocaleId: string,
  dfnsLocaleId?: string
): Promise<Locale | null> {
  const load: (locale: string) => Promise<Locale> = async (locale: string) => {
    try {
      const l = await import(`date-fns/locale/${locale}/`);
      return l.default;
    } catch (e) {
      console.error(e);
      return null;
    }
  };
  if (!angularLocaleId && !dfnsLocaleId) return null;

  const r = load(dfnsLocaleId ?? angularLocaleId);
  if (r) {
    return r;
  }

  return null;
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
