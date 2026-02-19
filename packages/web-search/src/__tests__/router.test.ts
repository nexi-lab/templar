import {
  SearchAllProvidersFailedError,
  SearchInvalidQueryError,
  SearchProviderError,
  SearchRateLimitedError,
} from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { WebSearchRouter } from "../router.js";
import type { SearchResult, WebSearchProvider } from "../types.js";

function createMockProvider(id: string, results: readonly SearchResult[] = []): WebSearchProvider {
  return {
    id,
    search: vi.fn().mockResolvedValue(results),
  };
}

function createFailingProvider(id: string, error: Error): WebSearchProvider {
  return {
    id,
    search: vi.fn().mockRejectedValue(error),
  };
}

// We need to mock createSearchProvider to inject our mock providers
vi.mock("../providers/index.js", () => ({
  createSearchProvider: vi.fn(),
}));

import { createSearchProvider } from "../providers/index.js";

describe("WebSearchRouter", () => {
  it("returns results from first provider on success", async () => {
    const mockResults: SearchResult[] = [
      { title: "Result 1", url: "https://a.com", snippet: "Snippet 1" },
    ];
    vi.mocked(createSearchProvider).mockReturnValue(createMockProvider("serper", mockResults));

    const router = new WebSearchRouter({
      providers: [{ provider: "serper", apiKey: "key" }],
    });
    const results = await router.search("test query");
    expect(results).toEqual(mockResults);
  });

  it("falls back to second provider when first fails", async () => {
    const mockResults: SearchResult[] = [
      { title: "From Brave", url: "https://b.com", snippet: "Brave result" },
    ];
    let callIndex = 0;
    vi.mocked(createSearchProvider).mockImplementation(() => {
      if (callIndex++ === 0) {
        return createFailingProvider(
          "serper",
          new SearchProviderError("serper", "Connection failed"),
        );
      }
      return createMockProvider("brave", mockResults);
    });

    const router = new WebSearchRouter({
      providers: [
        { provider: "serper", apiKey: "key1" },
        { provider: "brave", apiKey: "key2" },
      ],
    });
    const results = await router.search("test query");
    expect(results).toEqual(mockResults);
  });

  it("throws SearchAllProvidersFailedError when all providers fail", async () => {
    vi.mocked(createSearchProvider).mockReturnValue(
      createFailingProvider("serper", new SearchProviderError("serper", "Error")),
    );

    const router = new WebSearchRouter({
      providers: [{ provider: "serper", apiKey: "key" }],
    });

    await expect(router.search("test query")).rejects.toThrow(SearchAllProvidersFailedError);
  });

  it("throws SearchInvalidQueryError for empty query", async () => {
    vi.mocked(createSearchProvider).mockReturnValue(createMockProvider("serper"));

    const router = new WebSearchRouter({
      providers: [{ provider: "serper", apiKey: "key" }],
    });

    await expect(router.search("")).rejects.toThrow(SearchInvalidQueryError);
    await expect(router.search("   ")).rejects.toThrow(SearchInvalidQueryError);
  });

  it("throws immediately on AbortSignal", async () => {
    vi.mocked(createSearchProvider).mockReturnValue(createMockProvider("serper"));

    const router = new WebSearchRouter({
      providers: [{ provider: "serper", apiKey: "key" }],
    });

    const controller = new AbortController();
    controller.abort();

    await expect(router.search("test", undefined, controller.signal)).rejects.toThrow(DOMException);
  });

  it("returns empty results array when provider returns empty", async () => {
    vi.mocked(createSearchProvider).mockReturnValue(createMockProvider("serper", []));

    const router = new WebSearchRouter({
      providers: [{ provider: "serper", apiKey: "key" }],
    });
    const results = await router.search("test");
    expect(results).toEqual([]);
  });

  it("falls back on rate limit then succeeds", async () => {
    const mockResults: SearchResult[] = [
      { title: "Backup", url: "https://b.com", snippet: "Backup result" },
    ];
    let callIndex = 0;
    vi.mocked(createSearchProvider).mockImplementation(() => {
      if (callIndex++ === 0) {
        return createFailingProvider("serper", new SearchRateLimitedError("serper"));
      }
      return createMockProvider("brave", mockResults);
    });

    const router = new WebSearchRouter({
      providers: [
        { provider: "serper", apiKey: "key1" },
        { provider: "brave", apiKey: "key2" },
      ],
    });
    const results = await router.search("test");
    expect(results).toEqual(mockResults);
  });

  it("merges default options with per-call options", async () => {
    const mockProvider = createMockProvider("serper", []);
    vi.mocked(createSearchProvider).mockReturnValue(mockProvider);

    const router = new WebSearchRouter({
      providers: [{ provider: "serper", apiKey: "key" }],
      defaultOptions: { maxResults: 10, language: "en" },
    });

    await router.search("test", { timeRange: "week" });

    expect(mockProvider.search).toHaveBeenCalledWith(
      "test",
      { maxResults: 10, language: "en", timeRange: "week" },
      undefined,
    );
  });
});
