/// <reference types="jest" />

import {
  getSelector,
} from "./runner-helper";
import { ScreenshotSetup } from "../lib/screenshots/types";

describe("startup", () => {
  describe("getSelector", () => {
    const predefinedSelectors: ScreenshotSetup["selectors"] = [
      { name: "testSelector", selector: ".test-class" },
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
  });
});
