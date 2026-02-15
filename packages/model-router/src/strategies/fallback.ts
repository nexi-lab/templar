import type { ModelRef, RoutingContext, RoutingStrategy } from "../types.js";

/**
 * Ordered fallback strategy: returns the first available candidate.
 * This is the default strategy when none is specified.
 */
export class FallbackStrategy implements RoutingStrategy {
  readonly name = "fallback";

  selectModel(candidates: readonly ModelRef[], _context: RoutingContext): ModelRef {
    const first = candidates[0];
    if (!first) {
      throw new Error("FallbackStrategy: no candidates provided");
    }
    return first;
  }
}
