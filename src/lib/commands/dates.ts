import {
  FormatWidth,
  NgLocaleDataIndex,
  getNgLocale,
  getNgLocaleId,
  localizedDateFormat,
  localizedDateTimeFormat,
  localizedTimeFormat,
  registerDefaultLocales,
  registerLocale,
} from "../locale/locale";

import * as dateFns from "date-fns";
export { Locale } from "date-fns";

import { throwError } from "../utils";
import { isValidDate, parseDate } from "../../shared/date";

const { _ } = Cypress;

declare global {
  namespace Cypress {
    interface Chainable extends ChainableWithState {
      /**
       * Creates a `Date` object from given string or number input. Supported strings must be created using the Cumulocity `c8yDate` or Angular `date` pipes. Format is detected automatically for reading the strings based on locale set via `cy.setLanguage`. Supported formats are datetime, time, date.
       *
       * Configuration is available via `options` as optional argument.
       *
       * English (en) and german (de) locales are registered by default. If any other locale is required, the locale must be imported in your Cypress support file.
       *
       * @example
       * cy.setLanguage("en");
       * cy.wrap("26 May 2023, 15:59:00").toDate().then((date) => {
       *   // do something with date
       * })
       * cy.toDate("26 May 2023, 15:59:00").then((date) => {
       *   // do something with date
       * })
       *
       * @see registerLocale
       * @see registerDefaultLocales
       * @see https://date-fns.org/v2.30.0/docs/format
       *
       * @param {ISODateSource} source string or number of an array of strings or numbers to convert into a date
       * @param {ISODateOptions} options the configuration options for date processing
       */
      toDate<T = Date | Date[]>(
        source?: ISODateSource,
        options?: ISODateOptions
      ): Chainable<T | undefined>;
      toDate<T = Date | Date[]>(
        options?: ISODateOptions
      ): Chainable<T | undefined>;

      /**
       * Creates an ISO formatted date string from given or yielded string or number input. Use `cy.toDate()` for reading the date and converts into ISO date.
       *
       * @example
       * cy.setLanguage("en");
       * cy.wrap("26 May 2023, 15:59:00").toISODate().then((date) => {
       *   // do something with date
       * })
       * cy.toISODate("26 May 2023, 15:59:00").then((date) => {
       *   // do something with date
       * })
       *
       * @see toDate
       * @see registerLocale
       * @see registerDefaultLocales
       * @see https://date-fns.org/v2.30.0/docs/format
       *
       * @param {ISODateSource} source string or number of an array of strings or numbers to convert into a date
       * @param {ISODateOptions} options the configuration options for date processing
       */
      toISODate<T = ISODateSource>(
        source?: T,
        options?: ISODateOptions
      ): Chainable<string | string[] | undefined>;
      toISODate(
        options?: ISODateOptions
      ): Chainable<string | string[] | undefined>;

      /**
       * Returns the Angular date format string used to format the given source string. If no format is found, `undefined` is returned.
       *
       * @param source date string formatted using Angular `date` or Cumulocity `c8yDate` pipe
       * @param options the configuration options
       */
      dateFormat(
        source?: string,
        options?: Pick<ISODateOptions, "invalid" | "language" | "log">
      ): Chainable<string | undefined>;
      dateFormat(
        options?: Pick<ISODateOptions, "invalid" | "language" | "log">
      ): Chainable<string | undefined>;

      /**
       * Compare Cumulocity `c8yDate` or Angular `date` pipe formatted string with a `Date` object or an ISO date string as used in Cumulocity REST API.
       *
       * Comparing is done by formatting the `target` using the format of the source string. This way only the relevant components of the date will be compared.
       *
       * @example
       * cy.setLanguage("en");
       * cy.compareDates("25/05/2023", new Date()).should("eq", true);
       * cy.compareDates("25/05/2023, 16:22", "2023-05-25T14:22:12.320Z").should("eq", true);
       *
       * @param source date string formatted using Angular `date` or Cumulocity `c8yDate` pipe
       * @param target `Date`or ISO date string to compare with
       * @param options the configuration options
       */
      compareDates(
        source: string,
        target: Date | number | string,
        options?: Pick<ISODateOptions, "invalid" | "language" | "log">
      ): Chainable<boolean>;
      compareDates(
        target: Date | number | string,
        options?: Pick<ISODateOptions, "invalid" | "language" | "log">
      ): Chainable<boolean>;
    }

    interface Cypress {
      datefns: typeof dateFns;
    }
  }

  type ISODateSource = string | string[] | number | number[];

  interface ISODateOptions {
    /** Override format used to read the formatted date string. */
    format?: string;
    /** Override language used to read the formatted date string. */
    language?: string;
    /** Use given FormatWith to read the formatted date string. */
    formatWidth?: FormatWidth;
    /** Enable or disable logging to debug console. Defaults to `true`.*/
    log?: boolean;
    /** How to process invalid date strings. `Keep` to just use input string as value, `throw` to throw an exception and `ignore` to just ignore in output. */
    invalid?: "keep" | "ignore" | "throw";
    /** If `strictFormats` is enabled, only the Angular date formats will be used. If disabled, also other ways will be tried to parse the formatted date string. */
    strictFormats?: boolean;
    consoleProps?: any;
    logger?: Cypress.Log;
  }

  /**
   * Registers Angular locale data for given locale identifier.
   *
   * ```typescript
   * // register en-GB to be used as english locale (en-GB is Cumulocity default english locale)
   * import localeEn = require("@angular/common/locales/en-GB");
   * registerLocale(localeEn, "en");
   * ```
   */
  function registerLocale(
    data: unknown[],
    localeId: string,
    extraData?: unknown,
    datefnsLocale?: string
  ): Promise<void>;

  /**
   * Registers default Angular locales. Currently this is `en` (en-GB) and `de` (de) Angular locales.
   */
  function registerDefaultLocales(): void;

  function setLocale(localeId: string): void;
}

