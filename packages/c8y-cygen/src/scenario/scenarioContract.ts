/**
 * Parses the fixed scenario contract (PRD "The scenario contract" section):
 * Objective, Preconditions, Setup, Steps, Expected Outcomes, and optional Style.
 * Hand-rolled rather than a full markdown AST, since the contract is exactly six
 * known ATX (`##`) headings, not general-purpose markdown.
 */

export type ScenarioStyle = "mocked" | "integration";

export interface Scenario {
  title: string | null;
  objective: string;
  preconditions: string[];
  setup: string[];
  steps: string[];
  /** The immutable assertions (see AssertionTraceChecker) - one entry per checkable outcome. */
  expectedOutcomes: string[];
  style: ScenarioStyle | null;
}

const REQUIRED_SECTIONS = [
  "Objective",
  "Preconditions",
  "Setup",
  "Steps",
  "Expected Outcomes",
] as const;
type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

/** Sections whose downstream consumers need discrete items, not one prose blob. */
const MUST_BE_LIST: ReadonlySet<RequiredSection> = new Set([
  "Steps",
  "Expected Outcomes",
]);

const ALL_KNOWN_SECTIONS = [...REQUIRED_SECTIONS, "Style"] as const;

export class ScenarioParseError extends Error {
  readonly missingSections: string[];
  readonly malformedSections: string[];

  constructor(missingSections: string[], malformedSections: string[]) {
    const parts: string[] = [];
    if (missingSections.length > 0) {
      parts.push(`missing or empty required section(s): ${missingSections.join(", ")}`);
    }
    if (malformedSections.length > 0) {
      parts.push(`malformed section(s): ${malformedSections.join("; ")}`);
    }
    super(`Invalid scenario: ${parts.join("; ")}`);
    this.name = "ScenarioParseError";
    this.missingSections = missingSections;
    this.malformedSections = malformedSections;
  }
}

export function parseScenario(markdown: string): Scenario {
  const normalized = markdown.replace(/\r\n/g, "\n");

  const title = extractTitle(normalized);
  const rawSections = extractH2Sections(normalized);

  const missingSections: string[] = [];
  const malformedSections: string[] = [];

  for (const name of REQUIRED_SECTIONS) {
    const content = rawSections.get(name);
    if (content === undefined || content.trim().length === 0) {
      missingSections.push(name);
    }
  }

  const listResults = new Map<RequiredSection, ReturnType<typeof splitTopLevelListItems>>();
  for (const name of REQUIRED_SECTIONS) {
    const content = rawSections.get(name);
    if (content === undefined || content.trim().length === 0) continue;
    const result = splitTopLevelListItems(content);
    listResults.set(name, result);
    if (MUST_BE_LIST.has(name) && (!result.isList || result.items.length === 0)) {
      malformedSections.push(
        `${name}: expected a bulleted or numbered list of discrete items, got unstructured text`
      );
    }
  }

  let style: ScenarioStyle | null = null;
  const styleContent = rawSections.get("Style");
  if (styleContent !== undefined && styleContent.trim().length > 0) {
    style = extractStyleKeyword(styleContent);
    if (style === null) {
      malformedSections.push(
        'Style: expected `mocked` or `integration`, found neither'
      );
    }
  }

  if (missingSections.length > 0 || malformedSections.length > 0) {
    throw new ScenarioParseError(missingSections, malformedSections);
  }

  return {
    title,
    objective: rawSections.get("Objective")!.trim(),
    preconditions: listResults.get("Preconditions")!.items,
    setup: listResults.get("Setup")!.items,
    steps: listResults.get("Steps")!.items,
    expectedOutcomes: listResults.get("Expected Outcomes")!.items,
    style,
  };
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return null;
  const text = match[1].trim();
  return text.replace(/^Scenario:\s*/i, "").trim() || null;
}

/**
 * Splits the document into H2 (`## `) sections, keyed by canonical section name.
 * Unknown H2 headings (extra author notes, etc.) are collected but not exposed -
 * the contract is forward-compatible with extra sections, it just ignores them.
 */
function extractH2Sections(markdown: string): Map<string, string> {
  const lines = markdown.split("\n");
  const headingRegex = /^##\s+(.+?)\s*$/;

  type Boundary = { canonicalName: string | null; start: number };
  const boundaries: Boundary[] = [];

  lines.forEach((line, index) => {
    const match = line.match(headingRegex);
    if (!match) return;
    const canonicalName = canonicalizeSectionName(match[1]);
    boundaries.push({ canonicalName, start: index + 1 });
  });

  const sections = new Map<string, string>();
  boundaries.forEach((boundary, i) => {
    if (!boundary.canonicalName) return;
    const end = i + 1 < boundaries.length ? boundaries[i + 1].start - 1 : lines.length;
    const content = lines.slice(boundary.start, end).join("\n");
    sections.set(boundary.canonicalName, content);
  });

  return sections;
}

function canonicalizeSectionName(heading: string): string | null {
  const normalized = heading.trim().toLowerCase().replace(/\s+/g, " ");
  return (
    ALL_KNOWN_SECTIONS.find((name) => name.toLowerCase() === normalized) ?? null
  );
}

function splitTopLevelListItems(rawText: string): {
  items: string[];
  isList: boolean;
} {
  const lines = rawText.split("\n");
  const markerRegex = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;

  const markerIndents: number[] = [];
  for (const line of lines) {
    const match = line.match(markerRegex);
    if (match && line.trim().length > 0) markerIndents.push(match[1].length);
  }

  if (markerIndents.length === 0) {
    const prose = rawText.trim();
    return { items: prose ? [prose] : [], isList: false };
  }

  const topIndent = Math.min(...markerIndents);
  const items: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const match = line.match(markerRegex);
    if (match && match[1].length === topIndent) {
      if (current) items.push(current.join("\n").trim());
      current = [match[2]];
    } else if (current && line.trim().length > 0) {
      current.push(line.trim());
    }
  }
  if (current) items.push(current.join("\n").trim());

  return { items: items.filter((item) => item.length > 0), isList: true };
}

function extractStyleKeyword(text: string): ScenarioStyle | null {
  const match = text.match(/`(mocked|integration)`/i);
  if (!match) return null;
  return match[1].toLowerCase() as ScenarioStyle;
}
