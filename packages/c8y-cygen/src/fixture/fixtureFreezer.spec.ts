import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { NetworkExchange } from "../browser/browserTools.js";
import {
  shapeIntercept,
  freezeFixture,
  FixtureFreezerError,
} from "./fixtureFreezer.js";

function exchange(overrides: Partial<NetworkExchange> = {}): NetworkExchange {
  return {
    method: "GET",
    url: "https://tenant.example.com/event/events?pageSize=50",
    pathname: "/event/events",
    query: {},
    requestPostData: null,
    status: 200,
    responseHeaders: { "content-type": "application/json" },
    responseBody: { events: [] },
    ...overrides,
  };
}

describe("shapeIntercept", () => {
  it("shapes a query-less exchange into a method+pathname matcher", () => {
    const snippet = shapeIntercept({
      exchange: exchange(),
      fixtureRelativePath: "events/list.json",
    });

    expect(snippet).toBe(
      `cy.intercept({ method: "GET", pathname: "/event/events" }, { fixture: "events/list.json" });`
    );
  });

  it("includes a query matcher when the exchange has query params", () => {
    const snippet = shapeIntercept({
      exchange: exchange({ query: { pageSize: "50", currentPage: "1" } }),
      fixtureRelativePath: "events/list.json",
    });

    expect(snippet).toBe(
      `cy.intercept({ method: "GET", pathname: "/event/events", query: {"pageSize":"50","currentPage":"1"} }, { fixture: "events/list.json" });`
    );
  });

  it("appends .as(alias) when an alias is given", () => {
    const snippet = shapeIntercept({
      exchange: exchange(),
      fixtureRelativePath: "events/list.json",
      alias: "eventsQuery",
    });

    expect(snippet).toBe(
      `cy.intercept({ method: "GET", pathname: "/event/events" }, { fixture: "events/list.json" }).as("eventsQuery");`
    );
  });

  it("omits .as(...) when no alias is given", () => {
    const snippet = shapeIntercept({
      exchange: exchange(),
      fixtureRelativePath: "events/list.json",
    });

    expect(snippet).not.toContain(".as(");
  });
});

describe("freezeFixture", () => {
  let appRepoPath: string;

  beforeEach(async () => {
    appRepoPath = await mkdtemp(path.join(tmpdir(), "c8y-cygen-freezer-"));
  });

  afterEach(async () => {
    await rm(appRepoPath, { recursive: true, force: true });
  });

  it("refuses to write when confirmed is false", async () => {
    await expect(
      freezeFixture({
        appRepoPath,
        relativePath: "events/list.json",
        content: { events: [] },
        confirmed: false,
      })
    ).rejects.toBeInstanceOf(FixtureFreezerError);

    await expect(
      access(path.join(appRepoPath, "cypress/fixtures/events/list.json"))
    ).rejects.toThrow();
  });

  it("writes the fixture as pretty-printed JSON once confirmed, creating intermediate directories", async () => {
    const result = await freezeFixture({
      appRepoPath,
      relativePath: "events/list.json",
      content: { events: [{ id: "1" }] },
      confirmed: true,
    });

    expect(result.absolutePath).toBe(
      path.join(appRepoPath, "cypress/fixtures/events/list.json")
    );
    const written = await readFile(result.absolutePath, "utf-8");
    expect(JSON.parse(written)).toEqual({ events: [{ id: "1" }] });
    expect(written).toBe(`${JSON.stringify({ events: [{ id: "1" }] }, null, 2)}\n`);
  });

  it("rejects an absolute relativePath even when confirmed", async () => {
    await expect(
      freezeFixture({
        appRepoPath,
        relativePath: "/etc/passwd",
        content: {},
        confirmed: true,
      })
    ).rejects.toBeInstanceOf(FixtureFreezerError);
  });

  it("rejects a relativePath that escapes cypress/fixtures via ../ even when confirmed", async () => {
    await expect(
      freezeFixture({
        appRepoPath,
        relativePath: "../../../etc/passwd",
        content: {},
        confirmed: true,
      })
    ).rejects.toThrow(/escapes/);
  });

  it("rejects a relativePath that escapes via a deceptive nested ../ sequence", async () => {
    await expect(
      freezeFixture({
        appRepoPath,
        relativePath: "events/../../../outside.json",
        content: {},
        confirmed: true,
      })
    ).rejects.toBeInstanceOf(FixtureFreezerError);
  });
});
