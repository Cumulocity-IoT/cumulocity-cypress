/// <reference types="jest" />

import { C8yAjvSchemaMatcher } from "../contrib/ajv";
import schema from "./schema.json";

describe("c8yscrn schema", () => {
  const base = {
    baseUrl: "http://localhost:8080",
    global: { viewportWidth: 800, viewportHeight: 600 },
    screenshots: [{ image: "/a.png", visit: "/apps/cockpit/index.html" }],
  };

  const withGlobal = (global: any) => ({
    ...base,
    global: { ...base.global, ...global },
  });
  const withAction = (action: any) => ({
    ...base,
    screenshots: [{ ...base.screenshots[0], actions: [action] }],
  });

  function validate(data: any): boolean {
    const matcher = new C8yAjvSchemaMatcher();
    return matcher.ajv.validate(schema, data) as boolean;
  }

  it("should be a draft-07 schema with ScreenshotSetup as root", () => {
    const s: any = schema;
    expect(s.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(s.$ref).toBeUndefined();
    expect(s.type).toBe("object");
    expect(s.properties.screenshots).toBeDefined();
  });

  it("should accept a valid config", () => {
    expect(validate(base)).toBe(true);
  });

  it("should reject unknown properties", () => {
    expect(validate({ ...base, foo: 1 })).toBe(false);
    expect(validate(withGlobal({ foo: 1 }))).toBe(false);
    expect(validate(withAction({ highlight: { selector: "a", foo: 1 } }))).toBe(
      false
    );
    expect(validate(withAction({ click: { selector: { foo: "a" } } }))).toBe(
      false
    );
  });

  it("should validate integer properties", () => {
    expect(validate(withGlobal({ viewportWidth: 1000 }))).toBe(true);
    expect(validate(withGlobal({ viewportWidth: 100.5 }))).toBe(false);
    expect(validate(withGlobal({ viewportHeight: 100.5 }))).toBe(false);
    expect(validate(withGlobal({ viewportWidth: -1 }))).toBe(false);
  });

  it("should validate union and literal types", () => {
    expect(validate(withGlobal({ language: "fr" }))).toBe(true);
    expect(validate(withGlobal({ language: ["en", "de"] }))).toBe(true);
    expect(validate(withGlobal({ scrollBehavior: "center" }))).toBe(true);
    expect(validate(withGlobal({ scrollBehavior: false }))).toBe(true);
    expect(validate(withGlobal({ scrollBehavior: true }))).toBe(false);
    expect(validate(withAction({ blur: true }))).toBe(true);
    expect(validate(withAction({ blur: false }))).toBe(false);
    expect(validate(withAction({ highlight: { clear: true } }))).toBe(true);
    expect(
      validate(withAction({ click: { selector: { localized: { en: "a" } } } }))
    ).toBe(true);
  });

  it("should accept numbers as type values", () => {
    const type = (value: any) =>
      validate(withAction({ type: { selector: "c8y-form-group", value } }));
    expect(type("abc")).toBe(true);
    expect(type(12.2233)).toBe(true);
    expect(type(["AZ-54Z Rotor", 12.2233, null])).toBe(true);
    expect(type([["AZ-54Z Rotor", 12.2233], ["AZ-54Z Blade"]])).toBe(true);
    expect(type(true)).toBe(false);
    expect(type([{ a: 1 }])).toBe(false);
  });

  it("should validate tuples", () => {
    expect(validate(withAction({ screenshot: { padding: [1, 2] } }))).toBe(
      true
    );
    expect(
      validate(withAction({ screenshot: { padding: [1, 2, 3, 4, 5] } }))
    ).toBe(false);
  });
});
