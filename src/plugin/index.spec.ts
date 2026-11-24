/// <reference types="jest" />

import {
  appendCountIfPathExists,
  C8yPactDefaultFileAdapter,
  configureC8yPlugin,
  configureC8yScreenshotPlugin,
  exposeC8yEnv,
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

    it("should remove copied variables removed from config.env when called again", () => {
      const config: any = {
        env: {
          C8Y_PACT_MODE: "recording",
          admin_password: "pw",
          C8Y_TENANT: "t1",
        },
      };
      exposeC8yEnv(config);
      delete config.env.C8Y_PACT_MODE;
      delete config.env.admin_password;
      exposeC8yEnv(config);
      expect(config.expose).toEqual({ C8Y_TENANT: "t1" });
    });

    it("should keep variables changed in config.expose when removed from config.env", () => {
      const config: any = { env: { C8Y_PACT_MODE: "recording" } };
      exposeC8yEnv(config);
      config.expose.C8Y_PACT_MODE = "apply";
      delete config.env.C8Y_PACT_MODE;
      exposeC8yEnv(config);
      expect(config.expose).toEqual({ C8Y_PACT_MODE: "apply" });
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

    describe("credentials", () => {
      const env = () => ({
        C8Y_TENANT: "t123",
        C8Y_USERNAME: "admin",
        C8Y_USER: "admin",
        C8Y_PASSWORD: "pw",
        C8Y_TOKEN: "token",
        C8Y_AUTHORIZATION: "auth",
        C8Y_XSRF_TOKEN: "xsrf",
        admin_username: "admin",
        admin_password: "pw",
        device_token: "token",
      });
      const credentialKeys = [
        "C8Y_AUTHORIZATION",
        "C8Y_PASSWORD",
        "C8Y_TOKEN",
        "C8Y_XSRF_TOKEN",
        "admin_password",
        "device_token",
      ];

      it("should copy credentials by default", () => {
        const config: any = { env: env() };
        exposeC8yEnv(config);
        expect(config.expose).toEqual(env());
      });

      it("should not copy credentials with exposeCredentials false", () => {
        const config: any = { env: env() };
        exposeC8yEnv(config, { exposeCredentials: false });
        expect(config.expose).toEqual({
          C8Y_TENANT: "t123",
          C8Y_USERNAME: "admin",
          C8Y_USER: "admin",
          admin_username: "admin",
          _c8yCredentialKeys: credentialKeys,
        });
      });

      it("should not copy credentials with C8Y_EXPOSE_CREDENTIALS false", () => {
        for (const value of [false, "false"]) {
          const config: any = {
            env: { ...env(), C8Y_EXPOSE_CREDENTIALS: value },
          };
          exposeC8yEnv(config);
          expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
          expect(config.expose._c8yCredentialKeys).toEqual(credentialKeys);
        }
      });

      describe("C8Y_EXPOSE_CREDENTIALS environment variable", () => {
        const names = [
          "C8Y_EXPOSE_CREDENTIALS",
          "CYPRESS_C8Y_EXPOSE_CREDENTIALS",
        ];
        afterEach(() => {
          names.forEach((name) => delete process.env[name]);
        });

        it("should not copy credentials with the variable set to false", () => {
          for (const name of names) {
            for (const value of ["false", "FALSE", "0"]) {
              process.env[name] = value;
              const config: any = { env: env() };
              exposeC8yEnv(config);
              expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
              expect(config.expose._c8yCredentialKeys).toEqual(credentialKeys);
              delete process.env[name];
            }
          }
        });

        it("should prefer the variable over config.env", () => {
          process.env.C8Y_EXPOSE_CREDENTIALS = "false";
          const config: any = {
            env: { ...env(), C8Y_EXPOSE_CREDENTIALS: true },
          };
          exposeC8yEnv(config);
          expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
        });

        it("should prefer exposeCredentials over the variable", () => {
          process.env.C8Y_EXPOSE_CREDENTIALS = "false";
          const config: any = { env: env() };
          exposeC8yEnv(config, { exposeCredentials: true });
          expect(config.expose.C8Y_PASSWORD).toBe("pw");
        });

        it("should be used by configureC8yPlugin", () => {
          process.env.C8Y_EXPOSE_CREDENTIALS = "false";
          const config: any = { env: env() };
          configureC8yPlugin(undefined as any, config, {
            pactFolder: "cypress/fixtures/c8ypact",
          });
          expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
          expect(config.expose.C8Y_USERNAME).toBe("admin");
        });
      });

      it("should prefer exposeCredentials over C8Y_EXPOSE_CREDENTIALS", () => {
        const config: any = {
          env: { ...env(), C8Y_EXPOSE_CREDENTIALS: "false" },
        };
        exposeC8yEnv(config, { exposeCredentials: true });
        expect(config.expose.C8Y_PASSWORD).toBe("pw");
        expect(config.expose).not.toHaveProperty("_c8yCredentialKeys");
      });

      it("should keep exposeCredentials when called again", () => {
        const config: any = { env: env() };
        exposeC8yEnv(config, { exposeCredentials: false });
        config.env.other_password = "pw2";
        exposeC8yEnv(config);
        expect(config.expose).not.toHaveProperty("other_password");
        expect(config.expose._c8yCredentialKeys).toEqual([
          ...credentialKeys,
          "other_password",
        ]);
      });

      it("should remove credentials copied before with exposeCredentials false", () => {
        const config: any = { env: env() };
        exposeC8yEnv(config);
        exposeC8yEnv(config, { exposeCredentials: false });
        expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
        expect(config.expose).not.toHaveProperty("admin_password");
        expect(config.expose.admin_username).toBe("admin");
      });

      it("should keep credentials set explicitly in config.expose", () => {
        const config: any = {
          env: env(),
          expose: { admin_password: "exposed" },
        };
        exposeC8yEnv(config, { exposeCredentials: false });
        expect(config.expose.admin_password).toBe("exposed");
        expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
      });

      it("should be passed by configureC8yPlugin", () => {
        const config: any = { env: env() };
        configureC8yPlugin(undefined as any, config, {
          pactFolder: "cypress/fixtures/c8ypact",
          exposeCredentials: false,
        } as any);
        expect(config.expose).not.toHaveProperty("C8Y_PASSWORD");
        expect(config.expose.C8Y_PLUGIN_LOADED).toBe("true");
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

    it("should be called by configureC8yScreenshotPlugin with the websocket disabled", () => {
      const config: any = {
        configFile: "/home/user/test/cypress.config.ts",
        env: { C8Y_TENANT: "t123", C8Y_DISABLE_WEBSOCKET: "true" },
      };
      const result = configureC8yScreenshotPlugin(jest.fn() as any, config, {
        baseUrl: "http://localhost:8080",
        screenshots: [],
      } as any);
      expect(result).toBe(config);
      expect(config.expose?.C8Y_TENANT).toBe("t123");
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