Cypress.datefns = dateFns;

const defaultOptions: ISODateOptions = {
  log: true,
  invalid: "ignore",
  strictFormats: true,
};

globalThis.registerLocale = registerLocale;
globalThis.registerDefaultLocales = registerDefaultLocales;
(async () => {
  await registerDefaultLocales();
})();

globalThis.setLocale = (localeId: string) => {
  const l = getNgLocale(localeId);
  if (l && _.isArray(l)) {
    Cypress.datefns.setDefaultOptions({
      locale: l[NgLocaleDataIndex.DfnsLocale],
    });
  }
};

const isISODateSource = (arg: any): arg is ISODateSource => {
  return arg != null && (_.isString(arg) || _.isNumber(arg) || _.isArray(arg));
};

const fromArguments = <T = string | ISODateSource>(
  args: any[]
): [T | undefined, ISODateOptions | undefined] => {
  let source: T | undefined = undefined;
  let options: ISODateOptions | string | undefined = undefined;
  if (args.length === 1) {
    source = args[0];
  } else if (args.length > 1) {
    if (isISODateSource(args[1]) || typeof args[1] === "string") {
      source = args[1] as T;
      if (args.length > 2) {
        options = args[2];
      }
    } else {
      source = args[0];
      options = _.last(args);
    }
  }
  return [source, _.defaults({}, options, defaultOptions)];
};

