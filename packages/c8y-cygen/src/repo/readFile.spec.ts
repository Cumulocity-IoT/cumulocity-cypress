import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readRepoFile, ReadFileError } from "./readFile.js";

describe("readRepoFile", () => {
  let appRepoPath: string;

  beforeEach(async () => {
    appRepoPath = await mkdtemp(path.join(tmpdir(), "c8y-cygen-readfile-"));
  });

  afterEach(async () => {
    await rm(appRepoPath, { recursive: true, force: true });
  });

  it("reads an existing file's content", async () => {
    await mkdir(path.join(appRepoPath, "cypress/support"), { recursive: true });
    await writeFile(
      path.join(appRepoPath, "cypress/support/commands.ts"),
      "Cypress.Commands.add('createDevice', () => {});",
      "utf-8"
    );

    const result = await readRepoFile({
      appRepoPath,
      relativePath: "cypress/support/commands.ts",
    });

    expect(result.absolutePath).toBe(
      path.join(appRepoPath, "cypress/support/commands.ts")
    );
    expect(result.content).toBe("Cypress.Commands.add('createDevice', () => {});");
  });

  it("rejects an absolute relativePath", async () => {
    await expect(
      readRepoFile({ appRepoPath, relativePath: "/etc/passwd" })
    ).rejects.toBeInstanceOf(ReadFileError);
  });

  it("rejects a relativePath that escapes the app repo via ../", async () => {
    await expect(
      readRepoFile({ appRepoPath, relativePath: "../../../etc/passwd" })
    ).rejects.toThrow(/escapes/);
  });

  it("rejects a relativePath that escapes via a deceptive nested ../ sequence", async () => {
    await expect(
      readRepoFile({
        appRepoPath,
        relativePath: "cypress/support/../../../outside.ts",
      })
    ).rejects.toBeInstanceOf(ReadFileError);
  });

  it("wraps a missing file into a clear ReadFileError", async () => {
    await expect(
      readRepoFile({ appRepoPath, relativePath: "does/not/exist.ts" })
    ).rejects.toBeInstanceOf(ReadFileError);
  });
});
