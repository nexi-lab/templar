/**
 * Core types for the pluggable web search provider interface.
 */

/**
 * Provider interface — single `search()` method contract.
 */
export interface WebSearchProvider {
  readonly id: string;
  search(
    query: string,
    options?: SearchOptions,
    signal?: AbortSignal,
  ): Promise<readonly SearchResult[]>;
}

/**
 * Common search options — subset shared across all providers.
 */
export interface SearchOptions {
  readonly maxResults?: number;
  readonly timeRange?: "day" | "week" | "month" | "year";
  readonly language?: string;
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
}

/**
 * Normalized search result returned by all providers.
 */
export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  readonly score?: number;
  readonly publishedDate?: string;
}

/**
 * Configuration for a single search provider instance.
 */
export interface SearchProviderConfig {
  readonly provider: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

/**
 * Configuration for the WebSearchRouter (provider registry + fallback).
 */
export interface WebSearchRouterConfig {
  readonly providers: readonly SearchProviderConfig[];
  readonly defaultOptions?: SearchOptions;
  readonly maxSnippetLength?: number;
}

/**
 * Configuration for the WebSearchMiddleware (wrapToolCall integration).
 * @see WebSearchRouterConfig
 */
export interface WebSearchMiddlewareConfig extends WebSearchRouterConfig {
  readonly toolName?: string;
}

/** Default maximum results per search */
export const DEFAULT_MAX_RESULTS = 5;

/** Default snippet truncation length */
export const DEFAULT_MAX_SNIPPET_LENGTH = 300;

/** Default per-request timeout in milliseconds */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** Default tool name intercepted by the middleware */
export const DEFAULT_TOOL_NAME = "web_search";
