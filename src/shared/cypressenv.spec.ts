/// <reference types="jest" />

import { c8yEnv, syncEnvToExpose } from "./cypressenv";

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

// creates Cypress.env() and Cypress.expose() as Cypress 15 does (setter_getter in the
// Cypress driver): the number of arguments decides between get and set, a single object
// argument sets all its values, and reset() deletes all values
function setterGetter(state: Store) {
  const fn: any = function (key?: string | Store, value?: any) {
    switch (arguments.length) {
      case 0:
        return state;
      case 1:
        if (typeof key === "string") return state[key];
        return Object.assign(state, key);
      default:
        state[key as string] = value;
        return value;
    }
  };
  fn.reset = () => {
    for (const key in state) delete state[key];
    return state;
  };
  return fn;
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
      // as when cumulocity-cypress is loaded
      syncEnvToExpose();
    });

    it("should prefer Cypress.expose() and fall back to Cypress.env()", () => {
      exposed.C8Y_SHELL_NAME = "cockpit";
      expect(c8yEnv("C8Y_TENANT")).toBe("exposed");
      expect(c8yEnv("C8Y_USERNAME")).toBe("admin");
      expect(c8yEnv("C8Y_SHELL_NAME")).toBe("cockpit");
      expect(c8yEnv()).toEqual({
        C8Y_TENANT: "exposed",
        C8Y_USERNAME: "admin",
        C8Y_SHELL_NAME: "cockpit",
      });
    });

    it("should see values set with Cypress.env() after the plugin exposed config.env", () => {
      // the plugin exposed the configured value, the test changes it with Cypress.env()
      exposed.C8Y_PACT_MODE = "apply";
      env.C8Y_PACT_MODE = "apply";
      global.Cypress.env("C8Y_PACT_MODE", "recording");
      expect(c8yEnv("C8Y_PACT_MODE")).toBe("recording");
      expect(c8yEnv().C8Y_PACT_MODE).toBe("recording");
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

  // Cypress 15.10 to 15.x have two separate stores. The plugin copies config.env into
  // config.expose, so a variable is in both stores, and each can be changed on its own:
  // with Cypress.env() and Cypress.expose(), and with env and expose test overrides,
  // which Cypress applies and restores with the same functions (see mutateConfiguration
  // in the Cypress driver).
  describe("Cypress 15 (separate env and expose stores)", () => {
    let exposed: Store;
    let env: Store;
    beforeEach(() => {
      // as exposed by the plugin from config.env
      env = { C8Y_TENANT: "t1", C8Y_PLUGIN_LOADED: "true" };
      exposed = { ...env };
      global.Cypress = { env: setterGetter(env), expose: setterGetter(exposed) };
      // as when cumulocity-cypress is loaded
      syncEnvToExpose();
    });

    it("should see values set with Cypress.expose()", () => {
      global.Cypress.expose("C8Y_TENANT", "t2");
      expect(c8yEnv("C8Y_TENANT")).toBe("t2");
      expect(c8yEnv().C8Y_TENANT).toBe("t2");
    });

    it("should see variables unset with Cypress.expose()", () => {
      global.Cypress.expose("C8Y_PLUGIN_LOADED", undefined);
      expect(c8yEnv("C8Y_PLUGIN_LOADED")).toBeUndefined();
    });

    it("should see values set with Cypress.env()", () => {
      global.Cypress.env("C8Y_TENANT", "t2");
      expect(c8yEnv("C8Y_TENANT")).toBe("t2");
      expect(c8yEnv().C8Y_TENANT).toBe("t2");
    });

    it("should see the latest value if both are changed", () => {
      global.Cypress.env("C8Y_TENANT", "t2");
      global.Cypress.expose("C8Y_TENANT", "t3");
      expect(c8yEnv("C8Y_TENANT")).toBe("t3");
      global.Cypress.env({ C8Y_TENANT: "t4" });
      expect(c8yEnv("C8Y_TENANT")).toBe("t4");
    });

    it("should see values of a stubbed Cypress.expose()", () => {
      const stubbed: Store = { ...exposed, C8Y_PLUGIN_LOADED: undefined };
      global.Cypress.expose = (key?: string) => (key ? stubbed[key] : stubbed);
      expect(c8yEnv("C8Y_PLUGIN_LOADED")).toBeUndefined();
    });

    it("should apply and restore an expose test override", () => {
      const restore = applyOverrides({ expose: { C8Y_TENANT: "t2" } });
      expect(c8yEnv("C8Y_TENANT")).toBe("t2");
      restore();
      expect(c8yEnv("C8Y_TENANT")).toBe("t1");
    });

    it("should apply and restore an expose test override of a new variable", () => {
      const restore = applyOverrides({ expose: { C8Y_PACT_MODE: "recording" } });
      expect(c8yEnv("C8Y_PACT_MODE")).toBe("recording");
      restore();
      expect(c8yEnv("C8Y_PACT_MODE")).toBeUndefined();
      expect(c8yEnv()).not.toHaveProperty("C8Y_PACT_MODE");
    });

    it("should keep values written in a test with an env test override", () => {
      const restore = applyOverrides({ env: { C8Y_PACT_MODE: "recording" } });
      c8yEnv("C8Y_LOGGED_IN_USER", "admin");
      restore();
      expect(c8yEnv("C8Y_LOGGED_IN_USER")).toBe("admin");
      expect(c8yEnv("C8Y_PACT_MODE")).toBeUndefined();
    });

    it("should apply and restore an env test override", () => {
      const restore = applyOverrides({
        env: { C8Y_TENANT: "t2", C8Y_PACT_MODE: "recording" },
      });
      expect(c8yEnv("C8Y_TENANT")).toBe("t2");
      expect(c8yEnv("C8Y_PACT_MODE")).toBe("recording");
      restore();
      expect(c8yEnv("C8Y_TENANT")).toBe("t1");
      expect(c8yEnv("C8Y_PACT_MODE")).toBeUndefined();
    });

    it("should restore test overrides while Cypress.expose() is stubbed", () => {
      // Cypress restores the test overrides before the stubs of the test
      const restore = applyOverrides({});
      const original = global.Cypress.expose;
      global.Cypress.expose = (key?: string) => (key ? exposed[key] : exposed);
      restore();
      global.Cypress.expose = original;
      expect(c8yEnv("C8Y_TENANT")).toBe("t1");
      // tests and plugins might read Cypress.expose() directly
      expect(global.Cypress.expose("C8Y_TENANT")).toBe("t1");
      expect(global.Cypress.expose("C8Y_PLUGIN_LOADED")).toBe("true");
    });

    it("should write values readable with Cypress.env() and Cypress.expose()", () => {
      c8yEnv("C8Y_LOGGED_IN_USER", "admin");
      expect(global.Cypress.env("C8Y_LOGGED_IN_USER")).toBe("admin");
      expect(global.Cypress.expose("C8Y_LOGGED_IN_USER")).toBe("admin");
    });

    // applies test overrides as Cypress 15 does (mutateConfiguration), and returns
    // the function that restores them after the test
    function applyOverrides(overrides: { env?: Store; expose?: Store }) {
      const cypress = global.Cypress;
      const globalEnv = { ...cypress.env() };
      if (overrides.env) cypress.env(overrides.env);
      const localTestEnv = cypress.env();
      const localTestEnvBackup = { ...localTestEnv };
      const exposeBackup = new Map<string, any>();
      Object.entries(overrides.expose ?? {}).forEach(([key, value]) => {
        const all = cypress.expose();
        exposeBackup.set(
          key,
          key in all ? { existed: true, value: all[key] } : { existed: false }
        );
        cypress.expose(key, value);
      });
      return () => {
        Object.entries(localTestEnv).forEach(([key, value]) => {
          if (localTestEnvBackup[key] !== value) globalEnv[key] = value;
        });
        exposeBackup.forEach((backup, key) => {
          if (backup.existed) cypress.expose(key, backup.value);
          else delete cypress.expose()[key];
        });
        cypress.env.reset();
        cypress.env(globalEnv);
      };
    }
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
      expect(c8yEnv()).toEqual({
        C8Y_TENANT: "t123",
        C8Y_LOGGED_IN_USER: "admin",
      });
    });
  });
});
