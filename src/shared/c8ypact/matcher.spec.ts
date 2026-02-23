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

    it("should compare key case insensitivity", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = { ContentType: "application/json", StatusCode: 200 };
      const obj2 = { contenttype: "application/json", statuscode: 200 };

      expect(matcher.match(obj1, obj2, { ignoreCase: true })).toBeTruthy();
      expect(() => matcher.match(obj1, obj2, { ignoreCase: false })).toThrow();
    });

    it("should detect value mismatch even with case-insensitive keys", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = { UserName: "alice" };
      const obj2 = { username: "bob" };

      expect(() => matcher.match(obj1, obj2, { ignoreCase: false })).toThrow();
      expect(() => matcher.match(obj1, obj2, { ignoreCase: true })).toThrow(
        /Values for "username" do not match/
      );
    });

    it("should handle nested objects with case-insensitive keys", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        Headers: {
          ContentType: "application/json",
          ApiKey: "secret123",
        },
      };
      const obj2 = {
        headers: {
          contenttype: "application/json",
          apikey: "secret123",
        },
      };

      expect(matcher.match(obj1, obj2, { ignoreCase: true })).toBeTruthy();
      expect(() => matcher.match(obj1, obj2, { ignoreCase: false })).toThrow();
    });

    it("should handle strict matching with case-insensitive keys", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        ApiKey: "secret",
        ContentType: "application/json",
      };
      const obj2 = {
        apikey: "secret",
      };

      expect(() =>
        matcher.match(obj1, obj2, { ignoreCase: true, strictMatching: true })
      ).toThrow(/not found in pact object/);
    });

    it("should handle non-strict matching with case-insensitive keys", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        ApiKey: "secret",
        ContentType: "application/json",
        ExtraField: "value",
      };
      const obj2 = {
        apikey: "secret",
        contenttype: "application/json",
      };

      expect(
        matcher.match(obj1, obj2, { ignoreCase: true, strictMatching: false })
      ).toBeTruthy();
      expect(() =>
        matcher.match(obj1, obj2, { ignoreCase: false, strictMatching: false })
      ).toThrow();
    });

    it("should resolve schema keys case-insensitively when matching", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        Name: "test",
        Age: 25,
      };
      const obj2 = {
        name: "test",
        age: 25,
      };

      expect(matcher.match(obj1, obj2, { ignoreCase: true })).toBeTruthy();
      expect(() => matcher.match(obj1, obj2, { ignoreCase: false })).toThrow();
    });

    it("should handle mixed case keys in arrays of objects", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        Items: [
          { Name: "item1", Value: 100 },
          { Name: "item2", Value: 200 },
        ],
      };
      const obj2 = {
        items: [
          { name: "item1", value: 100 },
          { name: "item2", value: 200 },
        ],
      };

      expect(matcher.match(obj1, obj2, { ignoreCase: true })).toBeTruthy();
      expect(() => matcher.match(obj1, obj2, { ignoreCase: false })).toThrow();
    });

    describe("default options", () => {
      afterEach(() => {
        C8yDefaultPactMatcher.options = undefined;
      });

      it("should accept options in constructor and use them as defaults", () => {
        const matcher = new C8yDefaultPactMatcher(undefined, {
          ignoreCase: true,
        });
        expect(matcher.options).toEqual({ ignoreCase: true });

        const obj1 = { UserName: "alice", Status: "active" };
        const obj2 = { username: "alice", status: "active" };

        expect(matcher.match(obj1, obj2)).toBeTruthy();
        expect(() => new C8yDefaultPactMatcher().match(obj1, obj2)).toThrow();
      });

      it("should use static options as base defaults", () => {
        C8yDefaultPactMatcher.options = { ignoreCase: true };

        const matcher = new C8yDefaultPactMatcher();
        const obj1 = { UserName: "alice" };
        const obj2 = { username: "alice" };

        expect(matcher.match(obj1, obj2)).toBeTruthy();
      });

      it("should give instance options priority over static options", () => {
        C8yDefaultPactMatcher.options = { ignoreCase: false };

        const matcher = new C8yDefaultPactMatcher(undefined, {
          ignoreCase: true,
        });
        const obj1 = { UserName: "alice" };
        const obj2 = { username: "alice" };

        expect(matcher.match(obj1, obj2)).toBeTruthy();
      });

      it("should give options passed to match() priority over instance options", () => {
        const matcher = new C8yDefaultPactMatcher(undefined, {
          ignoreCase: true,
        });
        const obj1 = { UserName: "alice" };
        const obj2 = { username: "alice" };

        // override the instance option
        expect(() =>
          matcher.match(obj1, obj2, { ignoreCase: false })
        ).toThrow();
      });

      it("should give options passed to match() priority over static options", () => {
        C8yDefaultPactMatcher.options = { ignoreCase: true };

        const matcher = new C8yDefaultPactMatcher();
        const obj1 = { UserName: "alice" };
        const obj2 = { username: "alice" };

        // override the static option
        expect(() =>
          matcher.match(obj1, obj2, { ignoreCase: false })
        ).toThrow();
      });

      it("should merge individual options, not replace all", () => {
        C8yDefaultPactMatcher.options = {
          ignoreCase: true,
          strictMatching: false,
        };

        const matcher = new C8yDefaultPactMatcher(undefined, {
          strictMatching: true,
        });

        // ignoreCase still comes from static options, not overridden by instance
        const obj1 = { UserName: "alice", Extra: "x" };
        const obj2 = { username: "alice" };

        // strictMatching=true from instance: obj1 has Extra not in obj2 -> should throw
        expect(() => matcher.match(obj1, obj2)).toThrow(/not found in pact/);
      });

      it("should not mutate options when match() is called repeatedly", () => {
        const matcher = new C8yDefaultPactMatcher(undefined, {
          ignoreCase: true,
        });
        const obj1 = { UserName: "alice" };
        const obj2 = { username: "alice" };

        matcher.match(obj1, obj2);
        matcher.match(obj1, obj2);
        expect(matcher.options).toEqual({ ignoreCase: true });
      });
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

  describe("array matching", () => {
    describe("primitive arrays", () => {
      it("should match arrays with same primitive values regardless of order", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { tags: [1, 2, 3] },
          },
        };
        const pact = {
          response: {
            body: { tags: [3, 1, 2] },
          },
        };

        // With ignorePrimitiveArrayOrder: true (default)
        expect(
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: true })
        ).toBeTruthy();

        // With ignorePrimitiveArrayOrder: false
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > tags" have mismatches at indices'
            ),
          })
        );
      });

      it("should match arrays of strings", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { tags: ["red", "green", "blue"] },
          },
        };
        const pact = {
          response: {
            body: { tags: ["blue", "red", "green"] },
          },
        };

        // With ignorePrimitiveArrayOrder: true (default)
        expect(
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: true })
        ).toBeTruthy();

        // With ignorePrimitiveArrayOrder: false
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > tags" have mismatches at indices'
            ),
          })
        );
      });

      it("should match arrays of mixed primitives", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { values: [1, "two", 3, true] },
          },
        };
        const pact = {
          response: {
            body: { values: [true, 3, "two", 1] },
          },
        };

        // With ignorePrimitiveArrayOrder: true (default)
        expect(
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: true })
        ).toBeTruthy();

        // With ignorePrimitiveArrayOrder: false
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > values" have mismatches at indices'
            ),
          })
        );
      });

      it("should fail when arrays have different primitive values", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { tags: [1, 2, 3] },
          },
        };
        const pact = {
          response: {
            body: { tags: [1, 2, 4] },
          },
        };

        // With ignorePrimitiveArrayOrder: true (default)
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: true })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > tags" have mismatches at indices "2".'
            ),
          })
        );

        // With ignorePrimitiveArrayOrder: false
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > tags" have mismatches at indices "2".'
            ),
          })
        );
      });

      it("should fail when primitive arrays have different lengths", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { tags: [1, 2, 3] },
          },
        };
        const pact = {
          response: {
            body: { tags: [1, 2] },
          },
        };

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > tags" have different lengths.'
            ),
          })
        );
      });

      it("should match empty arrays", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { tags: [] } as any,
          },
        };
        const pact = {
          response: {
            body: { tags: [] } as any,
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });
    });
    describe("root objects", () => {
      it("should match empty objects at root", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {};
        const pact = {};

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should match empty arrays at root", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = [] as any;
        const pact = [] as any;

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should match arrays as root objects", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = [
          {
            response: {
              body: { tags: [] } as any,
            },
          },
        ];
        const pact = [] as any;

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays at "root" have different lengths.'
            ),
          })
        );
      });

      it("should match arrays as root array and object", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { tags: [] } as any,
          },
        };
        const pact = [] as any;

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Type mismatch at \"root\". Expected array but got object.'
            ),
          })
        );
      });

      it("should fail when root types differ - string vs object", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = "hello";
        const pact = {};

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining("Expected 2 objects"),
          })
        );
      });

      it("should fail when root types differ - number vs object", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {};
        const pact = 123;

        expect(() => matcher.match(obj, pact)).toThrow();
      });

      it("should fail when comparing numbers at root", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = 123;
        const pact = 456;

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining("Expected 2 objects"),
          })
        );
      });

      it("should fail when comparing booleans at root", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = true;
        const pact = false;

        expect(() => matcher.match(obj, pact)).toThrow();
      });

      it("should handle null at root", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = null as any;
        const pact = null as any;

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should fail when one root is null", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = null as any;
        const pact = {} as any;

        expect(() => matcher.match(obj, pact)).toThrow();
      });

      it("should handle undefined at root", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = undefined as any;
        const pact = undefined as any;

        expect(matcher.match(obj, pact)).toBeTruthy();
      });
    });

    describe("object arrays", () => {
      it("should match arrays of objects in same order", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              users: [
                { id: "1", name: "Alice" },
                { id: "2", name: "Bob" },
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              users: [
                { id: "1", name: "Alice" },
                { id: "2", name: "Bob" },
              ],
            },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should fail when arrays of objects are in different order", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              users: [
                { id: "1", name: "Alice" },
                { id: "2", name: "Bob" },
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              users: [
                { id: "2", name: "Bob" },
                { id: "1", name: "Alice" },
              ],
            },
          },
        };

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Values for "response > body > users > 0 > name" do not match'
            ),
          })
        );
      });

      it("should fail when object arrays have different lengths", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              users: [
                { id: "1", name: "Alice" },
                { id: "2", name: "Bob" },
                { id: "3", name: "Charlie" },
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              users: [
                { id: "1", name: "Alice" },
                { id: "2", name: "Bob" },
              ],
            },
          },
        };

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > users" have different lengths'
            ),
          })
        );
      });

      it("should match nested arrays of objects", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              groups: [
                {
                  name: "Group A",
                  members: [
                    { id: "1", name: "Alice" },
                    { id: "2", name: "Bob" },
                  ],
                },
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              groups: [
                {
                  name: "Group A",
                  members: [
                    { id: "1", name: "Alice" },
                    { id: "2", name: "Bob" },
                  ],
                },
              ],
            },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should fail when nested arrays differ", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              groups: [
                {
                  name: "Group A",
                  members: [
                    { id: "1", name: "Alice" },
                    { id: "2", name: "Bob" },
                  ],
                },
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              groups: [
                {
                  name: "Group A",
                  members: [
                    { id: "1", name: "Alice" },
                    { id: "3", name: "Charlie" },
                  ],
                },
              ],
            },
          },
        };

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Values for "response > body > groups > 0 > members > 1 > name" do not match'
            ),
          })
        );
      });

      it("should match empty object arrays", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { users: [] as any },
          },
        };
        const pact = {
          response: {
            body: { users: [] as any },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });
    });

    describe("mixed array types", () => {
      it("should match arrays with null and undefined", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { values: [1, null, undefined, "text"] },
          },
        };
        const pact = {
          response: {
            body: { values: [null, 1, undefined, "text"] },
          },
        };

        // With ignorePrimitiveArrayOrder: true (default)
        expect(
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: true })
        ).toBeTruthy();

        // With ignorePrimitiveArrayOrder: false
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > values" have mismatches at indices'
            ),
          })
        );
      });

      it("should match nested arrays of primitives", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              matrix: [
                [1, 2, 3],
                [4, 5, 6],
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              matrix: [
                [1, 2, 3],
                [4, 5, 6],
              ],
            },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should fail when nested primitive arrays differ in content", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              matrix: [
                [1, 2, 3],
                [4, 5, 6],
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              matrix: [
                [1, 2, 3],
                [4, 5, 7],
              ],
            },
          },
        };

        // With ignorePrimitiveArrayOrder: true (default)
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: true })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > matrix > 1" have mismatches at indices "2".'
            ),
          })
        );

        // With ignorePrimitiveArrayOrder: false
        expect(() =>
          matcher.match(obj, pact, { ignorePrimitiveArrayOrder: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > matrix > 1" have mismatches at indices "2".'
            ),
          })
        );
      });

      it("should fail when nested arrays have different order (objects)", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              matrix: [
                [1, 2, 3],
                [4, 5, 6],
              ],
            },
          },
        };
        const pact = {
          response: {
            body: {
              matrix: [
                [4, 5, 6],
                [1, 2, 3],
              ],
            },
          },
        };

        // This should fail because nested arrays are treated as arrays of primitives
        // but at different indices they represent different "objects" in the parent array
        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > matrix > 0" have mismatches at indices "0,1,2".'
            ),
          })
        );
      });
    });

    describe("array matching with strictMatching", () => {
      it("should match arrays with strictMatching disabled", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              tags: [1, 2, 3, 4, 5],
            },
          },
        };
        const pact = {
          response: {
            body: {
              tags: [1, 2, 3],
            },
          },
        };

        // With strictMatching disabled, extra values in obj should not cause failure
        // for primitive arrays - actually this should still fail because arrays
        // check for unexpected values
        expect(() =>
          matcher.match(obj, pact, { strictMatching: false })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > tags" have different lengths.'
            ),
          })
        );
      });

      it("should fail arrays with strictMatching enabled when lengths differ", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: {
              users: [{ id: "1" }, { id: "2" }],
            },
          },
        };
        const pact = {
          response: {
            body: {
              users: [{ id: "1" }],
            },
          },
        };

        expect(() =>
          matcher.match(obj, pact, { strictMatching: true })
        ).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > users" have different lengths'
            ),
          })
        );
      });
    });

    describe("edge cases", () => {
      it("should match single element arrays", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { items: [1] },
          },
        };
        const pact = {
          response: {
            body: { items: [1] },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should match arrays with boolean values", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { flags: [true, false, true] },
          },
        };
        const pact = {
          response: {
            body: { flags: [false, true, true] },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should handle arrays with duplicate values", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { numbers: [1, 1, 2, 2, 3] },
          },
        };
        const pact = {
          response: {
            body: { numbers: [3, 2, 2, 1, 1] },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });

      it("should fail when duplicate count differs", () => {
        const matcher = new C8yDefaultPactMatcher();
        const obj = {
          response: {
            body: { numbers: [1, 1, 2, 3] },
          },
        };
        const pact = {
          response: {
            body: { numbers: [1, 2, 2, 3] },
          },
        };

        expect(() => matcher.match(obj, pact)).toThrow(
          expect.objectContaining({
            name: "C8yPactMatchError",
            message: expect.stringContaining(
              'Arrays with key "response > body > numbers" have mismatches at indices "1".'
            ),
          })
        );
      });

      it("should match very large arrays", () => {
        const matcher = new C8yDefaultPactMatcher();
        const largeArray = Array.from({ length: 1000 }, (_, i) => i);
        const obj = {
          response: {
            body: { data: largeArray },
          },
        };
        const pact = {
          response: {
            body: { data: [...largeArray].reverse() },
          },
        };

        expect(matcher.match(obj, pact)).toBeTruthy();
      });
    });
  });

  describe("authorization header prefix", () => {
    it("should match Authorization with preserved prefix", () => {
      const matcher = new C8yDefaultPactMatcher();
      expect(
        matcher.match(
          { request: { headers: { Authorization: "Bearer ****" } } },
          { request: { headers: { Authorization: "****" } } }
        )
      ).toBeTruthy();
      expect(
        matcher.match(
          { request: { headers: { Authorization: "****" } } },
          { request: { headers: { Authorization: "Basic ****" } } }
        )
      ).toBeTruthy();
      expect(
        matcher.match(
          { request: { headers: { Authorization: "Bearer ****" } } },
          { request: { headers: { Authorization: "Basic ****" } } }
        )
      ).toBeTruthy();
      expect(
        matcher.match(
          { request: { headers: { Authorization: "****" } } },
          { request: { headers: { authorization: "Basic ****" } } },
          { ignoreCase: true }
        )
      ).toBeTruthy();
    });
  });

  describe("JSON Schema keywords", () => {
    it("should match objects with $schema property", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
      };
      const obj2 = {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
      };
      const obj3 = {
        $schema: "http://json-schema.org/draft-06/schema#",
        type: "object",
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
      expect(() => matcher.match(obj1, obj3)).toThrow();
    });

    it("should match objects with $id property", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        $id: "https://example.com/schema.json",
        type: "object",
      };
      const obj2 = {
        $id: "https://example.com/schema.json",
        type: "object",
      };
      const obj3 = {
        $id: "https://example.com/schema-v2.json",
        type: "object",
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
      expect(() => matcher.match(obj1, obj3)).toThrow();
    });

    it("should match objects with $ref property", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        properties: {
          user: { $ref: "#/definitions/User" },
        },
      };
      const obj2 = {
        properties: {
          user: { $ref: "#/definitions/User" },
        },
      };
      const obj3 = {
        properties: {
          user: { $ref: "#/definitions/Person" },
        },
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
      expect(() => matcher.match(obj1, obj3)).toThrow();
    });

    it("should match objects with $comment property", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        $comment: "This is a test schema",
        type: "object",
      };
      const obj2 = {
        $comment: "This is a test schema",
        type: "object",
      };
      const obj3 = {
        $comment: "This is a different comment",
        type: "object",
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
      expect(() => matcher.match(obj1, obj3)).toThrow();
    });

    it("should match objects with $defs property", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        $defs: {
          address: { type: "object" },
        },
      };
      const obj2 = {
        $defs: {
          address: { type: "object" },
        },
      };
      const obj3 = {
        $defs: {
          address: { type: "string" },
        },
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
      expect(() => matcher.match(obj1, obj3)).toThrow();
    });

    it("should match objects with multiple JSON Schema keywords", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://example.com/person.schema.json",
        $comment: "A person schema",
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };
      const obj2 = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://example.com/person.schema.json",
        $comment: "A person schema",
        type: "object",
        properties: {
          name: { type: "string" },
        },
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
    });

    it("should fail when one of multiple JSON Schema keywords differs", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://example.com/person.schema.json",
        $comment: "A person schema",
        type: "object",
      };
      const obj2 = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: "https://example.com/person.schema.json",
        $comment: "A different comment",
        type: "object",
      };

      expect(() => matcher.match(obj1, obj2)).toThrow(
        expect.objectContaining({
          name: "C8yPactMatchError",
          message: expect.stringContaining(
            'Values for "$comment" do not match'
          ),
        })
      );
    });

    it("should differentiate between $schema (JSON Schema) and $body (schema matcher)", () => {
      const matcher = new C8yDefaultPactMatcher();
      C8yDefaultPactMatcher.schemaMatcher = new C8yAjvSchemaMatcher();

      const obj1 = {
        response: {
          body: {
            $schema: "http://json-schema.org/draft-07/schema#",
            name: "John",
          },
        },
      };
      const obj2 = {
        response: {
          $body: {
            type: "object",
            properties: {
              $schema: { type: "string" },
              name: { type: "string" },
            },
          },
        },
      };

      // $body is used as schema matcher, $schema is matched as regular property
      expect(matcher.match(obj1, obj2)).toBeTruthy();
    });

    it("should handle nested objects with JSON Schema keywords", () => {
      const matcher = new C8yDefaultPactMatcher();
      const obj1 = {
        definitions: {
          User: {
            $id: "#User",
            type: "object",
          },
        },
      };
      const obj2 = {
        definitions: {
          User: {
            $id: "#User",
            type: "object",
          },
        },
      };
      const obj3 = {
        definitions: {
          User: {
            $id: "#Person",
            type: "object",
          },
        },
      };

      expect(matcher.match(obj1, obj2)).toBeTruthy();
      expect(() => matcher.match(obj1, obj3)).toThrow();
    });
  });
});
