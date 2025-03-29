/// <reference types="jest" />

import { C8yAjvSchemaMatcher } from "./ajv";
import fs from "fs";
import path from "path";
import yaml from "yaml";

describe("C8yAjvSchemaMatcher", () => {
  describe("initialization", () => {
    it("should create an instance of Ajv", function () {
      const matcher = new C8yAjvSchemaMatcher();
      expect(matcher.ajv).toBeDefined();
      expect(matcher.ajv.opts.strict).toBeFalsy();
    });

    it("should create an instance of Ajv with strict mode", function () {
      const matcher = new C8yAjvSchemaMatcher(true);
      expect(matcher.ajv).toBeDefined();
      expect(matcher.ajv.opts.strict).toBeTruthy();
    });

    it("should create an instance of Ajv with strict mode and metas", function () {
      const matcher = new C8yAjvSchemaMatcher([{}], true);
      expect(matcher.ajv).toBeDefined();
      expect(matcher.ajv.opts.strict).toBeTruthy();
    });

    it("should add formats to Ajv", function () {
      const matcher = new C8yAjvSchemaMatcher();
      expect(matcher.ajv.formats).toBeDefined();
      expect(matcher.ajv.formats["semver-range"]).toBeDefined();
      expect(matcher.ajv.formats["semver-version"]).toBeDefined();
      expect(matcher.ajv.formats["boolean"]).toBeDefined();
      expect(matcher.ajv.formats["integer"]).toBeDefined();
      expect(matcher.ajv.formats["uri"]).toBeDefined();
      expect(matcher.ajv.formats["uri-reference"]).toBeDefined();
      expect(matcher.ajv.formats["url"]).toBeDefined();
      expect(matcher.ajv.formats["uuid"]).toBeDefined();
      expect(matcher.ajv.formats["hostname"]).toBeDefined();
      expect(matcher.ajv.formats["date-time"]).toBeDefined();
      expect(matcher.ajv.formats["date"]).toBeDefined();
      expect(matcher.ajv.formats["password"]).toBeDefined();
    });

    it("should have allowUnionTypes set to true", function () {
      const matcher = new C8yAjvSchemaMatcher();
      expect(matcher.ajv.opts.allowUnionTypes).toBeTruthy();
    });
  });

  describe("openapi", () => {
    const loadOpenApi = () => {
      // load file from jest moduleNameMapper to get the path
      const openApiPath = path.resolve(
        __dirname,
        "../../test/fixtures/Specifications.yaml"
      );
      const openapiYaml = fs.readFileSync(openApiPath, "utf-8");
      const openapi = yaml.parse(openapiYaml);
      return openapi;
    };

    let matcher: C8yAjvSchemaMatcher;

    beforeEach(() => {
      const openapi = loadOpenApi();
      // pass false to disable strict mode, we do not want to register the openapi schema
      matcher = new C8yAjvSchemaMatcher(undefined, false);
      matcher.ajv.addSchema(openapi, "openapi");
      expect(matcher.ajv.validate("openapi", openapi)).toBeTruthy();
    });

    it("should allow registering custom openapi schema", function () {
      expect(matcher!.ajv.getSchema("openapi")).toBeDefined();
    });

    it("should validate using openapi schema", function () {
      const json = {
        id: 123,
        name: "CypressTestAsset",
      };

      const schema = { $ref: "openapi#/components/schemas/Pet" };
      expect(matcher!.match(json, schema)).toBeTruthy();
    });

    it("should validate with strict mode", function () {
      const json = {
        id: 123,
        name: "CypressTestAsset",
        abc: "abc",
      };

      const schema = { $ref: "openapi#/components/schemas/Pet" };
      expect(() => matcher!.match(json, schema, true)).toThrow(
        "data must NOT have additional properties"
      );
    });
  });
});
