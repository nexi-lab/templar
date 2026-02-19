/**
 * Brave Search provider — Brave Web Search API.
 */

import { fetchJson } from "../fetch-json.js";
import {
  DEFAULT_MAX_RESULTS,
  DEFAULT_MAX_SNIPPET_LENGTH,
  type SearchOptions,
  type SearchProviderConfig,
  type SearchResult,
  type WebSearchProvider,
} from "../types.js";
import { truncateSnippet } from "../utils.js";

const BRAVE_BASE_URL = "https://api.search.brave.com/res/v1/web/search";

interface BraveResult {
  readonly title?: string;
  readonly url?: string;
  readonly description?: string;
  readonly age?: string;
}

interface BraveResponse {
  readonly web?: {
    readonly results?: readonly BraveResult[];
  };
}

function mapFreshness(timeRange: string | undefined): string | undefined {
  if (!timeRange) return undefined;
  const map: Record<string, string> = {
    day: "pd",
    week: "pw",
    month: "pm",
    year: "py",
  };
  return map[timeRange];
}

export function createBraveProvider(
  config: SearchProviderConfig,
  maxSnippetLength: number = DEFAULT_MAX_SNIPPET_LENGTH,
): WebSearchProvider {
  const baseUrl = config.baseUrl ?? BRAVE_BASE_URL;
  const timeoutMs = config.timeoutMs;

  return {
    id: "brave",

    async search(
      query: string,
      options?: SearchOptions,
      signal?: AbortSignal,
    ): Promise<readonly SearchResult[]> {
      const params = new URLSearchParams({ q: query });
      params.set("count", String(options?.maxResults ?? DEFAULT_MAX_RESULTS));

      const freshness = mapFreshness(options?.timeRange);
      if (freshness) params.set("freshness", freshness);
      if (options?.language) params.set("search_lang", options.language);

      const url = `${baseUrl}?${params.toString()}`;

      const response = await fetchJson<BraveResponse>(
        "brave",
        url,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": config.apiKey,
          },
        },
        timeoutMs,
        signal,
      );

      const results = response.web?.results ?? [];
      return results
        .filter((r): r is BraveResult & { title: string; url: string } => Boolean(r.title && r.url))
        .map((r) => {
          const result: SearchResult = {
            title: r.title,
            url: r.url,
            snippet: truncateSnippet(r.description ?? "", maxSnippetLength),
          };
          if (r.age) {
            return { ...result, publishedDate: r.age };
          }
          return result;
        });
    },
  };
}
