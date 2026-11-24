import { chromium } from "playwright";
import type { Browser, BrowserContext, Page, Response } from "playwright";
import type { AuthSession } from "../auth/authSession.js";
import { truncateForAgent } from "../util/truncateForAgent.js";

/**
 * Real, complex apps can render accessibility trees far larger than a few
 * thousand tokens - uncapped, a long exploration (many snapshot() calls
 * across many tool-call turns) can grow the running conversation past the
 * model's context window (observed on a live run: a single attempt's
 * accumulated turns exceeded 1M tokens). Capping each call bounds growth per
 * turn; it does not eliminate long-loop growth entirely - full context
 * management (compaction/context editing) is future work, not this cap.
 */
const MAX_SNAPSHOT_CHARS = 20_000;

/** One `[data-cy]` element as enumerated from the live DOM - real selectors, zero hallucination. */
export interface DataCyElement {
  selector: string;
  tag: string;
  text: string;
  visible: boolean;
}

export interface NetworkExchange {
  method: string;
  url: string;
  pathname: string;
  query: Record<string, string>;
  requestPostData: string | null;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
}

/** Matches cy.intercept({ pathname, query })'s pathname/method matching, not query yet. */
export interface NetworkPattern {
  pathname?: string;
  method?: string;
}

export interface SnapshotOptions {
  /** Scope the snapshot to a sub-element instead of the whole page. */
  selector?: string;
}

export interface BrowserTools {
  navigate(path: string): Promise<void>;
  /** Trimmed accessibility tree ("what is actually rendered"), not pixels. */
  snapshot(options?: SnapshotOptions): Promise<string>;
  listDataCy(): Promise<DataCyElement[]>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  /** Recent matching request/response pairs - the source for intercepts + fixtures. */
  captureNetwork(pattern?: NetworkPattern): Promise<NetworkExchange[]>;
  close(): Promise<void>;
}

export interface LaunchBrowserSessionOptions {
  baseUrl: string;
  authSession: AuthSession;
  /** Defaults to true; set false only for local debugging with a visible window. */
  headless?: boolean;
}

/**
 * Launches a single persistent, authenticated Playwright session. The agent inspects
 * the DOM incrementally across navigate/snapshot/click/type calls on this one session -
 * no replay-from-top between steps, unlike Cypress Studio.
 */
export async function launchBrowserSession(
  options: LaunchBrowserSessionOptions
): Promise<BrowserTools> {
  const { baseUrl, authSession, headless = true } = options;

  const browser: Browser = await chromium.launch({ headless });
  const context: BrowserContext = await browser.newContext();
  await context.addCookies(authSession.authCookies);
  const page: Page = await context.newPage();

  const networkBuffer: NetworkExchange[] = [];
  page.on("response", (response: Response) => {
    void recordResponse(response, networkBuffer);
  });

  function resolveUrl(path: string): string {
    return new URL(path, baseUrl).toString();
  }

  return {
    async navigate(path: string) {
      await page.goto(resolveUrl(path), { waitUntil: "load" });
    },

    async snapshot(snapshotOptions: SnapshotOptions = {}) {
      const target = snapshotOptions.selector
        ? page.locator(snapshotOptions.selector)
        : page;
      const full = await target.ariaSnapshot({ mode: "ai" });
      return truncateForAgent(
        full,
        MAX_SNAPSHOT_CHARS,
        "scope snapshot() to a selector for more detail instead of the whole page"
      );
    },

    async listDataCy() {
      return page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-cy]")).map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            selector: el.getAttribute("data-cy") ?? "",
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? "").trim().slice(0, 120),
            visible: rect.width > 0 && rect.height > 0,
          };
        })
      );
    },

    async click(selector: string) {
      await page.locator(selector).click();
    },

    async type(selector: string, text: string) {
      const locator = page.locator(selector);
      await locator.fill("");
      await locator.pressSequentially(text);
    },

    async captureNetwork(pattern: NetworkPattern = {}) {
      return networkBuffer.filter((exchange) => {
        if (pattern.pathname && exchange.pathname !== pattern.pathname) {
          return false;
        }
        if (
          pattern.method &&
          exchange.method.toUpperCase() !== pattern.method.toUpperCase()
        ) {
          return false;
        }
        return true;
      });
    },

    async close() {
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Best-effort capture: responses that can't be read (aborted, redirected, opaque)
 * are silently dropped rather than failing exploration.
 */
async function recordResponse(
  response: Response,
  buffer: NetworkExchange[]
): Promise<void> {
  try {
    const request = response.request();
    const url = new URL(response.url());
    const responseHeaders = response.headers();
    const contentType = responseHeaders["content-type"] ?? "";

    let responseBody: unknown = null;
    if (contentType.includes("json")) {
      responseBody = await response.json().catch(() => null);
    } else if (contentType.startsWith("text/")) {
      responseBody = await response.text().catch(() => null);
    }

    buffer.push({
      method: request.method(),
      url: response.url(),
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      requestPostData: request.postData(),
      status: response.status(),
      responseHeaders,
      responseBody,
    });
  } catch {
    // ignore - see doc comment above
  }
}
