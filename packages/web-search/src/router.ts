/**
 * WebSearchRouter — provider registry + fallback chain.
 */

import { SearchAllProvidersFailedError, SearchInvalidQueryError } from "@templar/errors";
import { createSearchProvider } from "./providers/index.js";
import type {
  SearchOptions,
  SearchResult,
  WebSearchProvider,
  WebSearchRouterConfig,
} from "./types.js";
import { validateQuery } from "./validation.js";

export class WebSearchRouter {
  private readonly providers: readonly WebSearchProvider[];
  private readonly defaultOptions: SearchOptions | undefined;

  constructor(config: WebSearchRouterConfig) {
    this.providers = config.providers.map((pc) =>
      createSearchProvider(pc, config.maxSnippetLength),
    );
    this.defaultOptions = config.defaultOptions;
  }

  async search(
    query: string,
    options?: SearchOptions,
    signal?: AbortSignal,
  ): Promise<readonly SearchResult[]> {
    const trimmed = validateQuery(query);
    if (trimmed === "") {
      throw new SearchInvalidQueryError(query ?? "");
    }

    const merged: SearchOptions = {
      ...this.defaultOptions,
      ...options,
    };

    const failedProviders: string[] = [];
    let lastError: Error | undefined;

    for (const provider of this.providers) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      try {
        return await provider.search(trimmed, merged, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        failedProviders.push(provider.id);
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new SearchAllProvidersFailedError(failedProviders, lastError);
  }
}
