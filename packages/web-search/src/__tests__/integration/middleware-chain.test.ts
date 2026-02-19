import type { ToolRequest } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSearchMiddleware } from "../../middleware.js";

describe("middleware integration chain", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetchWith(response: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
    });
  }

  it("performs end-to-end search with mocked HTTP", async () => {
    mockFetchWith({
      organic: [
        {
          title: "Integration Result",
          link: "https://example.com",
          snippet: "Test snippet",
        },
      ],
    });

    const middleware = new WebSearchMiddleware({
      providers: [{ provider: "serper", apiKey: "test-key" }],
    });

    const req: ToolRequest = {
      toolName: "web_search",
      input: { query: "integration test" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);
    const results = response.output as Array<{ title: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Integration Result");
  });

  it("falls back when first provider fails", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("Server error"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            web: {
              results: [
                {
                  title: "Fallback",
                  url: "https://fallback.com",
                  description: "From brave",
                },
              ],
            },
          }),
      });
    });

    const middleware = new WebSearchMiddleware({
      providers: [
        { provider: "serper", apiKey: "key1" },
        { provider: "brave", apiKey: "key2" },
      ],
    });

    const req: ToolRequest = {
      toolName: "web_search",
      input: { query: "fallback test" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);
    const results = response.output as Array<{ title: string }>;
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe("Fallback");
  });

  it("propagates error when all providers fail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("All down"),
    });

    const middleware = new WebSearchMiddleware({
      providers: [{ provider: "serper", apiKey: "key" }],
    });

    const req: ToolRequest = {
      toolName: "web_search",
      input: { query: "error test" },
    };
    const next = vi.fn();

    await expect(middleware.wrapToolCall!(req, next)).rejects.toThrow(
      "All search providers failed",
    );
  });

  it("passes search options from tool input", async () => {
    mockFetchWith({ organic: [] });

    const middleware = new WebSearchMiddleware({
      providers: [{ provider: "serper", apiKey: "test-key" }],
    });

    const req: ToolRequest = {
      toolName: "web_search",
      input: {
        query: "options test",
        maxResults: 3,
        language: "fr",
      },
    };
    const next = vi.fn();

    await middleware.wrapToolCall!(req, next);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0]!;
    const body = JSON.parse(fetchCall[1]!.body as string);
    expect(body.num).toBe(3);
    expect(body.hl).toBe("fr");
  });
});
