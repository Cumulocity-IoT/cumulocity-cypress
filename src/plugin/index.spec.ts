/// <reference types="jest" />

import {
  appendCountIfPathExists,
  C8yPactDefaultFileAdapter,
  configureC8yPlugin,
  exposeC8yEnv,
  getFileUploadOptions,
} from "./index";
import path from "path";
import { vol } from "memfs";

jest.spyOn(process, "cwd").mockReturnValue("/home/user/test");
// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock("fs", () => require("memfs").fs);
// mock chokidar and ws to avoid esm related issues with upgrade to 5.0.0
// https://github.com/Cumulocity-IoT/cumulocity-cypress/pull/663
jest.mock("chokidar", () => ({
  watch: jest.fn(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));
jest.mock("ws", () => ({
  __esModule: true,
  default: {
    Server: jest.fn(() => ({
      on: jest.fn(),
      close: jest.fn(),
    })),
  },
}));

describe("plugin", () => {
  describe("exposeC8yEnv", () => {
    it("should copy config.env into config.expose", () => {
      const config: any = { env: { C8Y_TENANT: "t123", admin_password: "pw" } };
      expect(exposeC8yEnv(config)).toBe(config);
      expect(config.expose).toEqual({
        C8Y_TENANT: "t123",
        admin_password: "pw",
      });
      expect(config.expose).not.toBe(config.env);
    });

    it("should keep values already set in config.expose", () => {
      const config: any = {
        env: { C8Y_TENANT: "fromEnv", C8Y_VERSION: "1025.0.0" },
        expose: { C8Y_TENANT: "fromExpose", other: "value" },
      };
      exposeC8yEnv(config);
      expect(config.expose).toEqual({
        C8Y_TENANT: "fromExpose",
        C8Y_VERSION: "1025.0.0",
        other: "value",
      });
    });

    it("should update copied values when called again", () => {
      const config: any = {
        env: { C8Y_TENANT: "old-tenant", C8Y_VERSION: "1025.0.0" },
        expose: { other: "explicit" },
      };
      exposeC8yEnv(config);
      config.env.C8Y_TENANT = "new-tenant";
      config.env.C8Y_USER = "admin";
      config.expose.C8Y_VERSION = "explicit-version";
      exposeC8yEnv(config);
      expect(config.expose).toEqual({
        C8Y_TENANT: "new-tenant",
        C8Y_USER: "admin",
        C8Y_VERSION: "explicit-version",
        other: "explicit",
      });
    });

    it("should be called by configureC8yPlugin", () => {
      const config: any = { env: { C8Y_TENANT: "t123" } };
      configureC8yPlugin(undefined as any, config, {
        pactFolder: "cypress/fixtures/c8ypact",
      });
      expect(config.expose.C8Y_TENANT).toBe("t123");
      expect(config.expose.C8Y_PLUGIN_LOADED).toBe("true");
      expect(config.expose.C8Y_PACT_FOLDER).toBe(config.env.C8Y_PACT_FOLDER);
    });
  });

  describe("configurePlugin ", () => {
    it("should use pact folder from config", () => {
      const config = { env: {} };
      configureC8yPlugin(undefined as any, config as any, {
        pactFolder: "cypress/fixtures/c8ypact",
      });
      expect(path.resolve((config.env as any).C8Y_PACT_FOLDER)).toBe(
        path.resolve("/home/user/test/cypress/fixtures/c8ypact")
      );
      expect((config.env as any).C8Y_PLUGIN_LOADED).toBe("true");
    });

    it("should use pact folder from C8Y_PACT_FOLDER env variable", () => {
      const config = { env: {} };
      process.env.C8Y_PACT_FOLDER = "cypress/fixtures/c8ypact";
      configureC8yPlugin(undefined as any, config as any, {});
      expect(path.resolve((config.env as any).C8Y_PACT_FOLDER)).toBe(
        path.resolve("/home/user/test/cypress/fixtures/c8ypact")
      );
      expect((config.env as any).C8Y_PLUGIN_LOADED).toBe("true");
    });

    it("should use pact folder from CYPRESS_C8Y_PACT_FOLDER env variable", () => {
      const config = { env: {} };
      process.env.CYPRESS_C8Y_PACT_FOLDER = "cypress/fixtures/c8ypact";
      configureC8yPlugin(undefined as any, config as any, {});
      expect(path.resolve((config.env as any).C8Y_PACT_FOLDER)).toBe(
        path.resolve("/home/user/test/cypress/fixtures/c8ypact")
      );
      expect((config.env as any).C8Y_PLUGIN_LOADED).toBe("true");
    });

    it("should use default pact folder", () => {
      const config = { env: {} };
      configureC8yPlugin(undefined as any, config as any, {});
      expect(path.resolve((config.env as any).C8Y_PACT_FOLDER)).toBe(
        path.resolve("/home/user/test/cypress/fixtures/c8ypact")
      );
      expect((config.env as any).C8Y_PLUGIN_LOADED).toBe("true");
    });

    it("should use pact adapter from options", () => {
      const config = { env: {} };
      const pactAdapter = new C8yPactDefaultFileAdapter(
        "cypress/fixtures/c8ypact2"
      );
      configureC8yPlugin(undefined as any, config as any, {
        pactAdapter,
      });
      expect(path.resolve((config.env as any).C8Y_PACT_FOLDER)).toBe(
        path.resolve("/home/user/test/cypress/fixtures/c8ypact2")
      );
      expect((config.env as any).C8Y_PLUGIN_LOADED).toBe("true");
    });
  });

  describe("appendCountIfPathExists", () => {
    beforeEach(() => {
      vol.fromNestedJSON({
        "/home/user/test/cypress/screenshots": {
          "my-screenshot-05.png": Buffer.from([8, 6, 7, 5, 3, 0, 9]),
          "my-screenshot-04.png": Buffer.from([8, 6, 7, 5, 3, 0, 9]),
          "my-screenshot-04 (2).png": Buffer.from([8, 6, 7, 5, 3, 0, 9]),
          "my-screenshot-04 (3).png": Buffer.from([8, 6, 7, 5, 3, 0, 9]),
        },
      });
    });

    afterEach(() => {
      vol.reset();
    });

    it("should append count if path exists", () => {
      const result = appendCountIfPathExists(
        "/home/user/test/cypress/screenshots/my-screenshot-05.png"
      );
      expect(result).toBe(
        "/home/user/test/cypress/screenshots/my-screenshot-05 (2).png"
      );
    });

    it("should not append count if path does not exists", () => {
      const result = appendCountIfPathExists(
        "/home/user/test/cypress/screenshots/my-screenshot-01.png"
      );
      expect(result).toBe(
        "/home/user/test/cypress/screenshots/my-screenshot-01.png"
      );
    });

    it("should increase count", () => {
      const result = appendCountIfPathExists(
        "/home/user/test/cypress/screenshots/my-screenshot-04.png"
      );
      expect(result).toBe(
        "/home/user/test/cypress/screenshots/my-screenshot-04 (4).png"
      );
    });
  });

  describe("getFileUploadOptions", () => {
    beforeEach(() => {
      vol.fromNestedJSON({
        "/home/user/test/": {
          "c8yscrn.config.yaml": Buffer.from([8, 6, 7, 5, 3, 0, 9]),
          "file.json": Buffer.from(JSON.stringify({ test: "value" })),
          "file.myjson": Buffer.from(JSON.stringify({ test: "myjson" })),
        },
      });
    });

    afterEach(() => {
      vol.reset();
    });

    it("should return null for unsupported file extension", () => {
      const result = getFileUploadOptions(
        { path: "/home/user/test/cypress/fixtures/c8ypact/my-file.html" },
        "/home/user/test/c8yscrn.config.yaml",
        "/home/user/test"
      );
      expect(result).toBe(null);
    });

    it("should return null if path does not exist", () => {
      const result = getFileUploadOptions(
        { path: "/home/user/test/cypress/fixtures/c8ypact/my-file.json" },
        "/home/user/test/c8yscrn.config.yaml",
        "/home/user/test"
      );
      expect(result).toBe(null);
    });

    it("should return object for json file", () => {
      const result = getFileUploadOptions(
        { path: "/home/user/test/file.json" },
        "/home/user/test/c8yscrn.config.yaml",
        "/home/user/test"
      );
      expect(result?.data).toEqual({ test: "value" });
      expect(result?.filename).toBe("file.json");
      expect(result?.path).toBe("/home/user/test/file.json");
    });

    it("should allow overwriting name of file with filename", () => {
      const result = getFileUploadOptions(
        { path: "/home/user/test/file.myjson", fileName: "my-file.json" },
        "/home/user/test/c8yscrn.config.yaml",
        "/home/user/test"
      );
      expect(result?.data).toEqual({ test: "myjson" });
      expect(result?.filename).toBe("my-file.json");
      expect(result?.path).toBe("/home/user/test/file.myjson");
    });
  });
});
