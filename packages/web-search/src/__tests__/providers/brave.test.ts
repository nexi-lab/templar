import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBraveProvider } from "../../providers/brave.js";

describe("createBraveProvider", () => {
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
          web: {
            results: [
              {
                title: "Brave Result",
                url: "https://example.com",
                description: "A description",
                age: "2 days ago",
              },
            ],
          },
        }),
    });

    const provider = createBraveProvider({
      provider: "brave",
      apiKey: "test-key",
    });
    const results = await provider.search("test query");

    expect(provider.id).toBe("brave");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "Brave Result",
      url: "https://example.com",
      snippet: "A description",
      publishedDate: "2 days ago",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const url = fetchCall[0] as string;
    expect(url).toContain("api.search.brave.com");
    expect(url).toContain("q=test+query");

    const headers = fetchCall[1]!.headers as Record<string, string>;
    expect(headers["X-Subscription-Token"]).toBe("test-key");
  });

  it("filters out results without title or url", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          web: {
            results: [
              { title: "Valid", url: "https://a.com", description: "ok" },
              { title: "", url: "https://b.com", description: "no title" },
            ],
          },
        }),
    });

    const provider = createBraveProvider({
      provider: "brave",
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
          web: {
            results: [
              {
                title: "Test",
                url: "https://a.com",
                description: "y".repeat(500),
              },
            ],
          },
        }),
    });

    const provider = createBraveProvider({ provider: "brave", apiKey: "key" }, 100);
    const results = await provider.search("test");
    expect(results[0]!.snippet.length).toBeLessThanOrEqual(103);
  });
});
