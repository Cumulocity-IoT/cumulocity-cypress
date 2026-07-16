import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCypressRunResult } from "./cypressRunner.js";

/**
 * These fixtures are real cypress.run() output, captured against a throwaway
 * local Cypress project (cypress@14.5.4) - not hand-authored JSON. See
 * test/fixtures/README.md for how they were produced.
 */
function loadFixture(name: string): unknown {
  const fixturePath = path.resolve(process.cwd(), "test/fixtures", name);
  return JSON.parse(readFileSync(fixturePath, "utf-8"));
}

describe("parseCypressRunResult", () => {
  describe("a run with one passing and one failing test (real capture)", () => {
    const fixture = loadFixture("cypress-run-mixed-pass-fail.json") as any;
    const result = parseCypressRunResult(fixture);

    it("is not a pass", () => {
      expect(result.pass).toBe(false);
    });

    it("reports no spec-level failures", () => {
      expect(result.specFailures).toEqual([]);
    });

    it("reports exactly the one failed test, with its title and error", () => {
      expect(result.testFailures).toHaveLength(1);
      expect(result.testFailures[0].title).toEqual([
        "mixed results",
        "fails with a clear assertion error",
      ]);
      expect(result.testFailures[0].errorMessage).toContain(
        "expected 2 to equal 3"
      );
    });

    it("matches the auto-captured failure screenshot to the failed test", () => {
      expect(result.testFailures[0].screenshotPath).toBeDefined();
      expect(result.testFailures[0].screenshotPath).toContain(
        "mixed results -- fails with a clear assertion error (failed).png"
      );
    });
  });

  describe("a run where the whole spec fails to compile (real capture)", () => {
    const fixture = loadFixture("cypress-run-spec-compile-error.json") as any;
    const result = parseCypressRunResult(fixture);

    it("is not a pass", () => {
      expect(result.pass).toBe(false);
    });

    it("reports it as a spec failure, not a test failure", () => {
      expect(result.testFailures).toEqual([]);
      expect(result.specFailures).toHaveLength(1);
      expect(result.specFailures[0].specRelativePath).toBe(
        "cypress/e2e/broken.cy.js"
      );
      expect(result.specFailures[0].errorMessage).toContain(
        "we found an error preparing this test file"
      );
    });
  });

  describe("a fully passing run (synthetic, minimal shape)", () => {
    it("reports pass: true with no failures", () => {
      const result = parseCypressRunResult({
        totalFailed: 0,
        runs: [
          {
            error: null,
            spec: { relative: "cypress/e2e/ok.cy.js" },
            screenshots: [],
            tests: [
              {
                title: ["suite", "passes"],
                state: "passed",
                displayError: null,
              },
            ],
          },
        ],
      } as any);

      expect(result).toEqual({
        pass: true,
        testFailures: [],
        specFailures: [],
      });
    });
  });

  describe("Cypress could not run at all (CypressFailedRunResult)", () => {
    it("reports it as a spec failure carrying the top-level message", () => {
      const result = parseCypressRunResult({
        status: "failed",
        failures: 1,
        message: "Can't run because no spec files were found.",
      });

      expect(result.pass).toBe(false);
      expect(result.testFailures).toEqual([]);
      expect(result.specFailures).toEqual([
        {
          specRelativePath: "",
          errorMessage: "Can't run because no spec files were found.",
        },
      ]);
    });
  });
});
