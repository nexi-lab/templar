import type { NexusClient } from "@nexus/sdk";
import { NexusPayMiddleware, validatePayConfig } from "./middleware.js";
import type { NexusPayConfig } from "./types.js";

/**
 * Create a NexusPayMiddleware instance.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param config - Pay middleware configuration
 * @returns A configured NexusPayMiddleware instance
 * @throws {PayConfigurationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 * import { createNexusPayMiddleware } from '@templar/middleware/pay';
 *
 * const client = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
 *
 * const payMiddleware = createNexusPayMiddleware(client, {
 *   dailyBudget: 1000,
 *   alertThresholds: [0.5, 0.8, 1.0],
 *   hardLimit: true,
 *   onBudgetWarning: (event) => {
 *     console.warn(`Budget warning at ${event.threshold * 100}%: ${event.pressure * 100}% used`);
 *   },
 * });
 *
 * // After running agent turns, get cost report:
 * const report = payMiddleware.getCostReport(sessionId);
 * console.log(report.breakdown.byModel);
 * ```
 */
export function createNexusPayMiddleware(
  client: NexusClient,
  config: NexusPayConfig,
): NexusPayMiddleware {
  validatePayConfig(config);
  return new NexusPayMiddleware(client, config);
}

// Re-export types and class
export { NexusPayMiddleware, validatePayConfig } from "./middleware.js";
export type {
  BudgetExhaustedEvent,
  BudgetPressure,
  BudgetSummary,
  BudgetWarningEvent,
  CacheStats,
  CostEntry,
  CostReport,
  ModelCostEntry,
  NexusPayConfig,
} from "./types.js";
export { DEFAULT_PAY_CONFIG } from "./types.js";
