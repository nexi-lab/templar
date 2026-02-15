import type { ModelRef, RoutingContext, RoutingStrategy } from "../types.js";

export interface ModelPricing {
  readonly inputPerMillion: number;
  readonly outputPerMillion: number;
}

export interface CostBasedStrategyConfig {
  /** Map of "provider:model" → pricing */
  readonly pricing: Readonly<Record<string, ModelPricing>>;
}

/**
 * Cost-based selection strategy: picks the cheapest model from candidates.
 * Models without pricing are treated as most expensive (sorted last).
 */
export class CostBasedStrategy implements RoutingStrategy {
  readonly name = "cost-based";
  private readonly pricing: Readonly<Record<string, ModelPricing>>;

  constructor(config: CostBasedStrategyConfig) {
    this.pricing = config.pricing;
  }

  selectModel(candidates: readonly ModelRef[], context: RoutingContext): ModelRef {
    if (candidates.length === 0) {
      throw new Error("CostBasedStrategy: no candidates provided");
    }

    const estimatedOutputTokens = context.request.maxTokens ?? 1000;

    // biome-ignore lint/style/noNonNullAssertion: length checked above
    let cheapest: ModelRef = candidates[0]!;
    let cheapestCost = Number.MAX_SAFE_INTEGER;

    for (const candidate of candidates) {
      const key = `${candidate.provider}:${candidate.model}`;
      const pricing = this.pricing[key];
      if (!pricing) continue;

      // Estimate cost based on message length as proxy for input tokens
      const inputChars = context.request.messages.reduce((sum, m) => sum + m.content.length, 0);
      // Rough estimate: ~4 chars per token
      const estimatedInputTokens = Math.ceil(inputChars / 4);

      const cost =
        (estimatedInputTokens / 1_000_000) * pricing.inputPerMillion +
        (estimatedOutputTokens / 1_000_000) * pricing.outputPerMillion;

      if (cost < cheapestCost) {
        cheapestCost = cost;
        cheapest = candidate;
      }
    }

    return cheapest;
  }
}
