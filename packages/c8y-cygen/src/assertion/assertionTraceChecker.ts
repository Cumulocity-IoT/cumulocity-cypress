export interface AssertionTraceResult {
  ok: boolean;
  /** Expected Outcome strings with no matching .should(...) anywhere in the spec. */
  unmatched: string[];
}

const SHOULD_CALL_RE = /\.should\s*\(/g;
/** Only used as a backward fallback when a .should(...) has no preceding ";"
 * at all (e.g. the very first statement in a block). */
const FALLBACK_WINDOW_BEFORE = 300;
/** Small allowance past the matching close-paren, to catch a chained .as('alias'). */
const TRAILING_ALLOWANCE = 60;

const STOPWORDS = new Set([
  "the", "a", "an", "of", "is", "are", "was", "were", "be", "been", "being",
  "to", "in", "on", "for", "with", "and", "or", "but", "not", "no",
  "this", "that", "these", "those", "it", "its", "as", "at", "by", "from",
  "show", "shows", "shown", "showing", "value", "values", "when", "opened",
  "opens", "should",
]);

function extractLiteralAnchors(text: string): string[] {
  const anchors: string[] = [];

  const quotedRe = /`([^`]+)`|'([^']+)'|"([^"]+)"/g;
  for (const match of text.matchAll(quotedRe)) {
    const value = match[1] ?? match[2] ?? match[3];
    if (value) anchors.push(value);
  }

  // Only decimals are treated as strong numeric anchors - a bare small
  // integer (e.g. "1" from "at least 1") is too generic and would match
  // almost any .should(...) window.
  const decimalRe = /-?\d+\.\d+/g;
  for (const match of text.matchAll(decimalRe)) {
    anchors.push(match[0]);
  }

  return anchors;
}

function extractWordTokens(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 4 && !STOPWORDS.has(word)));
}

/** Index of the "(" that opens a .should(...) call is text.length - 1 past the match end. */
function findMatchingCloseParen(text: string, openParenIndex: number): number {
  let depth = 0;
  for (let i = openParenIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/**
 * Extracts one window per .should(...) call, scoped to that call's own
 * statement: from the nearest preceding top-level ";" through the matching
 * close-paren of the .should(...) itself (paren-balance tracked, so a
 * multi-statement .should((el) => { ...; ...; }) callback body is captured
 * whole rather than cut off at its first internal ";"). This deliberately
 * does NOT bleed into a neighboring statement's text - a wide fixed-size
 * window was tried first and produced false matches from adjacent, unrelated
 * assertions sharing generic words.
 *
 * Known limitation: if a *preceding* statement's own .should(callback) body
 * contains internal ";"s, the backward scan can stop at one of those instead
 * of that statement's true end - narrowing (not widening) this window in an
 * edge case. Acceptable for an MVP heuristic; see the module doc comment.
 */
function extractShouldWindows(specSource: string): string[] {
  const windows: string[] = [];
  for (const match of specSource.matchAll(SHOULD_CALL_RE)) {
    const matchIndex = match.index ?? 0;
    const openParenIndex = matchIndex + match[0].length - 1;
    const closeParenIndex = findMatchingCloseParen(specSource, openParenIndex);

    const precedingSemicolon = specSource.lastIndexOf(";", matchIndex);
    const start =
      precedingSemicolon === -1
        ? Math.max(0, matchIndex - FALLBACK_WINDOW_BEFORE)
        : precedingSemicolon + 1;
    const end = Math.min(
      specSource.length,
      closeParenIndex + 1 + TRAILING_ALLOWANCE
    );

    windows.push(specSource.slice(start, end));
  }
  return windows;
}

/**
 * How many of the spec's own .should(...) windows each word appears in. Real
 * house-style selectors repeat a shared prefix across every assertion in a
 * spec (e.g. every selector here is "c8y-event-details--*"), so "event" and
 * "details" show up in nearly every window - counting them toward overlap
 * would let an outcome "match" almost anything. Words this common WITHIN this
 * spec are excluded from matching, the same way TF-IDF discounts boilerplate
 * terms; a word is only discriminating if it's absent from most windows.
 */
function computeWindowDocumentFrequency(windows: string[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const window of windows) {
    for (const word of extractWordTokens(window)) {
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  return frequency;
}

function discriminatingWords(
  words: Set<string>,
  documentFrequency: Map<string, number>,
  totalWindows: number
): Set<string> {
  // Too few windows to tell "common" from "rare" - skip the filter rather than
  // risk discarding every token in a spec that only has one or two assertions.
  if (totalWindows < 3) return words;
  // Only "in every window, or all but one" counts as boilerplate. A plain
  // majority cutoff (e.g. >50%) also discards words like "wrapper" that
  // legitimately recur across several *-wrapper selectors without being
  // universal - those still discriminate which specific assertion an outcome
  // maps to, unlike words repeated by the shared selector prefix itself
  // (e.g. "event", "details" here) or by trailing bleed into the next
  // statement's selector at each window's boundary.
  const boilerplateCutoff = totalWindows - 1;
  return new Set(
    [...words].filter((word) => (documentFrequency.get(word) ?? 0) < boilerplateCutoff)
  );
}

function matchesWindow(
  outcome: string,
  window: string,
  documentFrequency: Map<string, number>,
  totalWindows: number
): boolean {
  const literals = extractLiteralAnchors(outcome);
  if (literals.length > 0) {
    const windowLower = window.toLowerCase();
    if (literals.some((literal) => windowLower.includes(literal.toLowerCase()))) {
      return true;
    }
  }

  const outcomeWords = discriminatingWords(
    extractWordTokens(outcome),
    documentFrequency,
    totalWindows
  );
  const windowWords = discriminatingWords(
    extractWordTokens(window),
    documentFrequency,
    totalWindows
  );
  let overlap = 0;
  for (const word of outcomeWords) {
    if (windowWords.has(word)) overlap++;
  }
  const threshold = outcomeWords.size <= 2 ? 1 : 2;
  return overlap >= threshold;
}

/**
 * Enforces the anti-gaming gate (design doc "Anti-gaming guardrails"): every
 * Expected Outcome must map to at least one .should(...) call in the spec, or
 * the run hard-fails even if Cypress itself is green. There is no LLM
 * involved - this is a deterministic heuristic, deliberately conservative
 * (word-token overlap after stopword AND per-spec-boilerplate filtering, plus
 * exact matches on quoted/backtick literals and decimal numbers copied from
 * the outcome text), matching how a human reviewer would eyeball "does some
 * assertion actually cover this outcome" against selector names and literal
 * values rather than requiring true semantic understanding. Matching
 * heuristics are expected to evolve; the {ok, unmatched} interface is the
 * stable contract.
 */
export function checkAssertionTrace(
  expectedOutcomes: string[],
  specSource: string
): AssertionTraceResult {
  const windows = extractShouldWindows(specSource);
  const documentFrequency = computeWindowDocumentFrequency(windows);
  const unmatched = expectedOutcomes.filter(
    (outcome) =>
      !windows.some((window) =>
        matchesWindow(outcome, window, documentFrequency, windows.length)
      )
  );
  return { ok: unmatched.length === 0, unmatched };
}
