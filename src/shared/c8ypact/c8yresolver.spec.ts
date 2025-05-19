// @ts-nocheck
/// <reference types="jest" />

import { resolvePact } from "./c8yresolver";
import { vol } from "memfs"; // Import vol

import path from "path";
import fs from "fs";
import url from "url";

// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock("fs", () => require("memfs").fs);

const CWD = "/home/user";

describe("resolvePact", () => {
  const defaultPactId = "test-pact-id";
  const defaultPactInfo = { description: "A test pact" };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("internal $refs", () => {
    it("should resolve a simple internal $ref and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          simple: { message: "Hello" },
        },
        records: [
          {
            request: { method: "GET", path: "/simple-data" },
            response: {
              status: 200,
              body: { $ref: "#/definitions/simple" },
            },
          },
        ],
        id: defaultPactId,
        info: defaultPactInfo,
      };

      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.message).toBe("Hello");
      expect(resolved.id).toBe(defaultPactId);
      expect(resolved.info).toEqual(defaultPactInfo);
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve a parameterized $ref with object definition and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          parameterizedDef: {
            message: "Hello {{name}}!",
            details: {
              value: "The value is {{value}}.",
            },
          },
        },
        records: [
          {
            request: { method: "POST", path: "/params" },
            response: {
              status: 201,
              body: {
                $ref: "#/definitions/parameterizedDef?name=World&value=42",
              },
            },
          },
        ],
        id: "param-pact-1",
        info: { type: "parameterized" },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.message).toBe("Hello World!");
      expect(resolved.records[0].response.body.details.value).toBe(
        "The value is 42."
      );
      expect(resolved.id).toBe("param-pact-1");
      expect(resolved.info).toEqual({ type: "parameterized" });
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve a parameterized $ref with multiple placeholders and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          multiParamDef: {
            greeting: "Hi {{firstName}} {{lastName}}, welcome!",
          },
        },
        records: [
          {
            request: { method: "GET", path: "/greeting" },
            response: {
              status: 200,
              body: {
                $ref: "#/definitions/multiParamDef?firstName=John&lastName=Doe",
              },
            },
          },
        ],
        id: "multi-param-pact",
        info: {},
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.greeting).toBe(
        "Hi John Doe, welcome!"
      );
      expect(resolved.id).toBe("multi-param-pact");
      expect(resolved.info).toEqual({});
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve a parameterized $ref with an array and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          arrayDef: {
            items: [
              "Item {{id}}",
              { fixed: "Value", dynamic: "Status: {{status}}" },
            ],
          },
        },
        records: [
          {
            request: { method: "GET", path: "/array-data" },
            response: {
              status: 200,
              body: {
                $ref: "#/definitions/arrayDef?id=123&status=active",
              },
            },
          },
        ],
        id: "array-pact",
      };

      const resolved = await resolvePact(doc);
      const responseBody = resolved.records[0].response.body;
      expect(responseBody.items[0]).toBe("Item 123");
      expect(responseBody.items[1].fixed).toBe("Value");
      expect(responseBody.items[1].dynamic).toBe("Status: active");
      expect(resolved.id).toBe("array-pact");
      expect(resolved.info).toBeUndefined();
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      const expectedKeys =
        resolved.info === undefined
          ? ["id", "records"]
          : ["id", "info", "records"];
      expect(Object.keys(resolved).sort()).toEqual(expectedKeys.sort());
    });

    it("should handle typed parameters and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          typedDef: {
            numeric: "Number: {{numVal}}",
            boolean: "Boolean: {{boolVal}}",
            rawNumeric: "{{numVal}}",
            rawBoolean: "{{boolVal}}",
            rawFloat: "{{floatVal}}",
            mixedString:
              "Count: {{numVal}}, Active: {{boolVal}}, Value: {{strVal}}",
            malformedInt: "{{badInt}}",
            malformedFloat: "{{badFloat}}",
            malformedBool: "{{badBool}}",
            untypedNum: "{{untypedNum}}",
          },
        },
        records: [
          {
            request: { method: "GET", path: "/typed-data" },
            response: {
              status: 200,
              body: {
                $ref: "#/definitions/typedDef?numVal=Int(100)&boolVal=Bool(true)&floatVal=Float(123.45)&strVal=hello&badInt=Int(abc)&badFloat=Float(xyz.qr)&badBool=Bool(yes)&untypedNum=99",
              },
            },
          },
        ],
        id: "typed-pact",
        info: defaultPactInfo,
      };
      const resolved = await resolvePact(doc);
      const resultRecordBody = resolved.records[0].response.body;
      expect(resultRecordBody.numeric).toBe("Number: 100");
      expect(resultRecordBody.boolean).toBe("Boolean: true");
      expect(resultRecordBody.rawNumeric).toBe(100);
      expect(typeof resultRecordBody.rawNumeric).toBe("number");
      expect(resultRecordBody.rawBoolean).toBe(true);
      expect(typeof resultRecordBody.rawBoolean).toBe("boolean");
      expect(resultRecordBody.rawFloat).toBe(123.45);
      expect(typeof resultRecordBody.rawFloat).toBe("number");
      expect(resultRecordBody.mixedString).toBe(
        "Count: 100, Active: true, Value: hello"
      );
      expect(resultRecordBody.malformedInt).toBe("Int(abc)");
      expect(typeof resultRecordBody.malformedInt).toBe("string");
      expect(resultRecordBody.malformedFloat).toBe("Float(xyz.qr)");
      expect(typeof resultRecordBody.malformedFloat).toBe("string");
      expect(resultRecordBody.malformedBool).toBe("Bool(yes)");
      expect(typeof resultRecordBody.malformedBool).toBe("string");
      expect(resultRecordBody.untypedNum).toBe("99");
      expect(typeof resultRecordBody.untypedNum).toBe("string");

      expect(resolved.id).toBe("typed-pact");
      expect(resolved.info).toEqual(defaultPactInfo);
      expect(resolved).not.toHaveProperty("definitions");
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should correctly handle typed parameters with internal $ref and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          internalTypedDef: {
            internalNumeric: "{{numVal}}",
            internalBoolean: "{{boolVal}}",
            internalStringInterp: "Value: {{numVal}}",
          },
        },
        records: [
          {
            request: { method: "GET", path: "/internal-typed" },
            response: {
              status: 200,
              body: {
                $ref: "#/definitions/internalTypedDef?numVal=Int(255)&boolVal=Bool(false)",
              },
            },
          },
        ],
        id: "internal-typed-pact",
        info: { source: "internal" },
      };
      const resolved = await resolvePact(doc);
      const instanceRecordBody = resolved.records[0].response.body;
      expect(instanceRecordBody.internalNumeric).toBe(255);
      expect(typeof instanceRecordBody.internalNumeric).toBe("number");
      expect(instanceRecordBody.internalBoolean).toBe(false);
      expect(typeof instanceRecordBody.internalBoolean).toBe("boolean");
      expect(instanceRecordBody.internalStringInterp).toBe("Value: 255");

      expect(resolved.id).toBe("internal-typed-pact");
      expect(resolved.info).toEqual({ source: "internal" });
      expect(resolved).not.toHaveProperty("definitions");
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve parameterized $ref whose definition contains a simple $ref and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          primitive: "A simple string value.",
          complexDef: {
            message: "Parameterized: {{val}}",
            internalRef: { $ref: "#/definitions/primitive" },
          },
        },
        records: [
          {
            request: { method: "GET", path: "/complex" },
            response: {
              status: 200,
              body: {
                $ref: "#/definitions/complexDef?val=TestValue",
              },
            },
          },
        ],
        id: "complex-ref-pact",
      };
      const resolved = await resolvePact(doc);
      const outputBody = resolved.records[0].response.body;
      expect(outputBody.message).toBe("Parameterized: TestValue");
      expect(outputBody.internalRef).toBe("A simple string value.");
      expect(resolved.id).toBe("complex-ref-pact");
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      const expectedKeys =
        resolved.info === undefined
          ? ["id", "records"]
          : ["id", "info", "records"];
      expect(Object.keys(resolved).sort()).toEqual(expectedKeys.sort());
    });

    it("should leave placeholders if no parameters are provided and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          needsParams: { message: "Data: {{data}}" },
        },
        records: [
          {
            request: { method: "GET", path: "/needs-params" },
            response: {
              status: 200,
              body: { $ref: "#/definitions/needsParams" },
            },
          },
        ],
        id: "no-param-pact",
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.message).toBe("Data: {{data}}");
      expect(resolved.id).toBe("no-param-pact");
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      const expectedKeys =
        resolved.info === undefined
          ? ["id", "records"]
          : ["id", "info", "records"];
      expect(Object.keys(resolved).sort()).toEqual(expectedKeys.sort());
    });

    it("should leave placeholders if $ref parameters do not match and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          specificPlaceholders: { message: "Value: {{value}}" },
        },
        records: [
          {
            request: { method: "GET", path: "/specific" },
            response: {
              status: 200,
              body: {
                $ref: "#/definitions/specificPlaceholders?otherParam=irrelevant",
              },
            },
          },
        ],
        id: "mismatch-param-pact",
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.message).toBe(
        "Value: {{value}}"
      );
      expect(resolved.id).toBe("mismatch-param-pact");
      expect(resolved.definitions).toBeUndefined();
      expect(resolved).not.toHaveProperty("definitions");
      const expectedKeys =
        resolved.info === undefined
          ? ["id", "records"]
          : ["id", "info", "records"];
      expect(Object.keys(resolved).sort()).toEqual(expectedKeys.sort());
    });

    it("should handle $ref to a definition that is a parameterized string and return C8yPact structure", async () => {
      const doc = {
        definitions: {
          primitiveTemplate: "Value: {{val}}",
        },
        records: [
          {
            request: { method: "GET", path: "/primitive-string" },
            response: {
              status: 200,
              body: { $ref: "#/definitions/primitiveTemplate?val=Test" },
            },
          },
        ],
        id: "primitive-param-string-pact",
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body).toBe("Value: Test");
      expect(resolved.id).toBe("primitive-param-string-pact");
      expect(resolved.definitions).toBeUndefined();
      const expectedKeys =
        resolved.info === undefined
          ? ["id", "records"]
          : ["id", "info", "records"];
      expect(Object.keys(resolved).sort()).toEqual(expectedKeys.sort());
    });

    it("should return null if input doc is null or not an object", async () => {
      expect(await resolvePact(null)).toBeNull();
      expect(await resolvePact(undefined)).toBeUndefined();
      expect(await resolvePact("string")).toBe("string");
      expect(await resolvePact(123)).toBe(123);
    });

    it("should return C8yPact with empty records, id, info if not present in input", async () => {
      const doc = {
        definitions: {
          simple: { message: "Hello" },
        },
        someOtherProp: { $ref: "#/definitions/simple" },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records).toBeUndefined();
      expect(resolved.id).toBeUndefined();
      expect(resolved.info).toBeUndefined();
      expect(resolved.definitions).toBeUndefined();
      expect(resolved.someOtherProp).toBeUndefined();
      expect(Object.keys(resolved).length).toBe(0);
    });

    it("should correctly pick only records, id, and info properties", async () => {
      const doc = {
        definitions: {
          dataDef: { value: "test data" },
        },
        records: [
          {
            request: { method: "GET", path: "/item" },
            response: {
              status: 200,
              body: { $ref: "#/definitions/dataDef" },
            },
          },
        ],
        id: "pact123",
        info: { version: "1.0" },
        extraProperty: "should be removed",
        anotherExtra: { key: "value" },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.value).toBe("test data");
      expect(resolved.id).toBe("pact123");
      expect(resolved.info).toEqual({ version: "1.0" });
      expect(resolved.definitions).toBeUndefined();
      expect(resolved.extraProperty).toBeUndefined();
      expect(resolved.anotherExtra).toBeUndefined();
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });
  });

  describe("external file $refs", () => {
    beforeEach(() => {
      jest.spyOn(process, "cwd").mockReturnValue(CWD);

      vol.fromNestedJSON({
        [CWD]: {
          test: {
            fixtures: {
              "externalDef.json": JSON.stringify({
                simpleExternal: {
                  message: "Hello from external file!",
                },
              }),
              "externalParameterizedDef.json": JSON.stringify({
                parameterizedExternal: {
                  greeting: "Greetings, {{name}}, from an external source!",
                  detail: "Your value is {{value}}.",
                },
              }),
              "externalRefToExternal.json": JSON.stringify({
                externalContainer: {
                  name: "Container for another external def",
                  containedDef: { $ref: "./externalDef.json#/simpleExternal" },
                },
              }),
              "externalTypedDef.json": JSON.stringify({
                externalNumeric: "{{numVal}}",
                externalBoolean: "{{boolVal}}",
                externalStringInterp: "Value: {{numVal}}",
              }),
            },
          },
        },
      });
    });

    afterEach(() => {
      vol.reset();
    });

    afterAll(() => {
      jest.restoreAllMocks();
    });

    it("should directly read and verify content of a mocked JSON file", () => {
      const filePath = path.join(CWD, "test/fixtures", "externalDef.json");
      expect(fs.existsSync(filePath)).toBe(true);

      const fileContent = fs.readFileSync(filePath, "utf-8");
      const expectedJson = {
        simpleExternal: {
          message: "Hello from external file!",
        },
      };
      expect(JSON.parse(fileContent as string)).toEqual(expectedJson);
    });

    it("should resolve a simple $ref to an external file and return C8yPact structure", async () => {
      const doc = {
        records: [
          {
            request: { method: "GET", path: "/external-simple" },
            response: {
              status: 200,
              body: { $ref: "test/fixtures/externalDef.json#/simpleExternal" },
            },
          },
        ],
        id: "ext-simple-pact",
        info: defaultPactInfo,
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.message).toBe(
        "Hello from external file!"
      );
      expect(resolved.id).toBe("ext-simple-pact");
      expect(resolved.info).toEqual(defaultPactInfo);
      expect(resolved.definitions).toBeUndefined();
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve a simple $ref to an external file using file:// URI and return C8yPact structure", async () => {
      const absoluteFilePath = path.join(
        CWD,
        "test",
        "fixtures",
        "externalDef.json"
      );
      const fileUri = url.pathToFileURL(absoluteFilePath).href;

      const doc = {
        records: [
          {
            request: { method: "GET", path: "/external-uri" },
            response: {
              status: 200,
              body: { $ref: `${fileUri}#/simpleExternal` },
            },
          },
        ],
        id: "ext-uri-pact",
        info: defaultPactInfo,
      };
      const resolved = await resolvePact(doc);
      expect(resolved.records[0].response.body.message).toBe(
        "Hello from external file!"
      );
      expect(resolved.id).toBe("ext-uri-pact");
      expect(resolved.info).toEqual(defaultPactInfo);
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve a parameterized $ref to an external file and return C8yPact structure", async () => {
      const doc = {
        records: [
          {
            request: { method: "GET", path: "/external-param" },
            response: {
              status: 200,
              body: {
                $ref: "test/fixtures/externalParameterizedDef.json#/parameterizedExternal?name=Galaxy&value=123",
              },
            },
          },
        ],
        id: "ext-param-pact",
        info: defaultPactInfo,
      };
      const resolved = await resolvePact(doc);
      const responseBody = resolved.records[0].response.body;
      expect(responseBody.greeting).toBe(
        "Greetings, Galaxy, from an external source!"
      );
      expect(responseBody.detail).toBe("Your value is 123.");
      expect(resolved.id).toBe("ext-param-pact");
      expect(resolved.info).toEqual(defaultPactInfo);
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should resolve an external $ref that points to another external file and return C8yPact structure", async () => {
      const doc = {
        records: [
          {
            request: { method: "GET", path: "/external-ext" },
            response: {
              status: 200,
              body: {
                $ref: "test/fixtures/externalRefToExternal.json#/externalContainer",
              },
            },
          },
        ],
        id: "ext-ext-pact",
        info: defaultPactInfo,
      };
      const resolved = await resolvePact(doc);
      const responseBody = resolved.records[0].response.body;
      expect(responseBody.name).toBe("Container for another external def");
      expect(responseBody.containedDef.message).toBe(
        "Hello from external file!"
      );
      expect(resolved.id).toBe("ext-ext-pact");
      expect(resolved.info).toEqual(defaultPactInfo);
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });

    it("should correctly handle typed parameters in external files and return C8yPact structure", async () => {
      const doc = {
        records: [
          {
            request: { method: "GET", path: "/external-typed" },
            response: {
              status: 200,
              body: {
                $ref: "test/fixtures/externalTypedDef.json?numVal=Int(255)&boolVal=Bool(false)",
              },
            },
          },
        ],
        id: "ext-typed-pact",
        info: { type: "external-typed" },
      };
      const resolved = await resolvePact(doc);
      const instanceRecordBody = resolved.records[0].response.body;
      expect(instanceRecordBody.externalNumeric).toBe(255);
      expect(typeof instanceRecordBody.externalNumeric).toBe("number");
      expect(instanceRecordBody.externalBoolean).toBe(false);
      expect(typeof instanceRecordBody.externalBoolean).toBe("boolean");
      expect(instanceRecordBody.externalStringInterp).toBe("Value: 255");

      expect(resolved.id).toBe("ext-typed-pact");
      expect(resolved.info).toEqual({ type: "external-typed" });
      expect(Object.keys(resolved).sort()).toEqual(
        ["id", "info", "records"].sort()
      );
    });
  });
});