Cypress.Commands.add(
  "toDate",
  { prevSubject: "optional" },
  (prevSubject: unknown, ...args) => {
    const [unsafeSource, options] = fromArguments([prevSubject, ...args]);
    const localizedFormats =
      options != null ? prepareLocalizedFormats(options) : [];
    const win = cy.state("window");
    const language =
      options?.language ?? win.localStorage.getItem("c8y_language") ?? "en";

    const consoleProps: any = options?.consoleProps ?? {};

    if (!consoleProps.options) {
      consoleProps.options = options || null;
    }
    consoleProps.language = `${language} (${getNgLocaleId(language)})`;
    consoleProps.localizedFormats = localizedFormats || null;
    consoleProps.source = unsafeSource || null;

    let logger = options?.logger;
    let ourlogger = false;
    if (options?.log === true && options?.consoleProps == null) {
      logger = Cypress.log({
        name: "toDate",
        message: `${unsafeSource || null}`,
        consoleProps: () => consoleProps,
        autoEnd: false,
      });
      ourlogger = true;
    }

    if (!unsafeSource) {
      logger?.end();
      throwError(`No or undefined source provided to cy.toDate.`);
    }

    const source = unsafeSource as ISODateSource;
    const input = Array.isArray(source) ? source : [source];
    const formats: (string | undefined)[] = [];
    let dates = input.map((item) => {
      let parsedDate: Date | undefined;

      // try to read date from Angular date formats or number
      for (const format of localizedFormats) {
        parsedDate = parseDate(item, format);
        if (isValidDate(parsedDate)) {
          formats.push(format);
          return parsedDate;
        }
      }

      // try to read as ISO date
      if (!isValidDate(parsedDate) && _.isString(item)) {
        parsedDate = Cypress.datefns.parseISO(<string>item);
        if (isValidDate(parsedDate)) {
          formats.push(undefined);
        }
      }

      // try to read as Date last. this might have some unexpected result
      if (!isValidDate(parsedDate) && options?.strictFormats === false) {
        parsedDate = new Date(item);
        if (isValidDate(parsedDate)) {
          formats.push(undefined);
        }
      }

      if (isValidDate(parsedDate)) {
        return parsedDate;
      }

      if (options?.invalid === "throw") {
        throwError(
          `'${item?.toString()}' could not be converted into a valid date. No matching format or invalid input.`
        );
      }
      return undefined;
    });

    if (options?.invalid === "ignore") {
      dates = dates.filter((date) => date);
      if (_.isEmpty(dates)) {
        if (ourlogger) {
          logger?.end();
        }
        return undefined;
      }
    }

    const result = Array.isArray(source) ? dates : dates[0];
    consoleProps["Format"] =
      (Array.isArray(source) ? formats : formats[0]) || null;
    consoleProps["Yielded"] = result || null;
    if (ourlogger) {
      logger?.end();
    }
    cy.wrap(result, { log: false });
  }
);

Cypress.Commands.add(
  "toISODate",
  { prevSubject: "optional" },
  (prevSubject: unknown, ...args) => {
    const [source, options] = fromArguments([prevSubject, ...args]);
    const consoleProps: any = {
      source: source || null,
      options,
    };

    let log: Cypress.Log | undefined = undefined;
    if (options?.log === true || options?.log == null) {
      log = Cypress.log({
        name: "toISODate",
        message: `${source || null}`,
        consoleProps: () => consoleProps,
        autoEnd: false,
      });
    }
    const o = { ...options, ...{ log: false, consoleProps, logger: log } };
    cy.toDate(source, o).then((dates) => {
      const sources = Array.isArray(source) ? source : [source];
      const d = Array.isArray(dates) ? dates : [dates];
      let isoStrings = d.map((date, index) => {
        const defaultValue =
          options?.invalid === "keep" ? sources[index] : undefined;
        return date ? date.toISOString() : defaultValue;
      });

      if (options?.invalid === "ignore") {
        isoStrings = isoStrings.filter((iso) => iso);
        if (_.isEmpty(isoStrings)) {
          log?.end();
          return cy.wrap(Array.isArray(source) ? [] : undefined, {
            log: false,
          });
        }
      }

      const result = Array.isArray(source) ? isoStrings : isoStrings[0];
      consoleProps["Dates"] = dates || null;
      consoleProps["Yielded"] = result || null;
      log?.end();
      cy.wrap(result, { log: false });
    });
  }
);

