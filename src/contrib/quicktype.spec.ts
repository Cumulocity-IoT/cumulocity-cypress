/// <reference types="jest" />

import { C8yQicktypeSchemaGenerator } from "./quicktype";

describe.skip("C8yQicktypeSchemaGenerator", () => {
  it("should generate schema from object", async function () {
    const generator = new C8yQicktypeSchemaGenerator();
    const schema = await generator.generate({
      name: "test",
    });
    expect(schema).toStrictEqual({
      $schema: "http://json-schema.org/draft-06/schema#",
      $ref: "#/definitions/Root",
      definitions: {
        Root: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: {
              type: "string",
            },
          },
          required: ["name"],
          title: "Root",
        },
      },
    });
  });

  it("should generate schema without qt- properties and with name of root object", async function () {
    const expectedSchema = {
      $schema: "http://json-schema.org/draft-06/schema#",
      $ref: "#/definitions/Body",
      definitions: {
        Body: {
          type: "object",
          additionalProperties: false,
          properties: {
            self: {
              type: "string",
              format: "uri",
            },
            managedObjects: {
              type: "array",
              items: {
                $ref: "#/definitions/ManagedObject",
              },
            },
          },
          required: ["managedObjects", "self"],
          title: "Body",
        },
        ManagedObject: {
          type: "object",
          additionalProperties: false,
          properties: {
            self: {
              type: "string",
              format: "uri",
            },
            id: {
              type: "string",
              format: "integer",
            },
          },
          required: ["id", "self"],
          title: "ManagedObject",
        },
      },
    };
    const generator = new C8yQicktypeSchemaGenerator();
    const schema = await generator.generate(
      {
        self: "https://test.com",
        managedObjects: [
          {
            self: "https://test.com",
            id: "123123",
          },
        ],
      },
      { name: "Body" }
    );
    expect(schema).toStrictEqual(expectedSchema);
  });
});
