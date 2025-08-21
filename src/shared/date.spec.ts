/// <reference types="jest" />

import { isValidDate, normalizeLocaleId, parseDate } from "./date";

describe("localeutil", () => {
  describe("isValidDate", () => {
    it("should return true for valid Date objects", () => {
      expect(isValidDate(new Date())).toBe(true);
      expect(isValidDate(new Date("2023-01-01"))).toBe(true);
      expect(isValidDate(new Date(1672531200000))).toBe(true);
    });

    it("should return false for invalid Date objects", () => {
      expect(isValidDate(new Date("invalid"))).toBe(false);
    });

    it("should return false for null or undefined", () => {
      expect(isValidDate(null as any)).toBe(false);
      expect(isValidDate(undefined)).toBe(false);
    });

    it("should return false for non-Date objects", () => {
      expect(isValidDate("2023-01-01" as any)).toBe(false);
      expect(isValidDate(123 as any)).toBe(false);
      expect(isValidDate({} as any)).toBe(false);
    });
  });

  describe("normalizeLocaleId", () => {
    it("should convert locale ID to lowercase", () => {
      expect(normalizeLocaleId("EN")).toBe("en");
      expect(normalizeLocaleId("En-US")).toBe("en-us");
    });

    it("should replace underscores with hyphens", () => {
      expect(normalizeLocaleId("en_US")).toBe("en-us");
      expect(normalizeLocaleId("de_DE_POSIX")).toBe("de-de-posix");
    });

    it("should handle already normalized IDs", () => {
      expect(normalizeLocaleId("en-us")).toBe("en-us");
      expect(normalizeLocaleId("de-de")).toBe("de-de");
    });

    it("should handle empty strings", () => {
      expect(normalizeLocaleId("")).toBe("");
    });
  });

  describe("parseDate", () => {
    it("should parse a number as a timestamp", () => {
      const timestamp = 1673740800000; // January 15, 2023
      const result = parseDate(timestamp, "yyyy-MM-dd");
      expect(result instanceof Date).toBe(true);
      expect(result?.getTime()).toBe(timestamp);
    });

    it("should parse a date string using the provided format", () => {
      const result = parseDate("01/15/2023", "MM/dd/yyyy");
      expect(result instanceof Date).toBe(true);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(0); // January
      expect(result?.getDate()).toBe(15);
    });

    it("should parse using a different format", () => {
      const result = parseDate("2023-01-15", "yyyy-MM-dd");
      expect(result instanceof Date).toBe(true);
      expect(result?.getFullYear()).toBe(2023);
      expect(result?.getMonth()).toBe(0); // January
      expect(result?.getDate()).toBe(15);
    });

    it("should return undefined for invalid date strings", () => {
      const result = parseDate("invalid-date", "yyyy-MM-dd");
      expect(result).toBeUndefined();
    });

    it("should return undefined for null or undefined input", () => {
      expect(parseDate(null as any, "yyyy-MM-dd")).toBeUndefined();
      expect(parseDate(undefined as any, "yyyy-MM-dd")).toBeUndefined();
    });
  });
});
