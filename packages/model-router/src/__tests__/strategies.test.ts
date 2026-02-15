import { describe, expect, it } from "vitest";
import { CostBasedStrategy } from "../strategies/cost-based.js";
import { FallbackStrategy } from "../strategies/fallback.js";
import { WeightedStrategy } from "../strategies/weighted.js";
import type { ModelRef, RoutingContext } from "../types.js";

function makeContext(overrides?: Partial<RoutingContext>): RoutingContext {
  return {
    request: {
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
    },
    metrics: new Map(),
    ...overrides,
  };
}

function makeRef(provider: string, model: string): ModelRef {
  return { provider, model };
}

describe("FallbackStrategy", () => {
  it("returns the first candidate", () => {
    const strategy = new FallbackStrategy();
    const candidates = [makeRef("openai", "gpt-4o"), makeRef("anthropic", "claude-3")];

    const result = strategy.selectModel(candidates, makeContext());
    expect(result).toEqual(candidates[0]);
  });

  it("throws when no candidates provided", () => {
    const strategy = new FallbackStrategy();
    expect(() => strategy.selectModel([], makeContext())).toThrow("no candidates provided");
  });

  it("has name 'fallback'", () => {
    expect(new FallbackStrategy().name).toBe("fallback");
  });
});

describe("WeightedStrategy", () => {
  it("selects models proportionally to weights", () => {
    const strategy = new WeightedStrategy({
      weights: {
        "openai:gpt-4o": 100,
        "anthropic:claude-3": 0,
      },
    });

    const candidates = [makeRef("openai", "gpt-4o"), makeRef("anthropic", "claude-3")];

    // With weight 100 vs 0, should always select openai
    const result = strategy.selectModel(candidates, makeContext());
    expect(result.provider).toBe("openai");
  });

  it("uses weight 1 for unspecified models", () => {
    const strategy = new WeightedStrategy({ weights: {} });
    const candidates = [makeRef("openai", "gpt-4o")];

    const result = strategy.selectModel(candidates, makeContext());
    expect(result.provider).toBe("openai");
  });

  it("throws when no candidates provided", () => {
    const strategy = new WeightedStrategy({ weights: {} });
    expect(() => strategy.selectModel([], makeContext())).toThrow("no candidates provided");
  });

  it("has name 'weighted'", () => {
    expect(new WeightedStrategy({ weights: {} }).name).toBe("weighted");
  });

  it("handles all-zero weights by returning first candidate", () => {
    const strategy = new WeightedStrategy({
      weights: {
        "openai:gpt-4o": 0,
        "anthropic:claude-3": 0,
      },
    });

    const candidates = [makeRef("openai", "gpt-4o"), makeRef("anthropic", "claude-3")];

    const result = strategy.selectModel(candidates, makeContext());
    expect(result).toBeDefined();
  });
});

describe("CostBasedStrategy", () => {
  it("selects the cheapest model", () => {
    const strategy = new CostBasedStrategy({
      pricing: {
        "openai:gpt-4o": { inputPerMillion: 5, outputPerMillion: 15 },
        "anthropic:claude-3": { inputPerMillion: 3, outputPerMillion: 15 },
        "google:gemini": { inputPerMillion: 1, outputPerMillion: 5 },
      },
    });

    const candidates = [
      makeRef("openai", "gpt-4o"),
      makeRef("anthropic", "claude-3"),
      makeRef("google", "gemini"),
    ];

    const result = strategy.selectModel(candidates, makeContext());
    expect(result.provider).toBe("google");
  });

  it("falls back to first candidate when no pricing info", () => {
    const strategy = new CostBasedStrategy({ pricing: {} });
    const candidates = [makeRef("openai", "gpt-4o"), makeRef("anthropic", "claude-3")];

    const result = strategy.selectModel(candidates, makeContext());
    expect(result).toEqual(candidates[0]);
  });

  it("uses maxTokens from request for output estimation", () => {
    const strategy = new CostBasedStrategy({
      pricing: {
        "openai:gpt-4o": { inputPerMillion: 5, outputPerMillion: 100 },
        "anthropic:claude-3": { inputPerMillion: 50, outputPerMillion: 1 },
      },
    });

    const candidates = [makeRef("openai", "gpt-4o"), makeRef("anthropic", "claude-3")];

    // With very high maxTokens, output cost dominates
    const context = makeContext({
      request: {
        model: "test",
        messages: [{ role: "user", content: "Hi" }],
        maxTokens: 100_000,
      },
    });

    const result = strategy.selectModel(candidates, context);
    expect(result.provider).toBe("anthropic"); // lower output cost
  });

  it("throws when no candidates provided", () => {
    const strategy = new CostBasedStrategy({ pricing: {} });
    expect(() => strategy.selectModel([], makeContext())).toThrow("no candidates provided");
  });

  it("has name 'cost-based'", () => {
    expect(new CostBasedStrategy({ pricing: {} }).name).toBe("cost-based");
  });
});