Cypress.Commands.add(
  "dateFormat",
  { prevSubject: "optional" },
  (prevSubject: unknown, ...args) => {
    const [source, opts] = fromArguments<string>([prevSubject, ...args]);
    const options: Pick<ISODateOptions, "invalid" | "language" | "log"> =
      _.pick(opts, ["invalid", "language", "log"]);

    const localizedFormats = prepareLocalizedFormats(options);
    const win = cy.state("window");
    const language =
      options?.language ?? win.localStorage.getItem("c8y_language") ?? "en";

    const consoleProps: any = {
      source,
      options,
      language: `${language} (${getNgLocaleId(language)})`,
      localizedFormats,
    };
    if (options?.log === true) {
      Cypress.log({
        name: "dateFormat",
        message: source,
        consoleProps: () => consoleProps,
      });
    }

    if (!source) {
      throwError(`No or undefined provided source provided to cy.dateFormat.`);
    }

    const format = findDateFormatForSource(source as string, localizedFormats);
    if (!format && options?.invalid === "throw") {
      throwError(
        `'${source?.toString()}' could not be converted into a valid date. No matching format or invalid input.`
      );
    }

    consoleProps.yielded = format;
    cy.wrap(format, { log: false });
  }
);

Cypress.Commands.add(
  "compareDates",
  // @ts-expect-error
  { prevSubject: "optional" },
  (
    prevSubject: string,
    source: string,
    target: Date,
    options: Pick<
      ISODateOptions,
      "invalid" | "language" | "log"
    > = defaultOptions
  ) => {
    if (
      (!source && prevSubject) ||
      (_.isObjectLike(source) && !_.isArray(source))
    ) {
      source = prevSubject;
    }

    if (_.isString(target)) {
      target = Cypress.datefns.parseISO(target);
      if (!target) {
        throwError(`${target} is not a valid ISO formatted date.`);
      }
    }

    const localizedFormats = prepareLocalizedFormats(options).reverse();
    const win = cy.state("window");
    const language =
      options?.language ?? win.localStorage.getItem("c8y_language") ?? "en";

    const consoleProps: any = {
      source,
      target,
      options,
      language: `${language} (${getNgLocaleId(language)})`,
      localizedFormats,
    };
    if (options?.log === true) {
      Cypress.log({
        name: "compareDates",
        message: source,
        consoleProps: () => consoleProps,
      });
    }

    consoleProps.target = target;

    const unsafeFortmat = findDateFormatForSource(source, localizedFormats);
    consoleProps.format = unsafeFortmat;
    if (!unsafeFortmat) {
      if (options?.invalid === "throw") {
        throwError(
          `'${source?.toString()}' could not be converted into a valid date. No matching format or invalid input.`
        );
      } else {
        return cy.wrap(false);
      }
    }
    const format = unsafeFortmat as string;
    const formattedTarget = Cypress.datefns.format(target, format);
    consoleProps.formattedTarget = formattedTarget;

    if (formattedTarget) {
      return cy.wrap(_.isEqual(source, formattedTarget));
    } else {
      throwError(
        `'${target?.toString()}' could not be formatted as string using ${format}.`
      );
    }
    return cy.wrap(false);
  }
);

function findDateFormatForSource(
  source: string,
  localizedFormats: string[]
): string | undefined {
  if (!source) return undefined;
  for (const format of localizedFormats) {
    if (isValidDate(parseDate(source, format))) {
      return format;
    }
  }
  return undefined;
}

function prepareLocalizedFormats(options: ISODateOptions): string[] {
  const win = cy.state("window");
  const language =
    options?.language ?? win.localStorage.getItem("c8y_language") ?? "en";

  const formatWidths = options?.formatWidth
    ? [options.formatWidth]
    : Object.values(FormatWidth).filter((n) => _.isNumber(n));

  let localizedFormats: string[];
  if (options?.format) {
    localizedFormats = [options?.format];
  } else {
    const dateTimeFormats = formatWidths.map((f) =>
      localizedDateTimeFormat(language, f as number)
    );
    const dateFormats = formatWidths.map((f) =>
      localizedDateFormat(language, f as number)
    );
    const timeFormats = formatWidths.map((f) =>
      localizedTimeFormat(language, f as number)
    );
    localizedFormats = [...dateTimeFormats, ...dateFormats, ...timeFormats];
  }

  // date-fns does not use z...zzzz. fix or converion will fail
  // https://github.com/date-fns/date-fns/issues/2088
  return localizedFormats.map((format) => {
    let result = format.replace("zzzz", "'GMT'X");
    result = result.replace("z", "X");
    return result;
  });
}
