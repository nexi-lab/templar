import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTavilyProvider } from "../../providers/tavily.js";

describe("createTavilyProvider", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("sends correct request and normalizes response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          results: [
            {
              title: "Tavily Result",
              url: "https://example.com",
              content: "A content snippet",
              score: 0.95,
              published_date: "2024-01-20",
            },
          ],
        }),
    });

    const provider = createTavilyProvider({
      provider: "tavily",
      apiKey: "test-key",
    });
    const results = await provider.search("test query");

    expect(provider.id).toBe("tavily");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "Tavily Result",
      url: "https://example.com",
      snippet: "A content snippet",
      score: 0.95,
      publishedDate: "2024-01-20",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(fetchCall?.[0]).toBe("https://api.tavily.com/search");
    const body = JSON.parse(fetchCall?.[1]?.body as string);
    // Tavily requires the API key in the request body
    expect(body.api_key).toBe("test-key");
    expect(body.query).toBe("test query");
    expect(body.search_depth).toBe("basic");
  });

  it("filters out results without title or url", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          results: [
            { title: "Valid", url: "https://a.com", content: "ok" },
            { url: "https://b.com", content: "no title" },
          ],
        }),
    });

    const provider = createTavilyProvider({
      provider: "tavily",
      apiKey: "key",
    });
    const results = await provider.search("test");
    expect(results).toHaveLength(1);
  });

  it("truncates long snippets", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          results: [
            {
              title: "Test",
              url: "https://a.com",
              content: "z".repeat(500),
            },
          ],
        }),
    });

    const provider = createTavilyProvider({ provider: "tavily", apiKey: "key" }, 100);
    const results = await provider.search("test");
    expect(results[0]?.snippet.length).toBeLessThanOrEqual(103);
  });
});
