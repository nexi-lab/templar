import type { ModelRef, RoutingContext, RoutingStrategy } from "../types.js";

export interface WeightedStrategyConfig {
  /** Map of "provider:model" → weight (higher = more likely to be selected) */
  readonly weights: Readonly<Record<string, number>>;
}

/**
 * Weight-based random selection strategy.
 * Models with higher weights are proportionally more likely to be selected.
 */
export class WeightedStrategy implements RoutingStrategy {
  readonly name = "weighted";
  private readonly weights: Readonly<Record<string, number>>;

  constructor(config: WeightedStrategyConfig) {
    this.weights = config.weights;
  }

  selectModel(candidates: readonly ModelRef[], _context: RoutingContext): ModelRef {
    if (candidates.length === 0) {
      throw new Error("WeightedStrategy: no candidates provided");
    }

    const weighted = candidates.map((c) => ({
      ref: c,
      weight: this.weights[`${c.provider}:${c.model}`] ?? 1,
    }));

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    if (totalWeight <= 0) {
      // biome-ignore lint/style/noNonNullAssertion: length checked above
      return candidates[0]!;
    }

    let random = Math.random() * totalWeight;
    for (const entry of weighted) {
      random -= entry.weight;
      if (random <= 0) {
        return entry.ref;
      }
    }

    // Fallback (should not reach here due to floating-point)
    // biome-ignore lint/style/noNonNullAssertion: length checked above
    return candidates[candidates.length - 1]!;
  }
}
