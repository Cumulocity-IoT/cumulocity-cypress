/// <reference types="jest" />

import _ from "lodash";
import {
  applyDefaultConfig,
  defaultLogger,
  getConfigFromArgs,
  getConfigFromArgsOrEnvironment,
  getConfigFromEnvironment,
  validateConfig,
} from "./startup-util";

import {
  C8yPactHttpControllerOptions,
  C8yPactDefaultFileAdapter,
  C8yPactHttpControllerDefaultMode,
  C8yPactHttpControllerDefaultRecordingMode,
} from "../../../src/shared/c8yctrl";

describe("startup util tests", () => {
  describe("getConfigFromArgs", () => {
    test("getConfigFromArgs should return partial config", () => {
      process.argv = [
        "node",
        "script.js",
        "--folder",
        "/my/folder",
        "--port",
        "1234",
        "--baseUrl",
        "http://example.com",
        "--user",
        "user",
        "--password",
        "password",
        "--tenant",
        "tenant",
        "--staticRoot",
        "static",
        "--mode",
        "mock",
        "--config",
        "c8yctrl.config.ts",
        "--log",
        "--logFile",
        "combined.log",
        "--accessLogFile",
        "access.log",
        "--logLevel",
        "debug",
        "--apps",
        "ooe/1020",
      ];
      const [config, configFile] = getConfigFromArgs();
      expect(config.folder).toBe("/my/folder");
      expect(config.port).toBe(1234);
      expect(config.baseUrl).toBe("http://example.com");
      expect(config.user).toBe("user");
      expect(config.password).toBe("password");
      expect(config.tenant).toBe("tenant");
      expect(config.staticRoot).toBe("static");
      expect(config.mode).toBe("mock");
      expect(configFile).toBe("c8yctrl.config.ts");
      expect(config.log).toBeTruthy();
      expect(config.logFilename).toBe("combined.log");
      expect(config.accessLogFilename).toBe("access.log");
      expect(config.logLevel).toBe("debug");
      expect(config.appsVersions).toMatchObject({ ooe: "1020" });
    });

    test("getConfigFromArgs should support aliases", () => {
      process.argv = [
        "node",
        "script.js",
        "--pactFolder",
        "/my/folder",
        "--static",
        "static",
      ];
      const [config] = getConfigFromArgs();
      expect(config.folder).toBe("/my/folder");
      expect(config.staticRoot).toBe("static");
    });

    test("getConfigFromArgs should not use default values", () => {
      process.argv = ["node", "script.js"];
      const [config] = getConfigFromArgs();
      expect(config.mode).toBe("forward");
      expect(config.recordingMode).toBe("append");
    });

    test("getConfigFromArgs should work with logLevel", () => {
      process.argv = ["node", "script.js", "--logLevel", "debug"];
      const [config] = getConfigFromArgs();
      expect(config.logLevel).toBe("debug");
      process.argv = ["node", "script.js", "--logLevel", "unsupportedValue"];
      const [config2] = getConfigFromArgs();
      expect(config2.logLevel).toBeUndefined();
    });

    test("getConfigFromArgs should work with boolean values", () => {
      process.argv = ["node", "script.js", "--log", "false"];
      const [config] = getConfigFromArgs();
      expect(config.log).toBe(false);
    });

    test("getConfigFromArgs should work with apps array values", () => {
      process.argv = [
        "node",
        "script.js",
        "--apps",
        "app1/1019",
        "--apps",
        "app2/1020",
      ];
      const [config] = getConfigFromArgs();
      expect(config.appsVersions).toMatchObject({ app1: "1019", app2: "1020" });
    });
  });

  describe("getConfigFromEnvironment", () => {
    test("getConfigFromEnvironment should return partial config", () => {
      process.env.C8Y_PACT_FOLDER = "/my/folder";
      process.env.C8Y_HTTP_PORT = "1234";
      process.env.C8Y_BASE_URL = "http://example.com";
      process.env.C8Y_BASE_USERNAME = "user";
      process.env.C8Y_BASE_PASSWORD = "password";
      process.env.C8Y_BASE_TENANT = "tenant";
      process.env.C8Y_STATIC_ROOT = "/my/static/root";
      process.env.C8Y_PACT_MODE = "record";
      process.env.C8Y_PACT_RECORDING_MODE = "replace";
      process.env.C8Y_LOG_FILE = "combined.log";
      process.env.C8Y_ACCESS_LOG_FILE = "access.log";
      process.env.C8Y_LOG = "false";
      process.env.C8Y_LOG_LEVEL = "debug";
      const config = getConfigFromEnvironment();
      expect(config.folder).toBe("/my/folder");
      expect(config.port).toBe(1234);
      expect(config.baseUrl).toBe("http://example.com");
      expect(config.user).toBe("user");
      expect(config.password).toBe("password");
      expect(config.tenant).toBe("tenant");
      expect(config.staticRoot).toBe("/my/static/root");
      expect(config.logFilename).toBe("combined.log");
      expect(config.accessLogFilename).toBe("access.log");
      expect(config.mode).toBe("record");
      expect(config.recordingMode).toBe("replace");
      expect(config.log).toBeFalsy();
      expect(config.logLevel).toBe("debug");
    });
  });

  describe("getConfigFromArgsOrEnvironment", () => {
    test("should return config from args", () => {
      process.argv = [
        "node",
        "script.js",
        "--folder",
        "/my/folder",
        "--port",
        "1234",
        "--baseUrl",
        "http://example.com",
        "--user",
        "user",
        "--password",
        "password",
        "--tenant",
        "tenant",
        "--staticRoot",
        "static",
        "--config",
        "c8yctrl.config.ts",
      ];
      const [config, configFile] = getConfigFromArgsOrEnvironment();
      expect(config.folder).toBe("/my/folder");
      expect(config.port).toBe(1234);
      expect(config.baseUrl).toBe("http://example.com");
      expect(config.user).toBe("user");
      expect(config.password).toBe("password");
      expect(config.tenant).toBe("tenant");
      expect(config.staticRoot).toBe("static");
      expect(configFile).toBe("c8yctrl.config.ts");
    });

    test("should return config from environment", () => {
      process.env.C8Y_PACT_FOLDER = "/my/folder";
      process.env.C8Y_HTTP_PORT = "1234";
      process.env.C8Y_BASE_URL = "http://example.com";
      process.env.C8Y_BASE_USERNAME = "user";
      process.env.C8Y_BASE_PASSWORD = "password";
      process.env.C8Y_BASE_TENANT = "tenant";
      process.env.C8Y_STATIC_ROOT = "/my/static/root";
      process.env.C8Y_PACT_MODE = "record";
      process.argv = ["node", "script.js"];
      const [config, configFile] = getConfigFromArgsOrEnvironment();
      expect(config.folder).toBe("/my/folder");
      expect(config.port).toBe(1234);
      expect(config.baseUrl).toBe("http://example.com");
      expect(config.user).toBe("user");
      expect(config.password).toBe("password");
      expect(config.tenant).toBe("tenant");
      expect(config.staticRoot).toBe("/my/static/root");
      expect(config.mode).toBe("record");
      expect(configFile).toBeUndefined();
    });

    test("should return config from args and environment", () => {
      process.env.C8Y_PACT_FOLDER = "/my/folder";
      process.env.C8Y_HTTP_PORT = "1234";
      process.env.C8Y_BASE_URL = "http://example.com";
      process.env.C8Y_PACT_RECORDING_MODE = "replace";
      process.argv = [
        "node",
        "script.js",
        "--user",
        "user",
        "--password",
        "password",
        "--tenant",
        "tenant",
        "--staticRoot",
        "/my/static/root",
        "--config",
        "c8yctrl.config.ts",
        "--mode",
        "record",
      ];
      const [config, configFile] = getConfigFromArgsOrEnvironment();
      expect(config.folder).toBe("/my/folder");
      expect(config.port).toBe(1234);
      expect(config.baseUrl).toBe("http://example.com");
      expect(config.user).toBe("user");
      expect(config.password).toBe("password");
      expect(config.tenant).toBe("tenant");
      expect(config.staticRoot).toBe("/my/static/root");
      expect(config.mode).toBe("record");
      expect(config.recordingMode).toBe("replace");
      expect(configFile).toBe("c8yctrl.config.ts");
    });
  });

  describe("applyDefaultConfig", () => {
    test("applyDefaultConfig should apply defaults", () => {
      const config: any = {};
      applyDefaultConfig(config);
      expect(config.adapter).toBeDefined();
      expect(config.on).toBeDefined();
      expect(config.mockNotFoundResponse).toBeDefined();
      expect(config.logger).toBeDefined();
      expect(config.logger).toBe(defaultLogger);
      expect(config.accessLogFilename).toBeUndefined();
      expect(config.logFilename).toBeUndefined();
      expect(config.requestMatching).toBeDefined();
      expect(config.preprocessor).toBeDefined();
      expect(config.errorLogger).toBeDefined();
    });

    test("applyDefaultConfig should not overwrite existing values", () => {
      const config: C8yPactHttpControllerOptions = {
        adapter: new C8yPactDefaultFileAdapter("/my/folder"),
        on: {
          beforeStart: () => {},
        },
      };
      applyDefaultConfig(config);
      expect(config.on.beforeStart).toBeDefined();
      expect(config.adapter.getFolder()).toBe("/my/folder");
    });

    test("should create C8yAuthOptions if not provided", () => {
      const config: any = {
        user: "user",
        password: "password",
        tenant: "tenant",
      };
      applyDefaultConfig(config);
      expect(config.auth).toBeDefined();
      expect(config.auth.user).toBe("user");
      expect(config.auth.password).toBe("password");
      expect(config.auth.tenant).toBe("tenant");
    });

    test("lodash isFunction should return false for undefined", () => {
      expect(_.isFunction(undefined)).toBeFalsy();
    });
  });

  describe("validateConfig", () => {
    test("should validate mode", () => {
      const config: C8yPactHttpControllerOptions = {
        mode: "unsupported",
        recordingMode: "unsupported",
      } as any;
      expect(() => validateConfig(config)).toThrow();
    });

    test("should validate recordingMode", () => {
      const config: C8yPactHttpControllerOptions = {
        mode: "record",
        recordingMode: "unsupported",
      } as any;
      expect(() => validateConfig(config)).toThrow();
    });

    test("should not throw for valid config", () => {
      const config: C8yPactHttpControllerOptions = {
        mode: C8yPactHttpControllerDefaultMode,
        recordingMode: C8yPactHttpControllerDefaultRecordingMode,
      } as any;
      expect(() => validateConfig(config)).not.toThrow();
    });
  });
});
