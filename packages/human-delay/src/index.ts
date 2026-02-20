export { HumanDelayAdapter, validateHumanDelayConfig } from "./adapter.js";
export { calculateDelay, countWords, gaussianRandom } from "./calculator.js";
export type { Clock, HumanDelayConfig, ResolvedConfig } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";

import type { ChannelAdapter } from "@templar/core";
import { HumanDelayAdapter, validateHumanDelayConfig } from "./adapter.js";
import type { HumanDelayConfig } from "./types.js";

/**
 * Wrap a channel adapter with human-like typing delays.
 *
 * @param adapter - Any ChannelAdapter to wrap
 * @param config - Optional delay configuration (defaults: 40 WPM, ±20% jitter)
 * @returns A new ChannelAdapter with delay behavior on send()
 */
export function withHumanDelay(adapter: ChannelAdapter, config?: HumanDelayConfig): ChannelAdapter {
  validateHumanDelayConfig(config);
  return new HumanDelayAdapter(adapter, config);
}

export const PACKAGE_NAME = "@templar/human-delay";
