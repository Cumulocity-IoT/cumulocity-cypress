import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NetworkExchange } from "../browser/browserTools.js";

export interface ShapeInterceptOptions {
  exchange: NetworkExchange;
  /** Fixture path, relative to the app repo's cypress/fixtures/ dir, e.g. "events/list.json". */
  fixtureRelativePath: string;
  /** cy.intercept(...).as(alias), so the spec can cy.wait('@alias'). */
  alias?: string;
}

/**
 * Shapes one captured exchange into a ready-to-embed cy.intercept(...) line,
 * following house style (pathname/method/query object matcher - see
 * e2e-tests.instructions.md). Deterministic; no LLM involved.
 */
export function shapeIntercept(options: ShapeInterceptOptions): string {
  const { exchange, fixtureRelativePath, alias } = options;
  const hasQuery = Object.keys(exchange.query).length > 0;

  const matcherEntries = [
    `method: ${JSON.stringify(exchange.method)}`,
    `pathname: ${JSON.stringify(exchange.pathname)}`,
  ];
  if (hasQuery) {
    matcherEntries.push(`query: ${JSON.stringify(exchange.query)}`);
  }

  const matcher = `{ ${matcherEntries.join(", ")} }`;
  const stub = `{ fixture: ${JSON.stringify(fixtureRelativePath)} }`;
  const aliasSuffix = alias ? `.as(${JSON.stringify(alias)})` : "";

  return `cy.intercept(${matcher}, ${stub})${aliasSuffix};`;
}

export interface FreezeFixtureOptions {
  /** Path to the checked-out target app repo (e.g. cumulocity-ui-e2e). */
  appRepoPath: string;
  /** Relative to appRepoPath's cypress/fixtures/ dir, e.g. "events/list.json". */
  relativePath: string;
  /** JSON-serializable fixture content - typically a captured response body. */
  content: unknown;
  /**
   * MVP redaction gate (design doc "Fixture safety"): automatic scrubbing is a
   * roadmap item, so this must be explicitly true, set only after a human has
   * reviewed the raw captured content for PII/hostnames/tenant IDs. There is
   * deliberately no agent tool that can set this - see agent/tools.ts.
   */
  confirmed: boolean;
}

export interface FreezeFixtureResult {
  absolutePath: string;
}

export class FixtureFreezerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FixtureFreezerError";
  }
}

/**
 * Writes a captured fixture into the target app's cypress/fixtures/ tree.
 * Refuses outright unless `confirmed` (the redaction/confirm gate), and
 * refuses to write outside appRepoPath/cypress/fixtures - mirroring
 * writeSpec's path-escape guard.
 */
export async function freezeFixture(
  options: FreezeFixtureOptions
): Promise<FreezeFixtureResult> {
  const { appRepoPath, relativePath, content, confirmed } = options;

  if (!confirmed) {
    throw new FixtureFreezerError(
      `Refusing to write fixture "${relativePath}" without human confirmation. ` +
        "Captured responses may contain customer data, PII, or internal hostnames - " +
        "automatic redaction is not implemented yet (roadmap item), so a human must " +
        "review the raw content and explicitly confirm before it is written."
    );
  }

  if (path.isAbsolute(relativePath)) {
    throw new FixtureFreezerError(
      `relativePath must be relative, got an absolute path: ${relativePath}`
    );
  }

  const resolvedAppRepo = path.resolve(appRepoPath);
  const fixturesRoot = path.resolve(resolvedAppRepo, "cypress/fixtures");
  const absolutePath = path.resolve(fixturesRoot, relativePath);
  const relativeFromFixturesRoot = path.relative(fixturesRoot, absolutePath);

  if (
    relativeFromFixturesRoot.startsWith("..") ||
    path.isAbsolute(relativeFromFixturesRoot)
  ) {
    throw new FixtureFreezerError(
      `Refusing to write outside cypress/fixtures: "${relativePath}" resolves to ` +
        `${absolutePath}, which escapes ${fixturesRoot}`
    );
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(content, null, 2)}\n`,
    "utf-8"
  );

  return { absolutePath };
}
