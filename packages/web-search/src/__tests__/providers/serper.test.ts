import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSerperProvider } from "../../providers/serper.js";

describe("createSerperProvider", () => {
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
          organic: [
            {
              title: "Test Result",
              link: "https://example.com",
              snippet: "A test snippet",
              date: "2024-01-15",
            },
          ],
        }),
    });

    const provider = createSerperProvider({
      provider: "serper",
      apiKey: "test-key",
    });
    const results = await provider.search("test query");

    expect(provider.id).toBe("serper");
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "Test Result",
      url: "https://example.com",
      snippet: "A test snippet",
      publishedDate: "2024-01-15",
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(fetchCall[0]).toBe("https://google.serper.dev/search");
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.q).toBe("test query");
    expect(body.num).toBe(5);
  });

  it("filters out results without title or link", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          organic: [
            { title: "Valid", link: "https://a.com", snippet: "ok" },
            { title: "", link: "https://b.com", snippet: "no title" },
            { title: "No Link", snippet: "missing link" },
          ],
        }),
    });

    const provider = createSerperProvider({
      provider: "serper",
      apiKey: "key",
    });
    const results = await provider.search("test");
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Valid");
  });

  it("truncates long snippets", async () => {
    const longSnippet = "x".repeat(500);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          organic: [{ title: "Test", link: "https://a.com", snippet: longSnippet }],
        }),
    });

    const provider = createSerperProvider({ provider: "serper", apiKey: "key" }, 100);
    const results = await provider.search("test");
    expect(results[0]!.snippet.length).toBeLessThanOrEqual(103); // 100 + "..."
  });
});
