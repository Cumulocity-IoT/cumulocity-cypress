import type Anthropic from "@anthropic-ai/sdk";
import {
  addUsage,
  computeCostUsd,
  getModelPricing,
  ZERO_USAGE_TOTALS,
  type UsageTotals,
} from "./modelPricing.js";

function usage(overrides: Partial<Anthropic.Beta.Messages.BetaUsage> = {}): Anthropic.Beta.Messages.BetaUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: null,
    cache_read_input_tokens: null,
    cache_creation: null,
    inference_geo: null,
    iterations: null,
    output_tokens_details: null,
    server_tool_use: null,
    service_tier: null,
    speed: null,
    ...overrides,
  };
}

describe("addUsage", () => {
  it("accumulates input and output tokens across turns", () => {
    let totals = ZERO_USAGE_TOTALS;
    totals = addUsage(totals, usage({ input_tokens: 100, output_tokens: 10 }));
    totals = addUsage(totals, usage({ input_tokens: 50, output_tokens: 5 }));

    expect(totals.inputTokens).toBe(150);
    expect(totals.outputTokens).toBe(15);
  });

  it("prefers the granular cache_creation breakdown over the flat field", () => {
    const totals = addUsage(
      ZERO_USAGE_TOTALS,
      usage({
        cache_creation_input_tokens: 999, // should be ignored in favor of the breakdown below
        cache_creation: { ephemeral_5m_input_tokens: 400, ephemeral_1h_input_tokens: 100 },
      })
    );

    expect(totals.cacheWrite5mTokens).toBe(400);
    expect(totals.cacheWrite1hTokens).toBe(100);
  });

  it("treats the flat cache_creation_input_tokens as all-5m when no breakdown is present", () => {
    const totals = addUsage(ZERO_USAGE_TOTALS, usage({ cache_creation_input_tokens: 250 }));

    expect(totals.cacheWrite5mTokens).toBe(250);
    expect(totals.cacheWrite1hTokens).toBe(0);
  });

  it("accumulates cache_read_input_tokens", () => {
    let totals = ZERO_USAGE_TOTALS;
    totals = addUsage(totals, usage({ cache_read_input_tokens: 1000 }));
    totals = addUsage(totals, usage({ cache_read_input_tokens: 500 }));

    expect(totals.cacheReadTokens).toBe(1500);
  });

  it("treats missing/null fields as zero", () => {
    const totals = addUsage(ZERO_USAGE_TOTALS, usage());
    expect(totals).toEqual(ZERO_USAGE_TOTALS);
  });
});

function expectPricingCloseTo(pricing: ReturnType<typeof getModelPricing>, expected: Record<string, number>) {
  expect(pricing).toBeDefined();
  for (const [key, value] of Object.entries(expected)) {
    expect(pricing![key as keyof typeof pricing]).toBeCloseTo(value, 6);
  }
}

describe("getModelPricing", () => {
  it("returns the introductory rate while the promo is active", () => {
    const pricing = getModelPricing("claude-sonnet-5", new Date("2026-08-06T00:00:00Z"));
    expectPricingCloseTo(pricing, {
      inputPerMTok: 2.0,
      outputPerMTok: 10.0,
      cacheWrite5mPerMTok: 2.5,
      cacheWrite1hPerMTok: 4.0,
      cacheReadPerMTok: 0.2,
    });
  });

  it("reverts to the standard rate once the promo ends", () => {
    const pricing = getModelPricing("claude-sonnet-5", new Date("2026-09-01T00:00:00Z"));
    expectPricingCloseTo(pricing, {
      inputPerMTok: 3.0,
      outputPerMTok: 15.0,
      cacheWrite5mPerMTok: 3.75,
      cacheWrite1hPerMTok: 6.0,
      cacheReadPerMTok: 0.3,
    });
  });

  it("returns undefined for a model with no rate schedule on file", () => {
    expect(getModelPricing("some-future-model")).toBeUndefined();
  });
});

describe("computeCostUsd", () => {
  // The rate actually billing today (see getModelPricing tests above) - using
  // it here means these dollar figures match a real invoice, not a stale rate.
  const sonnet5 = getModelPricing("claude-sonnet-5", new Date("2026-08-06T00:00:00Z"))!;

  it("prices 1M input tokens at the model's input rate", () => {
    const totals: UsageTotals = { ...ZERO_USAGE_TOTALS, inputTokens: 1_000_000 };
    expect(computeCostUsd(totals, sonnet5)).toBeCloseTo(2.0, 6);
  });

  it("prices 1M output tokens at the model's output rate", () => {
    const totals: UsageTotals = { ...ZERO_USAGE_TOTALS, outputTokens: 1_000_000 };
    expect(computeCostUsd(totals, sonnet5)).toBeCloseTo(10.0, 6);
  });

  it("prices 1M cache-read tokens at 10% of the input rate", () => {
    const totals: UsageTotals = { ...ZERO_USAGE_TOTALS, cacheReadTokens: 1_000_000 };
    expect(computeCostUsd(totals, sonnet5)).toBeCloseTo(0.2, 6);
  });

  it("prices 1M 5m-cache-write tokens at 125% of the input rate", () => {
    const totals: UsageTotals = { ...ZERO_USAGE_TOTALS, cacheWrite5mTokens: 1_000_000 };
    expect(computeCostUsd(totals, sonnet5)).toBeCloseTo(2.5, 6);
  });

  it("prices 1M 1h-cache-write tokens at 200% of the input rate", () => {
    const totals: UsageTotals = { ...ZERO_USAGE_TOTALS, cacheWrite1hTokens: 1_000_000 };
    expect(computeCostUsd(totals, sonnet5)).toBeCloseTo(4.0, 6);
  });

  it("sums all five components", () => {
    const totals: UsageTotals = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheWrite5mTokens: 1_000_000,
      cacheWrite1hTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
    };
    expect(computeCostUsd(totals, sonnet5)).toBeCloseTo(2.0 + 10.0 + 2.5 + 4.0 + 0.2, 6);
  });

  it("returns 0 for zero usage", () => {
    expect(computeCostUsd(ZERO_USAGE_TOTALS, sonnet5)).toBe(0);
  });
});
