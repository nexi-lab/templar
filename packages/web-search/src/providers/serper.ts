/**
 * Serper.dev provider — Google Search via Serper API.
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

const SERPER_BASE_URL = "https://google.serper.dev/search";

interface SerperResult {
  readonly title?: string;
  readonly link?: string;
  readonly snippet?: string;
  readonly date?: string;
}

interface SerperResponse {
  readonly organic?: readonly SerperResult[];
}

function mapTimeRange(timeRange: string | undefined): string | undefined {
  if (!timeRange) return undefined;
  const map: Record<string, string> = {
    day: "qdr:d",
    week: "qdr:w",
    month: "qdr:m",
    year: "qdr:y",
  };
  return map[timeRange];
}

export function createSerperProvider(
  config: SearchProviderConfig,
  maxSnippetLength: number = DEFAULT_MAX_SNIPPET_LENGTH,
): WebSearchProvider {
  const baseUrl = config.baseUrl ?? SERPER_BASE_URL;
  const timeoutMs = config.timeoutMs;

  return {
    id: "serper",

    async search(
      query: string,
      options?: SearchOptions,
      signal?: AbortSignal,
    ): Promise<readonly SearchResult[]> {
      const body: Record<string, unknown> = {
        q: query,
        num: options?.maxResults ?? DEFAULT_MAX_RESULTS,
      };

      const tbs = mapTimeRange(options?.timeRange);
      if (tbs) body.tbs = tbs;
      if (options?.language) body.hl = options.language;

      const response = await fetchJson<SerperResponse>(
        "serper",
        baseUrl,
        {
          method: "POST",
          headers: {
            "X-API-KEY": config.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        timeoutMs,
        signal,
      );

      const results = response.organic ?? [];
      return results
        .filter((r): r is SerperResult & { title: string; link: string } =>
          Boolean(r.title && r.link),
        )
        .map((r) => {
          const result: SearchResult = {
            title: r.title,
            url: r.link,
            snippet: truncateSnippet(r.snippet ?? "", maxSnippetLength),
          };
          if (r.date) {
            return { ...result, publishedDate: r.date };
          }
          return result;
        });
    },
  };
}
