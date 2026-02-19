import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkedResourceResolver } from "../resolvers/linked-resolver.js";

describe("LinkedResourceResolver", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should fetch URLs and return concatenated content", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: () => Promise.resolve("page content"),
    });

    const resolver = new LinkedResourceResolver();
    const result = await resolver.resolve({ urls: ["https://example.com/page1"] }, {});

    expect(result.type).toBe("linked_resource");
    expect(result.content).toContain("page content");
    expect(result.content).toContain("https://example.com/page1");
    expect(result.truncated).toBe(false);
  });

  it("should fetch multiple URLs in parallel", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        statusText: "OK",
        text: () => Promise.resolve("content A"),
      })
      .mockResolvedValueOnce({
        ok: true,
        statusText: "OK",
        text: () => Promise.resolve("content B"),
      });

    const resolver = new LinkedResourceResolver();
    const result = await resolver.resolve({ urls: ["https://a.com", "https://b.com"] }, {});

    expect(result.content).toContain("content A");
    expect(result.content).toContain("content B");
  });

  it("should handle failed URLs gracefully", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: () => Promise.resolve(""),
    });

    const resolver = new LinkedResourceResolver();
    const result = await resolver.resolve({ urls: ["https://example.com/missing"] }, {});

    expect(result.content).toContain("[Failed to fetch]");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("should truncate when maxChars is exceeded", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      statusText: "OK",
      text: () => Promise.resolve("x".repeat(1000)),
    });

    const resolver = new LinkedResourceResolver();
    const result = await resolver.resolve({ urls: ["https://a.com"], maxChars: 50 }, {});

    expect(result.content.length).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it("should throw when abort signal is already aborted", async () => {
    const resolver = new LinkedResourceResolver();
    const controller = new AbortController();
    controller.abort();

    await expect(
      resolver.resolve({ urls: ["https://a.com"] }, {}, controller.signal),
    ).rejects.toThrow("Aborted");
  });
});
