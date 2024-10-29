/// <reference types="jest" />

import * as yaml from "yaml";

import { C8yAjvSchemaMatcher } from "../contrib/ajv";
import {
  createInitConfig,
  resolveConfigOptions,
  resolveScreenshotFolder,
} from "./helper";
import schema from "./../screenshot/schema.json";

jest.spyOn(process, "cwd").mockReturnValue("/home/user/test");

describe("startup", () => {
  const ajv = new C8yAjvSchemaMatcher();

  describe("createInitConfig", () => {
    it("should be valid yaml", () => {
      expect(() => {
        const data = yaml.parse(createInitConfig("http://localhost:8080"));
        expect(data).not.toBeNull();
        ajv.match(data, schema, true);
      }).not.toThrow();
    });
  });

  describe("resolveScreenshotFolder", () => {
    it("should throw error for current working directory", () => {
      expect(() => {
        resolveScreenshotFolder({
          folder: ".",
        });
      }).toThrow(
        `Please provide a screenshot folder path that does not resolve to the current working directory.`
      );
    });

    it("should throw error for current working directory with absolute path", () => {
      expect(() => {
        resolveScreenshotFolder({
          // use trailing slash
          folder: "/home/user/test/",
        });
      }).toThrow(
        `Please provide a screenshot folder path that does not resolve to the current working directory.`
      );
    });

    it("should throw error for current working directory with path operations", () => {
      expect(() => {
        resolveScreenshotFolder({
          // use trailing slash
          folder: "/home/../home/user/test/",
        });
      }).toThrow(
        `Please provide a screenshot folder path that does not resolve to the current working directory.`
      );
    });

    it("should return folder for current working directory", () => {
      expect(resolveScreenshotFolder({ folder: "c8yscrn" })).toBe(
        "/home/user/test/c8yscrn"
      );
    });

    it("should return absolute folder", () => {
      expect(
        resolveScreenshotFolder({ folder: "/my/path/to/c8yscrn/folder" })
      ).toBe("/my/path/to/c8yscrn/folder");
    });

    it("should return folder for folder hierarchy", () => {
      expect(resolveScreenshotFolder({ folder: "my/c8yscrn/folder" })).toBe(
        "/home/user/test/my/c8yscrn/folder"
      );
    });
  });

  describe("resolveConfigOptions", () => {
    it("should return default options", () => {
      const options = resolveConfigOptions({});
      expect(options.browser).toBe("chrome");
      expect(options.quiet).toBe(true);
      expect(options.testingType).toBe("e2e");
      expect(options.config.e2e.baseUrl).toBe("http://localhost:8080");
      expect(options.config.e2e.screenshotsFolder).toBe(
        "/home/user/test/c8yscrn"
      );
      expect(options.config.e2e.trashAssetsBeforeRuns).toBe(false);
      expect(options.config.e2e.specPattern.endsWith(".ts")).toBe(true);
      expect(options.configFile.endsWith(".ts")).toBe(true);
    });

    it("should return custom options", () => {
      const options = resolveConfigOptions({
        browser: "firefox",
        clear: true,
        folder: "my/c8yscrn/folder",
        tags: ["tag1", "tag2"],
        baseUrl: "http://localhost:4200",
      });
      expect(options.browser).toBe("firefox");
      expect(options.quiet).toBe(true);
      expect(options.testingType).toBe("e2e");
      expect(options.config.e2e.baseUrl).toBe("http://localhost:4200");
      expect(options.config.e2e.screenshotsFolder).toBe(
        "/home/user/test/my/c8yscrn/folder"
      );
      expect(options.config.e2e.trashAssetsBeforeRuns).toBe(true);
      expect(options.config.e2e.specPattern.endsWith(".ts")).toBe(true);
      expect(options.configFile.endsWith(".ts")).toBe(true);
    });
  });

  describe("resolveBaseUrl", () => {
    const originalEnv = process.env;
    beforeAll(() => {
      process.env = {
        ...originalEnv,
        C8Y_BASEURL: "http://localhost:4200",
      };
    });
    afterAll(() => {
      process.env = originalEnv;
    });
    
    it("should return custom base url", () => {
      expect(
        resolveConfigOptions({ baseUrl: "http://localhost:4200" }).config.e2e
          .baseUrl
      ).toBe("http://localhost:4200");
    });

    it("should return base url from env", () => {
      expect(resolveConfigOptions({}).config.e2e.baseUrl).toBe(
        "http://localhost:4200"
      );
    });
  });
});
