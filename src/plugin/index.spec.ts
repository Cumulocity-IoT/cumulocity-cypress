/// <reference types="jest" />

import {
  appendCountIfPathExists,
  C8yPactDefaultFileAdapter,
  configureC8yPlugin,
  getFileUploadOptions,
  resolvePactRefs,
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

  describe("resolvePactRefs", () => {
    const log = jest.fn();

    const validPact = () => ({
      id: "my-pact",
      info: {},
      templates: { reload: { request: { method: "POST", url: "/reload" } } },
      records: [{ $ref: "#/templates/reload" }],
    });

    // the template "doesNotExist" is not defined in templates
    const pactWithMissingTemplate = () => ({
      id: "my-pact",
      info: {},
      templates: { reload: { request: { method: "POST", url: "/reload" } } },
      records: [
        { $ref: "#/templates/reload" },
        { $ref: "#/templates/doesNotExist" },
      ],
    });

    beforeEach(() => {
      log.mockClear();
    });

    it("should resolve refs", async () => {
      const result = await resolvePactRefs(validPact(), undefined, log);
      expect(result.records[0].request).toEqual({
        method: "POST",
        url: "/reload",
      });
    });

    it("should resolve refs with failOnError enabled", async () => {
      const result = await resolvePactRefs(validPact(), undefined, log, {
        failOnError: true,
      });
      expect(result.records[0].request).toEqual({
        method: "POST",
        url: "/reload",
      });
    });

    it("should return the original pact on error by default", async () => {
      const pact = pactWithMissingTemplate();
      const result = await resolvePactRefs(pact, undefined, log);
      expect(result).toBe(pact);
      expect(result.records[1]).toEqual({ $ref: "#/templates/doesNotExist" });
    });

    it("should return the original pact on error if failOnError is false", async () => {
      const pact = pactWithMissingTemplate();
      const result = await resolvePactRefs(pact, undefined, log, {
        failOnError: false,
      });
      expect(result).toBe(pact);
    });

    it("should throw on error if failOnError is enabled", async () => {
      const promise = resolvePactRefs(
        pactWithMissingTemplate(),
        undefined,
        log,
        { failOnError: true }
      );
      await expect(promise).rejects.toThrow(
        "Failed to resolve $ref references for pact with id: 'my-pact'"
      );
      await expect(promise).rejects.toThrow("doesNotExist");
      await expect(promise).rejects.toThrow("records/1");
    });

    it("should still log the error if failOnError is enabled", async () => {
      await resolvePactRefs(pactWithMissingTemplate(), undefined, log, {
        failOnError: true,
      }).catch((): void => undefined);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("Error during $ref resolving")
      );
    });

    it("should return invalid json string by default", async () => {
      const result = await resolvePactRefs("{ invalid", undefined, log);
      expect(result).toBe("{ invalid");
    });

    it("should throw for invalid json string if failOnError is enabled", async () => {
      await expect(
        resolvePactRefs("{ invalid", undefined, log, { failOnError: true })
      ).rejects.toThrow("Error parsing pact from string");
    });

    it("should return stringified result for string input", async () => {
      const result = await resolvePactRefs(
        JSON.stringify(validPact()),
        undefined,
        log,
        { failOnError: true }
      );
      expect(typeof result).toBe("string");
      expect(JSON.parse(result).records[0].request.method).toBe("POST");
    });
  });

  describe("c8ypact:resolve task", () => {
    const getResolveTask = (options: any) => {
      const tasks: Record<string, (pact: any) => Promise<any>> = {};
      const on = jest.fn((event: string, handlers: any) => {
        if (event === "task") Object.assign(tasks, handlers);
      });
      configureC8yPlugin(on as any, { env: {} } as any, {
        pactFolder: "cypress/fixtures/c8ypact",
        ...options,
      });
      return tasks["c8ypact:resolve"];
    };

    const pactWithMissingTemplate = () => ({
      id: "my-pact",
      info: {},
      records: [{ $ref: "#/templates/doesNotExist" }],
    });

    it("should return unresolved pact by default", async () => {
      const pact = pactWithMissingTemplate();
      await expect(getResolveTask({})(pact)).resolves.toBe(pact);
    });

    it("should return unresolved pact if failOnPactRefError is false", async () => {
      const pact = pactWithMissingTemplate();
      await expect(
        getResolveTask({ failOnPactRefError: false })(pact)
      ).resolves.toBe(pact);
    });

    it("should fail if failOnPactRefError is enabled", async () => {
      await expect(
        getResolveTask({ failOnPactRefError: true })(pactWithMissingTemplate())
      ).rejects.toThrow("Failed to resolve $ref references");
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
