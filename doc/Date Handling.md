# Date Handling in Tests

`cumulocity-cypress` provides custom commands to simplify working with dates in your Cypress tests. These commands are designed specifically to handle Angular date pipe formatted dates that appear in the Cumulocity UI.

Parsing dates from the UI can be challenging because:
1. Dates may be displayed in different formats based on the user's locale
2. The same date might appear as "May 26, 2023" in English but "26. Mai 2023" in German
3. Time zone conversions need to be handled correctly
4. Integration with test assertions requires reliable date comparison

The date commands in `cumulocity-cypress` solve these problems by automatically detecting the format of displayed dates and converting them to JavaScript Date objects or ISO strings for convenient testing.

Contents of this document:
- [Concept Overview](#concept-overview)
- [Commands](#commands)
  - [cy.toDate](#cytodate)
  - [cy.toISODate](#cytoisodate)
  - [cy.dateFormat](#cydateformat)
  - [cy.compareDates](#cycomparedates)
- [Locale Support](#locale-support)
  - [Registering Locales](#registering-locales)
  - [Setting Active Locale](#setting-active-locale)
  - [Custom Locales](#custom-locales)
- [Usage Examples](#usage-examples)
  - [Basic Date Conversion](#basic-date-conversion)
  - [Working with Different Locales](#working-with-different-locales)
  - [Date Format Detection](#date-format-detection)
  - [Comparing Dates](#comparing-dates)
  - [Handling Invalid Dates](#handling-invalid-dates)
- [Configuration Options](#configuration-options)
- [Integration with date-fns](#integration-with-date-fns)
  - [Accessing date-fns in Your Tests](#accessing-date-fns-in-your-tests)

## Concept Overview

In Cumulocity applications, dates are typically formatted using Angular's date pipe or the Cumulocity-specific `c8yDate` pipe. When testing, we often need to:

1. Read a date string from the UI
2. Convert it to a JavaScript Date object
3. Compare it with an expected value

The challenge is that the same date can appear in different formats depending on the locale settings and format used:
- English: "May 26, 2023"
- German: "26. Mai 2023"
- Additionally, time formats also differ (12h vs 24h)
- Time or date-only formats may be used, or both combined

The `cumulocity-cypress` date commands automatically detect the format based on the current locale and parse the date string accordingly. This enables you to write locale-independent tests that work regardless of the display format.

## Commands

### cy.toDate

Converts a formatted date string to a JavaScript Date object.

```typescript
cy.toDate(
    source?: string | number | string[] | number[], options?: ISODateOptions
): Cypress.Chainable<Date | Date[] | undefined>
```

**Example:**
```typescript
// Parse a single date
cy.wrap("26 May 2023, 15:59:00")
  .toDate()
  .then((date) => {
    expect(date).to.be.instanceOf(Date);
    expect(date.getFullYear()).to.equal(2023);
    expect(date.getMonth()).to.equal(4); // May is 4 (zero-indexed)
  });

// Parse an array of dates
cy.toDate([
  "26 May 2023, 15:59:00",
  "15 June 2015 at 9:03:01 +01"
]).then((dates) => {
  // Use the dates array
});
```

### cy.toISODate

Converts a formatted date string to an ISO date string, which is useful for API comparisons.

```typescript
cy.toISODate(source?: string | number | string[] | number[], options?: ISODateOptions): Cypress.Chainable<string | string[] | undefined>
```

**Example:**
```typescript
cy.wrap("26 May 2023, 15:59:00")
  .toISODate()
  .then((isoString) => {
    expect(isoString).to.equal("2023-05-26T13:59:00.000Z");
  });
```

### cy.dateFormat

Detects and returns the Angular format pattern used for a given date string.

```typescript
cy.dateFormat(source?: string, options?: Pick<ISODateOptions, "invalid" | "language" | "log">): Cypress.Chainable<string | undefined>
```

**Example:**
```typescript
cy.dateFormat("26 October 2023").should("eq", "d MMMM y");
cy.dateFormat("30 Nov 2018, 16:22:30").should("eq", "d MMM y, HH:mm:ss");
```

### cy.compareDates

Compares a formatted date string with a Date object or ISO string.

```typescript
cy.compareDates(source: string, target: Date | number | string, options?: Pick<ISODateOptions, "invalid" | "language" | "log">): Cypress.Chainable<boolean>
```

**Example:**
```typescript
const isoDate = new Date(Date.UTC(2018, 10, 30, 15, 22, 30));
cy.compareDates("30 November 2018", isoDate).should("eq", true);
cy.compareDates("30/11/2018, 16:22", isoDate.toISOString()).should("eq", true);
```

## Locale Support

The date commands use Angular's locale data to correctly interpret date formats according to the current locale.

### Registering Locales

Before using the date commands, you need to register the locales you intend to use:

```typescript
// English and German locales are registered by default
registerDefaultLocales();

// Register a custom locale
import * as localeCustom from "./path-to-your-locale-data";
registerLocale(localeCustom.default, "custom-locale");
```

### Setting Active Locale

Set the active locale for your tests:

```typescript
cy.setLanguage("en"); // Use English locale
// or
cy.setLanguage("de"); // Use German locale
```

### Custom Locales

You can register and use custom locales for testing specific formatting requirements:

```typescript
registerLocale(customLocaleData, "test").then(() => {
  // Use the custom locale
  cy.setLanguage("test");
  
  // Now date commands will use the custom locale's formatting rules
});
```

## Usage Examples

### Basic Date Conversion

```typescript
// Convert a date string to a Date object
cy.wrap("26 May 2023, 15:59:00")
  .toDate()
  .then((date) => {
    expect(date).to.be.instanceOf(Date);
  });

// Convert a date string to an ISO string
cy.wrap("26 May 2023, 15:59:00")
  .toISODate()
  .then((isoString) => {
    expect(isoString).to.equal("2023-05-26T13:59:00.000Z");
  });
```

### Working with Different Locales

```typescript
// Set language to English
cy.setLanguage("en").then(() => {
  cy.wrap("26 May 2023, 15:59:00")
    .toISODate()
    .then((result) => {
      expect(result).to.equal("2023-05-26T13:59:00.000Z");
    });
});

// Set language to German
cy.setLanguage("de").then(() => {
  cy.wrap("26. Mai 2023, 15:59:00")
    .toISODate()
    .then((result) => {
      expect(result).to.equal("2023-05-26T13:59:00.000Z");
    });
});
```

### Date Format Detection

```typescript
// Detect the format of a date string
cy.dateFormat("3/12/23").should("eq", "dd/MM/y");
cy.dateFormat("26 October 2023").should("eq", "d MMMM y");
cy.dateFormat("30 Nov 2018, 16:22:30").should("eq", "d MMM y, HH:mm:ss");
```

### Comparing Dates

```typescript
const isoDate = new Date(Date.UTC(2018, 10, 30, 15, 22, 30));

// Compare date string with a Date object
cy.compareDates("30/11/2018", isoDate).should("eq", true);
cy.compareDates("30 November 2018", isoDate).should("eq", true);

// Compare date string with an ISO string
cy.compareDates("30/11/2018, 16:22", isoDate.toISOString()).should("eq", true);
```

### Handling Invalid Dates

```typescript
// By default, invalid dates return undefined
cy.wrap("-")
  .toISODate()
  .should("eq", undefined);

// Keep the original invalid string
cy.wrap("-")
  .toISODate({ invalid: "keep" })
  .should("eq", "-");

// Filter invalid dates from an array
cy.toISODate(
  ["15 June 2015", "invalid date", "26 May 2023"],
  { invalid: "ignore" }
).then((result) => {
  expect(result).to.deep.eq([
    "2015-06-14T22:00:00.000Z",
    "2023-05-25T22:00:00.000Z"
  ]);
});
```

## Configuration Options

The date commands accept an options object with the following properties:

```typescript
interface ISODateOptions {
  // Override format used for parsing
  format?: string;
  
  // Override language (locale)
  language?: string;
  
  // Use specific format width
  formatWidth?: FormatWidth;
  
  // Enable/disable logging
  log?: boolean;
  
  // How to handle invalid dates: "keep", "ignore", or "throw"
  invalid?: "keep" | "ignore" | "throw";
  
  // Use strict format matching only
  strictFormats?: boolean;
}
```

**Examples:**

```typescript
// Use a specific format
cy.toISODate("26/5/23", { format: "d/M/yy" }).then((result) => {
  expect(result).to.equal("2023-05-25T22:00:00.000Z");
});

// Override the language
cy.toISODate(["3.12.2023", "26.5.2024"], {
  language: "de"
}).then((result) => {
  expect(result).to.deep.eq([
    "2023-12-02T23:00:00.000Z",
    "2024-05-25T22:00:00.000Z"
  ]);
});
```

## Integration with date-fns

The cumulocity-cypress date commands internally use [date-fns](https://date-fns.org/) for date parsing, formatting, and manipulation. This powerful date library provides consistent behavior across browsers and comprehensive date handling capabilities.

### Accessing date-fns in Your Tests

Date-fns is exposed via the `Cypress.datefns` global object, giving you direct access to all date-fns functions in your tests:

```typescript
// Format a date using date-fns
const formattedDate = Cypress.datefns.format(
  Cypress.datefns.parseISO("2023-09-03T22:00:00.000Z"),
  "d MMM y"
);
expect(formattedDate).to.equal("4 Sept 2023");

// Parse a date string using date-fns
const parsedDate = Cypress.datefns.parse(
  "Tuesday 5 Sept 2023",
  "EEEE d MMM y",
  new Date()
);
expect(parsedDate.toISOString()).to.equal("2023-09-04T22:00:00.000Z");
```

