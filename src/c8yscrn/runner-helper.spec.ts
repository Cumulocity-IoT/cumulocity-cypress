/// <reference types="jest" />

import { getSelector, imageName, parseSelector } from "./runner-helper";
import { ScreenshotSetup } from "../lib/screenshots/types";

describe("startup", () => {
  describe("getSelector", () => {
    const predefinedSelectors: ScreenshotSetup["selectors"] = [
      { testSelector: ".test-class" },
      { p1: "predefined 1" },
      { p2: "predefined 2" },
    ];

    it("should return the selector string if input is a string", () => {
      const result = getSelector("testSelector", predefinedSelectors);
      expect(result).toBe(".test-class");
    });

    it("should return the data-cy attribute if input is an object with data-cy", () => {
      const selector = { "data-cy": "test-cy" };
      const result = getSelector(selector, predefinedSelectors);
      expect(result).toBe("[data-cy=test-cy]");
    });

    it("should return the nested selector if input is an object with selector", () => {
      const selector = { selector: ".my-test-class" };
      const result = getSelector(selector, predefinedSelectors);
      expect(result).toBe(".my-test-class");
    });

    it("should return undefined if input is undefined", () => {
      const result = getSelector(undefined, predefinedSelectors);
      expect(result).toBeUndefined();
    });

    it("should return the input string if it does not match any predefined selectors", () => {
      const selector = "nonExistentSelector";
      const result = getSelector(selector, predefinedSelectors);
      expect(result).toBe("nonExistentSelector");
    });

    it("should return the selector string if input is a array of strings", () => {
      const result = getSelector(
        ["my", "test", "selector"],
        predefinedSelectors
      );
      expect(result).toBe("my test selector");
    });

    it("should return the selector string if input is a array of strings with predefined", () => {
      const result = getSelector(["p1 test selector"], predefinedSelectors);
      expect(result).toBe("predefined 1 test selector");
    });

    it("should return the selector string if input is a array of strings with multiple predefined", () => {
      const result = getSelector("p1 abcd p2", predefinedSelectors);
      expect(result).toBe("predefined 1 abcd predefined 2");
    });

    it("should return the selector string if predefined is undefined", () => {
      const result = getSelector("p1 abcd p2", undefined);
      expect(result).toBe("p1 abcd p2");
    });

    it("should return the selector string if predefined is object", () => {
      const result = getSelector("p1 abcd p2", {
        p1: "predefined 1",
        p2: "predefined 2",
      });
      expect(result).toBe("predefined 1 abcd predefined 2");
    });

    it("should replace multiple occurences of same predefined selector", () => {
      const result = getSelector("p1 p1", {
        p1: "predefined 1",
      });
      expect(result).toBe("predefined 1 predefined 1");
    });

    it("should use the longest key from predefined first", () => {
      const result = getSelector("p1.2 abcd p1    p1.2.3", {
        p1: "predefined 1",
        "p1.2": "predefined 1.2",
        "p1.2.3": "predefined 1.2.3",
      });
      expect(result).toBe(
        "predefined 1.2 abcd predefined 1    predefined 1.2.3"
      );
    });

    it("should not remove > selector elements", () => {
      const result = getSelector("p1 > abcd > p2", [
        { p1: "predefined 1" },
        { p2: "predefined 2" },
      ]);
      expect(result).toBe("predefined 1 > abcd > predefined 2");
    });

    it("should use language specific selector if language is provided", () => {
      const selector = {
        language: "de",
        selector: "testSelector",
      };
      const result = getSelector(selector, predefinedSelectors, "de");
      expect(result).toBe(".test-class");
    });

    it("should return undefined if language is not in the language array", () => {
      const selector = { language: ["de", "en"], selector: "testSelector" };
      const result = getSelector(selector, predefinedSelectors, "fr");
      expect(result).toBeUndefined();
    });

    it("should return selector if object has language and data-cy", () => {
      const selector = { language: "de", "data-cy": "test-cy" };
      const result = getSelector(selector, predefinedSelectors, "de");
      expect(result).toBe("[data-cy=test-cy]");
    });

    it("should return undefied if object is empty", () => {
      const selector = {};
      const result = getSelector(selector, predefinedSelectors, "de");
      expect(result).toBeUndefined();
    });

    it("should return undefined if object is empty and language is not provided", () => {
      const selector = {};
      const result = getSelector(selector, predefinedSelectors);
      expect(result).toBeUndefined();
    });

    it("should return the localized selector if language is provided", () => {
      const selector = { localized: { de: ".test-class" } };
      const result = getSelector(selector, predefinedSelectors, "de");
      expect(result).toBe(".test-class");
    });

    it("should return the localized selector if language is provided and it is an array", () => {
      const selector = { localized: { de: ".test-class", en: ".test-class-en" } };
      const result = getSelector(selector, predefinedSelectors, "en");
      expect(result).toBe(".test-class-en");
    });

    it("should return undefined if language is not in the localized object", () => {
      const selector = { localized: { de: ".test-class" } };
      const result = getSelector(selector, predefinedSelectors, "fr");
      expect(result).toBeUndefined();
    });
  });

  describe("parseSelector", () => {
    it("should return an array with single element for single selector", () => {
      const result = parseSelector(".test-class");
      expect(result).toEqual([".test-class"]);
    });

    it("should return an array with multiple elements if the input is a compound selector", () => {
      const result = parseSelector(".test-class .another-class");
      expect(result).toEqual([".test-class", ".another-class"]);
    });

    it("should ignore > in the selector", () => {
      const result = parseSelector(".test-class > .another-class");
      expect(result).toEqual([".test-class", ".another-class"]);
    });

    it("should not split spaces within brackets", () => {
      const result = parseSelector(".navbar-right > :nth-child(-n + 3) > .btn");
      expect(result).toEqual([".navbar-right", ":nth-child(-n + 3)", ".btn"]);
    });

    it("should not split spaces within []", () => {
      const result = parseSelector(
        ".navbar-right > [data-cy='my test'] > .btn"
      );
      expect(result).toEqual([".navbar-right", "[data-cy='my test']", ".btn"]);
    });

    it("should not split the selector if it is a compound selector", () => {
      const result = parseSelector(".test-class.another-class");
      expect(result).toEqual([".test-class.another-class"]);
    });
  });

  describe("imageName", () => {
    it("should remove the file extension", () => {
      const result = imageName("my-test-image.png");
      expect(result).toBe("my-test-image");
    });

    it("should not remove the file extension if it is not present", () => {
      const result = imageName("my-test-image");
      expect(result).toBe("my-test-image");
    });

    it("should remove the file extension if it is uppercase", () => {
      const result = imageName("my-test-image.PNG");
      expect(result).toBe("my-test-image");
    });

    it("should remove the file extension if it is mixed case", () => {
      const result = imageName("my-test-image.png.png");
      expect(result).toBe("my-test-image.png");
    });

    it("should append the language if it is provided", () => {
      const result = imageName("my-test-image.png", "de");
      expect(result).toBe("my-test-image_de");
    });
  });
});
