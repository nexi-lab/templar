/**
 * Tavily provider — Tavily AI Search API.
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

const TAVILY_BASE_URL = "https://api.tavily.com/search";

interface TavilyResult {
  readonly title?: string;
  readonly url?: string;
  readonly content?: string;
  readonly score?: number;
  readonly published_date?: string;
}

interface TavilyResponse {
  readonly results?: readonly TavilyResult[];
}

export function createTavilyProvider(
  config: SearchProviderConfig,
  maxSnippetLength: number = DEFAULT_MAX_SNIPPET_LENGTH,
): WebSearchProvider {
  const baseUrl = config.baseUrl ?? TAVILY_BASE_URL;
  const timeoutMs = config.timeoutMs;

  return {
    id: "tavily",

    async search(
      query: string,
      options?: SearchOptions,
      signal?: AbortSignal,
    ): Promise<readonly SearchResult[]> {
      const body: Record<string, unknown> = {
        // Tavily requires the API key in the request body per their API spec
        api_key: config.apiKey,
        query,
        max_results: options?.maxResults ?? DEFAULT_MAX_RESULTS,
        search_depth: "basic",
      };

      if (options?.includeDomains && options.includeDomains.length > 0) {
        body.include_domains = options.includeDomains;
      }
      if (options?.excludeDomains && options.excludeDomains.length > 0) {
        body.exclude_domains = options.excludeDomains;
      }

      const response = await fetchJson<TavilyResponse>(
        "tavily",
        baseUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        timeoutMs,
        signal,
      );

      const results = response.results ?? [];
      return results
        .filter((r): r is TavilyResult & { title: string; url: string } =>
          Boolean(r.title && r.url),
        )
        .map((r) => {
          const result: SearchResult = {
            title: r.title,
            url: r.url,
            snippet: truncateSnippet(r.content ?? "", maxSnippetLength),
          };
          if (r.score !== undefined) {
            return r.published_date
              ? { ...result, score: r.score, publishedDate: r.published_date }
              : { ...result, score: r.score };
          }
          if (r.published_date) {
            return { ...result, publishedDate: r.published_date };
          }
          return result;
        });
    },
  };
}
