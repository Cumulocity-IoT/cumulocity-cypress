import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeSpec, WriteSpecError } from "./writeSpec.js";

describe("writeSpec", () => {
  let appRepoPath: string;

  beforeEach(async () => {
    appRepoPath = await mkdtemp(path.join(tmpdir(), "c8y-cygen-writespec-"));
  });

  afterEach(async () => {
    await rm(appRepoPath, { recursive: true, force: true });
  });

  it("writes the file, creating intermediate directories", async () => {
    const result = await writeSpec({
      appRepoPath,
      relativePath: "cypress/e2e/dataAndControlTeam/events.cy.ts",
      content: "describe('x', () => {});",
    });

    expect(result.absolutePath).toBe(
      path.join(appRepoPath, "cypress/e2e/dataAndControlTeam/events.cy.ts")
    );
    const written = await readFile(result.absolutePath, "utf-8");
    expect(written).toBe("describe('x', () => {});");
  });

  it("overwrites an existing file at the same path", async () => {
    await writeSpec({
      appRepoPath,
      relativePath: "cypress/e2e/x.cy.ts",
      content: "first",
    });
    const result = await writeSpec({
      appRepoPath,
      relativePath: "cypress/e2e/x.cy.ts",
      content: "second",
    });

    expect(await readFile(result.absolutePath, "utf-8")).toBe("second");
  });

  it("rejects an absolute relativePath", async () => {
    await expect(
      writeSpec({
        appRepoPath,
        relativePath: "/etc/passwd",
        content: "nope",
      })
    ).rejects.toBeInstanceOf(WriteSpecError);
  });

  it("rejects a relativePath that escapes the app repo via ../", async () => {
    await expect(
      writeSpec({
        appRepoPath,
        relativePath: "../../../etc/passwd",
        content: "nope",
      })
    ).rejects.toThrow(/escapes/);
  });

  it("rejects a relativePath that escapes via a deceptive nested ../ sequence", async () => {
    await expect(
      writeSpec({
        appRepoPath,
        relativePath: "cypress/e2e/../../../outside.cy.ts",
        content: "nope",
      })
    ).rejects.toBeInstanceOf(WriteSpecError);
  });
});
