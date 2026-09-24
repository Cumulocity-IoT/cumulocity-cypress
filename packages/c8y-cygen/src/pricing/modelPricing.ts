import type Anthropic from "@anthropic-ai/sdk";

/**
 * Per-million-token USD rates for one model. Cache write/read multipliers
 * are fixed by Anthropic's API-wide caching economics (5m write ~1.25x
 * input, 1h write ~2x input, read ~0.1x input) - only inputPerMTok and
 * outputPerMTok actually vary per model.
 */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheWrite5mPerMTok: number;
  cacheWrite1hPerMTok: number;
  cacheReadPerMTok: number;
}

function fromInputOutputPrice(inputPerMTok: number, outputPerMTok: number): ModelPricing {
  return {
    inputPerMTok,
    outputPerMTok,
    cacheWrite5mPerMTok: inputPerMTok * 1.25,
    cacheWrite1hPerMTok: inputPerMTok * 2,
    cacheReadPerMTok: inputPerMTok * 0.1,
  };
}

interface ModelPricingSchedule {
  standard: ModelPricing;
  /** A temporary discount that reverts to `standard` at `introEndsAt`. */
  introductory?: { pricing: ModelPricing; introEndsAt: Date };
}

/**
 * Per-model rate schedules, keyed by the exact model id string the API
 * returns on BetaMessage.model. Claude Sonnet 5 has an introductory rate
 * ($2/$10 per MTok input/output) in effect through 2026-08-31, reverting to
 * the standard $3/$15 rate after that - getModelPricing picks the rate
 * that's actually billing right now, so this stays correct on both sides
 * of the cutover with no manual edit needed.
 */
const MODEL_PRICING_SCHEDULE: Record<string, ModelPricingSchedule> = {
  "claude-sonnet-5": {
    standard: fromInputOutputPrice(3.0, 15.0),
    introductory: {
      pricing: fromInputOutputPrice(2.0, 10.0),
      introEndsAt: new Date("2026-09-01T00:00:00Z"),
    },
  },
};

/** Returns undefined for a model with no rate schedule on file. */
export function getModelPricing(model: string, now: Date = new Date()): ModelPricing | undefined {
  const schedule = MODEL_PRICING_SCHEDULE[model];
  if (!schedule) return undefined;
  if (schedule.introductory && now < schedule.introductory.introEndsAt) {
    return schedule.introductory.pricing;
  }
  return schedule.standard;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
}

export const ZERO_USAGE_TOTALS: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  cacheReadTokens: 0,
};

/**
 * Folds one turn's usage into a running total. Prefers the granular
 * cache_creation breakdown (5m vs 1h) when the API returns it; falls back
 * to treating the flat cache_creation_input_tokens as all-5m otherwise,
 * since c8y-cygen never requests a 1h cache TTL.
 */
export function addUsage(
  totals: UsageTotals,
  usage: Anthropic.Beta.Messages.BetaUsage
): UsageTotals {
  return {
    inputTokens: totals.inputTokens + usage.input_tokens,
    outputTokens: totals.outputTokens + usage.output_tokens,
    cacheWrite5mTokens:
      totals.cacheWrite5mTokens +
      (usage.cache_creation?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0),
    cacheWrite1hTokens: totals.cacheWrite1hTokens + (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0),
    cacheReadTokens: totals.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
  };
}

export function computeCostUsd(totals: UsageTotals, pricing: ModelPricing): number {
  return (
    (totals.inputTokens / 1_000_000) * pricing.inputPerMTok +
    (totals.outputTokens / 1_000_000) * pricing.outputPerMTok +
    (totals.cacheWrite5mTokens / 1_000_000) * pricing.cacheWrite5mPerMTok +
    (totals.cacheWrite1hTokens / 1_000_000) * pricing.cacheWrite1hPerMTok +
    (totals.cacheReadTokens / 1_000_000) * pricing.cacheReadPerMTok
  );
}
