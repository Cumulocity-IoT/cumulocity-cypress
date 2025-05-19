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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("internal $refs", () => {
    it("should resolve a simple internal $ref", async () => {
      const doc = {
        definitions: {
          simple: { message: "Hello" },
        },
        instance: { $ref: "#/definitions/simple" },
      };

      const resolved = await resolvePact(doc);
      expect(resolved.instance.message).toBe("Hello");
    });

    it("should resolve a parameterized $ref with object definition", async () => {
      const doc = {
        definitions: {
          parameterizedDef: {
            message: "Hello {{name}}!",
            details: {
              value: "The value is {{value}}.",
            },
          },
        },
        instance: {
          // Using #/ for internal refs as c8y:/ is normalized to #/
          $ref: "#/definitions/parameterizedDef?name=World&value=42",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.instance.message).toBe("Hello World!");
      expect(resolved.instance.details.value).toBe("The value is 42.");
    });

    it("should resolve a parameterized $ref with multiple placeholders in one string", async () => {
      const doc = {
        definitions: {
          multiParamDef: {
            greeting: "Hi {{firstName}} {{lastName}}, welcome!",
          },
        },
        usage: {
          $ref: "#/definitions/multiParamDef?firstName=John&lastName=Doe",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.usage.greeting).toBe("Hi John Doe, welcome!");
    });

    it("should resolve a parameterized $ref with an array in the definition", async () => {
      const doc = {
        definitions: {
          arrayDef: {
            items: [
              "Item {{id}}",
              { fixed: "Value", dynamic: "Status: {{status}}" },
            ],
          },
        },
        data: {
          $ref: "#/definitions/arrayDef?id=123&status=active",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.data.items[0]).toBe("Item 123");
      expect(resolved.data.items[1].fixed).toBe("Value");
      expect(resolved.data.items[1].dynamic).toBe("Status: active");
    });

    it("should convert parameters to strings during replacement", async () => {
      const doc = {
        definitions: {
          typedDef: {
            numeric: "Number: {{numVal}}",
            boolean: "Boolean: {{boolVal}}",
          },
        },
        result: {
          $ref: "#/definitions/typedDef?numVal=100&boolVal=true",
        },
      };
      const resolved = await resolvePact(doc);
      // Current implementation stringifies parameters
      expect(resolved.result.numeric).toBe("Number: 100");
      expect(resolved.result.boolean).toBe("Boolean: true");
    });

    it("should resolve parameterized $ref whose definition contains a simple $ref", async () => {
      const doc = {
        definitions: {
          primitive: "A simple string value.",
          complexDef: {
            message: "Parameterized: {{val}}",
            internalRef: { $ref: "#/definitions/primitive" },
          },
        },
        output: {
          $ref: "#/definitions/complexDef?val=TestValue",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.output.message).toBe("Parameterized: TestValue");
      expect(resolved.output.internalRef).toBe("A simple string value.");
    });

    it("should leave placeholders if no parameters are provided in $ref", async () => {
      const doc = {
        definitions: {
          needsParams: { message: "Data: {{data}}" },
        },
        instance: { $ref: "#/definitions/needsParams" }, // No query parameters
      };
      const resolved = await resolvePact(doc);
      // The custom resolver runs, but params object is empty.
      expect(resolved.instance.message).toBe("Data: {{data}}");
    });

    it("should leave placeholders if $ref parameters do not match", async () => {
      const doc = {
        definitions: {
          specificPlaceholders: { message: "Value: {{value}}" },
        },
        instance: {
          $ref: "#/definitions/specificPlaceholders?otherParam=irrelevant",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.instance.message).toBe("Value: {{value}}");
    });

    it("should handle $ref to a definition that is a parameterized string", async () => {
      const doc = {
        definitions: {
          primitiveTemplate: "Value: {{val}}",
        },
        instance: {
          $ref: "#/definitions/primitiveTemplate?val=Test",
        },
      };
      const resolved = await resolvePact(doc);
      // With the new three-stage approach, the string should be correctly parameterized.
      expect(resolved.instance).toBe("Value: Test");
    });
  });
  // --- Tests for External File References ---
  describe("external file $refs", () => {
    beforeEach(() => {
      // Ensure process.cwd() is mocked for each test in this suite
      jest.spyOn(process, "cwd").mockReturnValue(CWD);

      // Setup memfs volume. Files will be created relative to CWD.
      // e.g., /home/user/test/fixtures/externalDef.json
      vol.fromNestedJSON({
        [CWD]: {
          // Base path for the structure
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

    it("should resolve a simple $ref to an external file", async () => {
      const doc = {
        // $ref path is relative to the mocked CWD (/home/user/test)
        instance: { $ref: "test/fixtures/externalDef.json#/simpleExternal" },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.instance.message).toBe("Hello from external file!");
    });

    it("should resolve a simple $ref to an external file using file:// URI", async () => {
      // Construct an absolute path for memfs
      const absoluteFilePath = path.join(
        CWD,
        "test",
        "fixtures",
        "externalDef.json"
      );
      // Create a file URI. Note: path.join handles platform-specific separators.
      // For file URIs, forward slashes are standard. Node's url.pathToFileURL is robust.
      const fileUri = url.pathToFileURL(absoluteFilePath).href;

      const doc = {
        instance: { $ref: `${fileUri}#/simpleExternal` },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.instance.message).toBe("Hello from external file!");
    });

    it("should resolve a parameterized $ref to an external file", async () => {
      const doc = {
        instance: {
          // $ref path is relative to the mocked CWD
          $ref: "test/fixtures/externalParameterizedDef.json#/parameterizedExternal?name=Galaxy&value=123",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.instance.greeting).toBe(
        "Greetings, Galaxy, from an external source!"
      );
      expect(resolved.instance.detail).toBe("Your value is 123.");
    });

    it("should resolve an external $ref that points to another external file (relative path)", async () => {
      const doc = {
        instance: {
          // $ref path is relative to the mocked CWD
          $ref: "test/fixtures/externalRefToExternal.json#/externalContainer",
        },
      };
      const resolved = await resolvePact(doc);
      expect(resolved.instance.name).toBe("Container for another external def");
      expect(resolved.instance.containedDef.message).toBe(
        "Hello from external file!"
      );
    });
  });
});
