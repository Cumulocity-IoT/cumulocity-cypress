import path from "node:path";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BrowserTools } from "../browser/browserTools.js";
import { writeSpec } from "../spec/writeSpec.js";
import { runCypressSpec } from "../cypress/cypressRunner.js";
import { shapeIntercept } from "../fixture/fixtureFreezer.js";

/**
 * The agent's tool surface (design doc §5.2): browser exploration tools bound
 * to one persistent session, write_spec, run_cypress, and stage_fixture. The
 * bounded self-heal wrapper around run_cypress (M6) is layered on top of this
 * in a later milestone - this is the mechanical wiring that lets the agent
 * explore, write a spec, and run it.
 *
 * stage_fixture deliberately stops short of writing a fixture file: freezing
 * one for real is gated on human confirmation (redaction policy - captured
 * responses may carry customer data/PII/hostnames), so freezeFixture() is not
 * exposed here at all. Only the CLI's interactive confirm step (M7) is meant
 * to call it - see fixture/fixtureFreezer.ts.
 */

/** One stage_fixture proposal, recorded for the CLI's later confirm gate. */
export interface StagedFixture {
  relativePath: string;
  content: unknown;
  interceptSnippet: string;
}

/**
 * Side channel the self-heal loop (agent/selfHeal.ts) and CLI (cli.ts) read
 * after a run to find out what the agent actually did, so they can
 * independently re-run Cypress/check the assertion trace and surface staged
 * fixtures for human confirmation, rather than trusting the agent's own
 * run_cypress tool call or its final-turn summary. freezeFixture() itself is
 * still never reachable by the agent - only this bookkeeping is.
 */
export interface AgentSessionRecord {
  lastSpecRelativePath?: string;
  lastSpecContent?: string;
  stagedFixtures: StagedFixture[];
}

export function buildAgentTools(
  browser: BrowserTools,
  appRepoPath: string,
  sessionRecord?: AgentSessionRecord
) {
  return [
    betaZodTool({
      name: "browser_navigate",
      description:
        "Navigate the persistent authenticated browser session to a path relative to the app base URL (or an absolute URL).",
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "e.g. '/apps/devicemanagement/index.html#/device/123/events'"
          ),
      }),
      run: async ({ path: navPath }) => {
        await browser.navigate(navPath);
        return `Navigated to ${navPath}`;
      },
    }),

    betaZodTool({
      name: "browser_snapshot",
      description:
        "Return the accessibility tree of the current page (or a scoped selector) - what is actually rendered, not pixels.",
      inputSchema: z.object({
        selector: z
          .string()
          .optional()
          .describe("Optional CSS selector to scope the snapshot to."),
      }),
      run: async ({ selector }) =>
        browser.snapshot(selector ? { selector } : {}),
    }),

    betaZodTool({
      name: "list_data_cy",
      description:
        "Enumerate every [data-cy] element currently in the DOM: the exact selectors available, with tag, visible text, and visibility. Real selectors, zero hallucination.",
      inputSchema: z.object({}),
      run: async () => JSON.stringify(await browser.listDataCy(), null, 2),
    }),

    betaZodTool({
      name: "browser_click",
      description: "Click the element matched by a CSS selector.",
      inputSchema: z.object({ selector: z.string() }),
      run: async ({ selector }) => {
        await browser.click(selector);
        return `Clicked ${selector}`;
      },
    }),

    betaZodTool({
      name: "browser_type",
      description: "Clear and type text into the element matched by a CSS selector.",
      inputSchema: z.object({ selector: z.string(), text: z.string() }),
      run: async ({ selector, text }) => {
        await browser.type(selector, text);
        return `Typed into ${selector}`;
      },
    }),

    betaZodTool({
      name: "capture_network",
      description:
        "Return recently captured request/response exchanges, optionally filtered by pathname and/or method. The source for cy.intercept and fixtures.",
      inputSchema: z.object({
        pathname: z.string().optional(),
        method: z.string().optional(),
      }),
      run: async ({ pathname, method }) =>
        JSON.stringify(await browser.captureNetwork({ pathname, method }), null, 2),
    }),

    betaZodTool({
      name: "stage_fixture",
      description:
        "Shape the most recent captured network exchange matching a pathname (and " +
        "optional method) into a cy.intercept(...) line plus fixture JSON. Does NOT " +
        "write anything to disk - fixture files require human confirmation before " +
        "they exist (redaction policy: captured responses may contain customer " +
        "data/PII/internal hostnames). Use the returned intercept snippet in your " +
        "spec, and note in your final summary which staged fixtures still need a " +
        "human to review and freeze them.",
      inputSchema: z.object({
        pathname: z.string(),
        method: z.string().optional(),
        fixtureRelativePath: z
          .string()
          .describe(
            "Path relative to cypress/fixtures/ in the target app repo, e.g. 'events/list.json'."
          ),
        alias: z
          .string()
          .optional()
          .describe("cy.intercept(...).as(alias), for cy.wait('@alias')."),
      }),
      run: async ({ pathname, method, fixtureRelativePath, alias }) => {
        const exchanges = await browser.captureNetwork({ pathname, method });
        if (exchanges.length === 0) {
          return (
            `No captured network exchange matched pathname=${pathname}` +
            `${method ? ` method=${method}` : ""}. Trigger it first (navigate/click/type), then retry.`
          );
        }
        const exchange = exchanges[exchanges.length - 1];
        const interceptSnippet = shapeIntercept({
          exchange,
          fixtureRelativePath,
          alias,
        });
        sessionRecord?.stagedFixtures.push({
          relativePath: fixtureRelativePath,
          content: exchange.responseBody,
          interceptSnippet,
        });
        return JSON.stringify(
          {
            interceptSnippet,
            fixtureRelativePath,
            fixtureContent: exchange.responseBody,
            note:
              "This fixture has NOT been written to disk. Use the intercept snippet " +
              "in your spec as-is, but flag in your final summary that this fixture " +
              "is pending human review/freeze before the spec can actually pass.",
          },
          null,
          2
        );
      },
    }),

    betaZodTool({
      name: "write_spec",
      description:
        "Write the generated Cypress spec into the target app repo's cypress/e2e tree.",
      inputSchema: z.object({
        relativePath: z
          .string()
          .describe(
            "Path relative to the app repo, e.g. cypress/e2e/dataAndControlTeam/events.cy.ts"
          ),
        content: z.string(),
      }),
      run: async ({ relativePath, content }) => {
        const result = await writeSpec({ appRepoPath, relativePath, content });
        if (sessionRecord) {
          sessionRecord.lastSpecRelativePath = relativePath;
          sessionRecord.lastSpecContent = content;
        }
        return `Wrote spec to ${result.absolutePath}`;
      },
    }),

    betaZodTool({
      name: "run_cypress",
      description:
        "Run a spec headless via the target app's own installed Cypress. Returns pass/fail plus per-test failure details and screenshot paths - the self-heal signal.",
      inputSchema: z.object({
        specRelativePath: z
          .string()
          .describe("Path to the spec, relative to the app repo."),
        baseUrl: z.string().optional(),
      }),
      run: async ({ specRelativePath, baseUrl }) => {
        const specPath = path.resolve(appRepoPath, specRelativePath);
        const result = await runCypressSpec({ appRepoPath, specPath, baseUrl });
        return JSON.stringify(result, null, 2);
      },
    }),
  ];
}
