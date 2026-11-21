/// <reference types="jest" />

import { c8yEnv } from "./cypressenv";

type Store = Record<string, any>;

// creates a function with the signature of Cypress.env() and Cypress.expose()
function accessor(store: Store) {
  return jest.fn((keyOrObject?: string | Store, ...value: any[]) => {
    if (keyOrObject == null) return { ...store };
    if (typeof keyOrObject === "object") {
      Object.assign(store, keyOrObject);
      return undefined;
    }
    if (value.length > 0) {
      store[keyOrObject] = value[0];
      return undefined;
    }
    return store[keyOrObject];
  });
}

describe("cypressenv", () => {
  const global = globalThis as any;

  afterEach(() => {
    delete global.Cypress;
  });

  it("should return an empty object and undefined without Cypress", () => {
    expect(c8yEnv()).toEqual({});
    expect(c8yEnv("C8Y_TENANT")).toBeUndefined();
  });

  describe("Cypress 16 (expose only)", () => {
    let exposed: Store;
    beforeEach(() => {
      exposed = { C8Y_TENANT: "t123" };
      global.Cypress = { expose: accessor(exposed) };
    });

    it("should read from Cypress.expose()", () => {
      expect(c8yEnv("C8Y_TENANT")).toBe("t123");
      expect(c8yEnv("C8Y_UNKNOWN")).toBeUndefined();
      expect(c8yEnv()).toEqual({ C8Y_TENANT: "t123" });
    });

    it("should write to Cypress.expose()", () => {
      c8yEnv("C8Y_LOGGED_IN_USER", "admin");
      c8yEnv({ C8Y_VERSION: "1025.0.0" });
      expect(exposed).toEqual({
        C8Y_TENANT: "t123",
        C8Y_LOGGED_IN_USER: "admin",
        C8Y_VERSION: "1025.0.0",
      });
    });

    it("should write undefined to unset a variable", () => {
      c8yEnv("C8Y_TENANT", undefined);
      expect(exposed).toHaveProperty("C8Y_TENANT", undefined);
      expect(c8yEnv("C8Y_TENANT")).toBeUndefined();
    });
  });

  describe("Cypress 15 (expose and env)", () => {
    let exposed: Store;
    let env: Store;
    beforeEach(() => {
      exposed = { C8Y_TENANT: "exposed" };
      env = { C8Y_TENANT: "env", C8Y_USERNAME: "admin" };
      global.Cypress = { expose: accessor(exposed), env: accessor(env) };
    });

    it("should prefer Cypress.expose() and fall back to Cypress.env()", () => {
      expect(c8yEnv("C8Y_TENANT")).toBe("exposed");
      expect(c8yEnv("C8Y_USERNAME")).toBe("admin");
      expect(c8yEnv()).toEqual({ C8Y_TENANT: "exposed", C8Y_USERNAME: "admin" });
    });

    it("should write to Cypress.expose() and Cypress.env()", () => {
      c8yEnv("C8Y_LOGGED_IN_USER", "admin");
      expect(exposed.C8Y_LOGGED_IN_USER).toBe("admin");
      expect(env.C8Y_LOGGED_IN_USER).toBe("admin");
    });

    it("should ignore errors of Cypress.env() with allowCypressEnv false", () => {
      global.Cypress.env = jest.fn(() => {
        throw new Error("Cypress.env() is not allowed");
      });
      expect(c8yEnv("C8Y_TENANT")).toBe("exposed");
      expect(c8yEnv("C8Y_USERNAME")).toBeUndefined();
      expect(c8yEnv()).toEqual({ C8Y_TENANT: "exposed" });
      expect(() => c8yEnv("C8Y_LOGGED_IN_USER", "admin")).not.toThrow();
      expect(exposed.C8Y_LOGGED_IN_USER).toBe("admin");
    });
  });

  describe("Cypress 14 (env only)", () => {
    let env: Store;
    beforeEach(() => {
      env = { C8Y_TENANT: "t123" };
      global.Cypress = { env: accessor(env) };
    });

    it("should read from and write to Cypress.env()", () => {
      expect(c8yEnv("C8Y_TENANT")).toBe("t123");
      c8yEnv("C8Y_LOGGED_IN_USER", "admin");
      expect(env.C8Y_LOGGED_IN_USER).toBe("admin");
      expect(c8yEnv()).toEqual({ C8Y_TENANT: "t123", C8Y_LOGGED_IN_USER: "admin" });
    });
  });
});
