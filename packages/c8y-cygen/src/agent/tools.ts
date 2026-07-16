import path from "node:path";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BrowserTools } from "../browser/browserTools.js";
import { writeSpec } from "../spec/writeSpec.js";
import { runCypressSpec } from "../cypress/cypressRunner.js";

/**
 * The agent's tool surface (design doc §5.2): browser exploration tools bound
 * to one persistent session, plus write_spec and run_cypress. capture_network
 * -> fixture freezing (M5) and the bounded self-heal wrapper around
 * run_cypress (M6) are layered on top of this in later milestones - this is
 * the mechanical wiring that lets the agent explore, write a spec, and run it.
 */
export function buildAgentTools(browser: BrowserTools, appRepoPath: string) {
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
