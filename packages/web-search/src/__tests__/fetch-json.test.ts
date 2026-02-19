import { SearchProviderError, SearchRateLimitedError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "../fetch-json.js";

describe("fetchJson", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("returns parsed JSON on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: [1, 2, 3] }),
    });

    const result = await fetchJson<{ results: number[] }>("test", "https://api.example.com", {
      method: "GET",
    });
    expect(result).toEqual({ results: [1, 2, 3] });
  });

  it("throws SearchRateLimitedError on 429", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    await expect(fetchJson("test", "https://api.example.com", { method: "GET" })).rejects.toThrow(
      SearchRateLimitedError,
    );
  });

  it("throws SearchProviderError on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal error"),
    });

    await expect(fetchJson("test", "https://api.example.com", { method: "GET" })).rejects.toThrow(
      SearchProviderError,
    );
  });

  it("throws SearchProviderError on network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    await expect(fetchJson("test", "https://api.example.com", { method: "GET" })).rejects.toThrow(
      SearchProviderError,
    );
  });

  it("throws SearchProviderError on timeout", async () => {
    vi.useRealTimers();

    globalThis.fetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    await expect(
      fetchJson("test", "https://api.example.com", { method: "GET" }, 50),
    ).rejects.toThrow(SearchProviderError);
  });

  it("re-throws AbortError from external signal", async () => {
    const controller = new AbortController();

    globalThis.fetch = vi.fn().mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
    });

    await expect(
      fetchJson("test", "https://api.example.com", { method: "GET" }, 10_000, controller.signal),
    ).rejects.toThrow(DOMException);
  });
});
