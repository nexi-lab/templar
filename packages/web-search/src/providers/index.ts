/**
 * Provider factory — creates providers from configuration.
 */

import { SearchProviderError } from "@templar/errors";
import type { SearchProviderConfig, WebSearchProvider } from "../types.js";
import { createBraveProvider } from "./brave.js";
import { createSerperProvider } from "./serper.js";
import { createTavilyProvider } from "./tavily.js";

export { createBraveProvider } from "./brave.js";
export { createSerperProvider } from "./serper.js";
export { createTavilyProvider } from "./tavily.js";

/**
 * Create a search provider from configuration.
 *
 * @param config - Provider configuration
 * @param maxSnippetLength - Maximum snippet length (default 300)
 * @returns A WebSearchProvider instance
 */
export function createSearchProvider(
  config: SearchProviderConfig,
  maxSnippetLength?: number,
): WebSearchProvider {
  switch (config.provider) {
    case "serper":
      return createSerperProvider(config, maxSnippetLength);
    case "brave":
      return createBraveProvider(config, maxSnippetLength);
    case "tavily":
      return createTavilyProvider(config, maxSnippetLength);
    default:
      throw new SearchProviderError(
        config.provider,
        `Unknown provider: "${config.provider}". Supported: serper, brave, tavily`,
      );
  }
}
