import { readFileSync } from "node:fs";
import path from "node:path";
import { parseScenario, ScenarioParseError } from "./scenarioContract.js";

const VALID_SCENARIO = `# Scenario: Widget preview updates live

> A note for readers, ignored by the parser.

## Objective

Verify that the preview updates immediately when the config changes.

## Preconditions

- An authenticated session against the target tenant.
- A dashboard with a configurable widget already exists.

## Setup

- Ensure the widget has at least two links, with fields:
  - \`label\`: a short display name
  - \`url\`: any valid URL
- *(mocked style: use cy.createMockedDevice; integration style: use cy.createDevice.)*

## Steps

1. Open the widget's config dialog.
2. Change the display option from Grid to List.

## Expected Outcomes

1. The preview switches to the list layout without saving.
2. No console warning about element re-creation is logged.

## Style

\`mocked\` (default; also supports \`integration\`).
`;

describe("parseScenario", () => {
  describe("a well-formed scenario", () => {
    const scenario = parseScenario(VALID_SCENARIO);

    it("extracts the title, stripping a leading 'Scenario:' label", () => {
      expect(scenario.title).toBe("Widget preview updates live");
    });

    it("returns Objective as trimmed prose", () => {
      expect(scenario.objective).toBe(
        "Verify that the preview updates immediately when the config changes."
      );
    });

    it("splits Preconditions into top-level list items", () => {
      expect(scenario.preconditions).toEqual([
        "An authenticated session against the target tenant.",
        "A dashboard with a configurable widget already exists.",
      ]);
    });

    it("keeps nested continuation lines attached to their parent Setup item", () => {
      expect(scenario.setup).toHaveLength(2);
      expect(scenario.setup[0]).toContain("Ensure the widget has at least two links");
      expect(scenario.setup[0]).toContain("`label`: a short display name");
      expect(scenario.setup[0]).toContain("`url`: any valid URL");
      expect(scenario.setup[1]).toContain("mocked style");
    });

    it("splits Steps into ordered top-level items", () => {
      expect(scenario.steps).toEqual([
        "Open the widget's config dialog.",
        "Change the display option from Grid to List.",
      ]);
    });

    it("splits Expected Outcomes into discrete assertable items", () => {
      expect(scenario.expectedOutcomes).toEqual([
        "The preview switches to the list layout without saving.",
        "No console warning about element re-creation is logged.",
      ]);
    });

    it("extracts the Style keyword from backtick-wrapped text", () => {
      expect(scenario.style).toBe("mocked");
    });
  });

  describe("title handling", () => {
    it("returns null when there is no H1 heading", () => {
      const withoutTitle = VALID_SCENARIO.replace(
        "# Scenario: Widget preview updates live\n\n",
        ""
      );
      expect(parseScenario(withoutTitle).title).toBeNull();
    });
  });

  describe("Style is optional", () => {
    it("returns style: null when the section is absent entirely", () => {
      const withoutStyle = VALID_SCENARIO.replace(
        /## Style\n\n`mocked`.*\n/s,
        ""
      );
      expect(parseScenario(withoutStyle).style).toBeNull();
    });
  });

  describe("case-insensitive and forward-compatible headings", () => {
    it("matches headings regardless of case", () => {
      const upper = VALID_SCENARIO.replace(
        "## Expected Outcomes",
        "## EXPECTED OUTCOMES"
      );
      expect(parseScenario(upper).expectedOutcomes).toHaveLength(2);
    });

    it("ignores unknown extra H2 sections without affecting parsing", () => {
      const withExtra = VALID_SCENARIO.replace(
        "## Style",
        "## Reviewer Notes\n\nSomething extra a scenario author added.\n\n## Style"
      );
      const scenario = parseScenario(withExtra);
      expect(scenario.style).toBe("mocked");
      expect(scenario.steps).toHaveLength(2);
    });
  });

  describe("missing required sections", () => {
    it("throws ScenarioParseError listing every missing section", () => {
      const blank = "# Scenario: Nothing here\n";
      expect(() => parseScenario(blank)).toThrow(ScenarioParseError);
      try {
        parseScenario(blank);
        fail("expected parseScenario to throw");
      } catch (e) {
        const error = e as ScenarioParseError;
        expect(error.missingSections).toEqual([
          "Objective",
          "Preconditions",
          "Setup",
          "Steps",
          "Expected Outcomes",
        ]);
        expect(error.malformedSections).toEqual([]);
      }
    });

    it("treats a heading with no content as missing, not merely empty", () => {
      const emptyObjective = VALID_SCENARIO.replace(
        "## Objective\n\nVerify that the preview updates immediately when the config changes.\n",
        "## Objective\n\n"
      );
      expect(() => parseScenario(emptyObjective)).toThrow(ScenarioParseError);
      try {
        parseScenario(emptyObjective);
        fail("expected parseScenario to throw");
      } catch (e) {
        expect((e as ScenarioParseError).missingSections).toEqual(["Objective"]);
      }
    });
  });

  describe("malformed sections", () => {
    it("rejects Steps written as prose instead of a list", () => {
      const proseSteps = VALID_SCENARIO.replace(
        "## Steps\n\n1. Open the widget's config dialog.\n2. Change the display option from Grid to List.\n",
        "## Steps\n\nOpen the dialog and change the display option.\n"
      );
      expect(() => parseScenario(proseSteps)).toThrow(ScenarioParseError);
      try {
        parseScenario(proseSteps);
        fail("expected parseScenario to throw");
      } catch (e) {
        expect((e as ScenarioParseError).malformedSections[0]).toContain("Steps");
      }
    });

    it("rejects Expected Outcomes written as prose instead of a list", () => {
      const proseOutcomes = VALID_SCENARIO.replace(
        "## Expected Outcomes\n\n1. The preview switches to the list layout without saving.\n2. No console warning about element re-creation is logged.\n",
        "## Expected Outcomes\n\nThe preview should update and stay quiet.\n"
      );
      expect(() => parseScenario(proseOutcomes)).toThrow(ScenarioParseError);
      try {
        parseScenario(proseOutcomes);
        fail("expected parseScenario to throw");
      } catch (e) {
        expect((e as ScenarioParseError).malformedSections[0]).toContain(
          "Expected Outcomes"
        );
      }
    });

    it("rejects a Style value that isn't mocked or integration", () => {
      const badStyle = VALID_SCENARIO.replace(
        "`mocked` (default; also supports `integration`).",
        "somewhere in between"
      );
      expect(() => parseScenario(badStyle)).toThrow(ScenarioParseError);
      try {
        parseScenario(badStyle);
        fail("expected parseScenario to throw");
      } catch (e) {
        expect((e as ScenarioParseError).malformedSections[0]).toContain("Style");
      }
    });

    it("reports missing and malformed sections together in one error", () => {
      const both = VALID_SCENARIO.replace(
        "## Objective\n\nVerify that the preview updates immediately when the config changes.\n",
        "## Objective\n\n"
      ).replace(
        "`mocked` (default; also supports `integration`).",
        "somewhere in between"
      );
      try {
        parseScenario(both);
        fail("expected parseScenario to throw");
      } catch (e) {
        const error = e as ScenarioParseError;
        expect(error.missingSections).toEqual(["Objective"]);
        expect(error.malformedSections[0]).toContain("Style");
        expect(error.message).toContain("missing or empty required section(s)");
        expect(error.message).toContain("malformed section(s)");
      }
    });
  });

  describe("the M0 oracle scenario", () => {
    it("parses the real events.scenario.md fixture end to end", () => {
      // Resolved from the package root, not this file's location, since jest
      // (per this package's jest.config.mjs) always runs from packages/c8y-cygen/.
      const fixturePath = path.resolve(process.cwd(), "test/oracle/events.scenario.md");
      const markdown = readFileSync(fixturePath, "utf-8");

      const scenario = parseScenario(markdown);

      expect(scenario.title).toBe(
        "Device event appears with correct details in the event timeline"
      );
      expect(scenario.objective).toContain("Verify that an event posted for a device");
      expect(scenario.preconditions.length).toBeGreaterThanOrEqual(2);
      expect(scenario.setup.length).toBeGreaterThanOrEqual(2);
      expect(scenario.steps).toHaveLength(4);
      expect(scenario.expectedOutcomes).toHaveLength(7);
      expect(scenario.style).toBe("mocked");
    });
  });
});
