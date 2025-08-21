/// <reference types="jest" />

import {
  C8yDefaultPactMatcher,
  C8yIdentifierMatcher,
  C8yIgnoreMatcher,
  C8yISODateStringMatcher,
  C8yNumberMatcher,
  C8ySameTypeMatcher,
  C8yStringMatcher,
} from "./matcher";

import { C8yAjvSchemaMatcher } from "../../contrib/ajv";

describe("matcher", () => {
  describe("C8yDefaultPactMatcher", () => {
    it("should initialize with property matchers", () => {
      const matcher = new C8yDefaultPactMatcher();
      expect(matcher.propertyMatchers).toBeDefined();
      expect(matcher.propertyMatchers).toHaveProperty("body");
      expect(matcher.propertyMatchers).toHaveProperty("requestBody");
      expect(matcher.propertyMatchers).toHaveProperty("duration");
      expect(matcher.propertyMatchers).toHaveProperty("date");
      expect(matcher.propertyMatchers).toHaveProperty("Authorization");
      expect(matcher.propertyMatchers).toHaveProperty("auth");
      expect(matcher.propertyMatchers).toHaveProperty("options");
      expect(matcher.propertyMatchers).toHaveProperty("createdObject");
      expect(matcher.propertyMatchers).toHaveProperty("location");
      expect(matcher.propertyMatchers).toHaveProperty("url");
      expect(matcher.propertyMatchers).toHaveProperty("X-XSRF-TOKEN");
      expect(matcher.propertyMatchers).toHaveProperty("lastMessage");
    });

    it("should get property matcher ignore case", () => {
      const matcher = new C8yDefaultPactMatcher();
      const p1 = matcher.getPropertyMatcher("body");
      expect(p1).toBeDefined();

      const p2 = matcher.getPropertyMatcher("BODY");
      expect(p2).toBeUndefined();

      const p3 = matcher.getPropertyMatcher("BODY", true);
      expect(p3).toBeDefined();
    });
  });

  describe("C8yISODateStringMatcher", () => {
    it("should match ISO date string", () => {
      const matcher = new C8yISODateStringMatcher();
      const date1 = "2025-03-21T16:28:07.319Z";
      const date2 = "2025-03-21T16:28:07.319Z";

      expect(matcher.match(date1, date2)).toBeTruthy();
    });

    it("should not match ISO date string", () => {
      const matcher = new C8yISODateStringMatcher();

      const date1 = "2025-03-21T16:28:07.319Zadsasdasd";
      const date2 = "2025-03-21T16:28:07.319Z";

      expect(() => matcher.match(date1, date2)).toThrow();
    });
  });

  describe("C8ySameTypeMatcher", () => {
    it("should match same type", () => {
      const matcher = new C8ySameTypeMatcher();
      const obj1 = { a: 1, b: 2 }; // object
      const obj2 = { a: 1, b: 3 }; // object

      expect(matcher.match(obj1, obj2)).toBeTruthy();
    });

    it("should not match same type", () => {
      const matcher = new C8ySameTypeMatcher();
      const obj1 = "abc";
      const obj2 = 123;

      expect(() => matcher.match(obj1, obj2)).toThrow();
    });
  });

  describe("C8yIgnoreMatcher", () => {
    it("should match anything", () => {
      const matcher = new C8yIgnoreMatcher();
      const obj1 = "abc";
      const obj2 = 123;

      expect(matcher.match()).toBeTruthy();
    });
  });

  describe("C8yNumberMatcher", () => {
    it("should match numbers", () => {
      const matcher = new C8yNumberMatcher();
      const obj1 = 1;
      const obj2 = 2;

      expect(matcher.match(obj1, obj2)).toBeTruthy();
    });

    it("should not match numbers", () => {
      const matcher = new C8yNumberMatcher();
      const obj1 = 1;
      const obj2 = "2";

      expect(() => matcher.match(obj1, obj2)).toThrow();
    });

    it("should not match NaN", () => {
      const matcher = new C8yNumberMatcher();
      const obj1 = Number.NaN;
      const obj2 = Number.NaN;

      expect(() => matcher.match(obj1, obj2)).toThrow();
    });
  });

  describe("C8yStringMatcher", () => {
    it("should match strings", () => {
      const matcher = new C8yStringMatcher();
      const obj1 = "abc";
      const obj2 = "abqweqwec";

      expect(matcher.match(obj1, obj2)).toBeTruthy();
    });

    it("should not match string and number", () => {
      const matcher = new C8yStringMatcher();
      const obj1 = "abc";
      const obj2 = 123;

      expect(() => matcher.match(obj1, obj2)).toThrow();
    });
  });

  describe("C8yIdentifierMatcher", () => {
    it("should match identifier", () => {
      const matcher = new C8yIdentifierMatcher();
      const obj1 = "123";
      const obj2 = "123";

      expect(matcher.match(obj1, obj2)).toBeTruthy();
    });

    it("should not match identifier", () => {
      const matcher = new C8yIdentifierMatcher();
      const obj1 = "123";
      const obj2 = "12asa";

      expect(() => matcher.match(obj1, obj2)).toThrow();
    });
  });

  describe("schema matcher", () => {
    const schema = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" },
      },
      required: ["name", "age"],
    };

    C8yDefaultPactMatcher.schemaMatcher = new C8yAjvSchemaMatcher();

    beforeEach(() => {
      C8yDefaultPactMatcher.matchSchemaAndObject = false;
    });

    it("should match schema", () => {
      const matcher = new C8yDefaultPactMatcher();

      const obj = {
        response: {
          body: { name: "John Doe", age: 30 },
        },
      };
      const pact = {
        response: { $body: schema },
      };

      expect(matcher.match(obj, pact)).toBeTruthy();
    });

    it("should not match schema", () => {
      const matcher = new C8yDefaultPactMatcher();

      const obj = {
        response: {
          body: {
            name: "John Doe",
            age: "30", // Invalid age
          },
        },
      };
      const pact = {
        response: { $body: schema },
      };

      expect(() => matcher.match(obj, pact)).toThrow(
        expect.objectContaining({
          name: "C8yPactMatchError",
          message: expect.stringContaining(
            `Pact validation failed! Schema for \"response > body\" does not match (data/age must be number).`
          ),
        })
      );
    });

    it("should match object and schema", () => {
      const matcher = new C8yDefaultPactMatcher();

      const obj = {
        response: {
          body: { name: "John Doe", age: 30 },
        },
      };
      const pact = {
        response: {
          $body: schema,
          body: { name: "John Doe", age: 35 },
        },
      };

      // schema matching success
      expect(
        matcher.match(obj, pact, {
          strictMatching: true,
          matchSchemaAndObject: false,
        })
      ).toBeTruthy();

      // object matching failure
      expect(() =>
        matcher.match(obj, pact, {
          strictMatching: true,
          matchSchemaAndObject: true,
        })
      ).toThrow(`Values for "response > body > age" do not match.`);
    });

    it("should not match object and schema with global matchSchemaAndObject config", () => {
      const matcher = new C8yDefaultPactMatcher();
      C8yDefaultPactMatcher.matchSchemaAndObject = true;

      const obj = {
        response: {
          body: { name: "John Doe", age: 30 },
        },
      };
      const pact = {
        response: {
          $body: schema,
          body: { name: "John Doe", age: 35 },
        },
      };

      // object matching failure
      expect(() =>
        matcher.match(obj, pact, {
          strictMatching: true,
        })
      ).toThrow(
        expect.objectContaining({
          name: "C8yPactMatchError",
          message: expect.stringContaining(
            `Values for "response > body > age" do not match.`
          ),
        })
      );
    });
  });
});
