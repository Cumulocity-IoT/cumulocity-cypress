/// <reference types="jest" />

import { C8yPactDefaultFileAdapter } from "./fileadapter";
import { fs, vol } from "memfs";
import path from "path";

class C8yPactDefaultFileAdapterMock extends C8yPactDefaultFileAdapter {
  createFolderRecursive(folderPath: string) {
    return super.createFolderRecursive(folderPath);
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
jest.mock("fs", () => require("memfs").fs);

const CWD = "/home/user/test";

describe("C8yPactDefaultFileAdapter", () => {
  beforeEach(() => {
    jest.spyOn(process, "cwd").mockReturnValue(CWD);
    vol.fromNestedJSON({
      "cypress/test/c8ypact": {
        "simpletest.json": Buffer.from(
          JSON.stringify({
            info: { id: "simpletest" },
            records: [],
            id: "simpletest",
          })
        ),
      },
    });
  });

  afterEach(() => {
    vol.reset();
  });

  describe("setup", () => {
    it("should create a new instance", () => {
      const adapter = new C8yPactDefaultFileAdapter(CWD);
      expect(adapter.getFolder()).toBe(CWD);
    });

    it("should make folder an absolute path", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        path.join("cypress", "test", "c8ypact")
      );
      expect(path.resolve(adapter.getFolder())).toBe(
        path.resolve(path.join(CWD, "cypress", "test", "c8ypact"))
      );
    });
  });

  describe("loadPacts", () => {
    it("should load pact object", () => {
      const adapter = new C8yPactDefaultFileAdapter(
        path.join("cypress", "test", "c8ypact")
      );
      const pacts = adapter.loadPacts();
      expect(pacts).toBeDefined();
      expect(pacts["simpletest"]).toBeDefined();
      expect(pacts["simpletest"].info.id).toBe("simpletest");
    });

    it("should return empty object if folder does not exist", () => {
      const adapter = new C8yPactDefaultFileAdapter(path.join(CWD, "23"));
      const pacts = adapter.loadPacts();
      expect(pacts).toEqual({});
    });
  });

  describe("createFolderRecursive", () => {
    it("should create folder recursively from absolute path", () => {
      const adapter = new C8yPactDefaultFileAdapterMock(CWD);
      const folderPath = path.join(CWD, "folder1", "folder2");

      expect(fs.existsSync(folderPath)).toBe(false);
      const result = adapter.createFolderRecursive(folderPath);
      expect(path.resolve(result as string)).toBe(
        path.resolve(path.join(CWD, "folder1", "folder2"))
      );

      // check mock-fs folder has been created
      expect(fs.existsSync(folderPath)).toBe(true);
    });

    it("should create recursively from relative path", () => {
      const adapter = new C8yPactDefaultFileAdapterMock(
        path.join("cypress", "test", "c8ypact")
      );
      const folderPath = path.join(CWD, "cypress2", "test2", "c8ypact2");

      expect(fs.existsSync(folderPath)).toBe(false);
      const result = path.resolve(
        adapter.createFolderRecursive(folderPath) as string
      );

      expect(fs.existsSync(folderPath)).toBe(true);
      expect(result.endsWith(path.join("cypress2", "test2", "c8ypact2"))).toBe(
        true
      );
    });

    it("should return undefined if absolute path already exists", () => {
      const adapter = new C8yPactDefaultFileAdapterMock(CWD);
      const folderPath = path.join(CWD, "cypress", "test", "c8ypact");

      expect(fs.existsSync(folderPath)).toBe(true);
      const result = adapter.createFolderRecursive(folderPath);
      expect(result).toBeUndefined();
    });

    it("should return undefined if relative path already exists", () => {
      const adapter = new C8yPactDefaultFileAdapterMock(
        path.join("cypress", "test", "c8ypact")
      );
      const result = adapter.createFolderRecursive(
        path.join("cypress", "test", "c8ypact")
      );
      expect(result).toBeUndefined();
    });

    it("should return undefined if folder path is not a string", () => {
      const adapter = new C8yPactDefaultFileAdapterMock(CWD);
      const folderPath: string | undefined = undefined;
      const result = adapter.createFolderRecursive(folderPath as any);
      expect(result).toBeUndefined();
      const result2 = adapter.createFolderRecursive({} as any);
      expect(result2).toBeUndefined();
    });
  });
});
