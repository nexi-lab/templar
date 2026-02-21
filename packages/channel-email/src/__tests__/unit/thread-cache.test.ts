import { describe, expect, it } from "vitest";
import { ThreadCache } from "../../thread-cache.js";

describe("ThreadCache", () => {
  it("stores and retrieves a messageId → threadId mapping", () => {
    const cache = new ThreadCache();
    cache.set("msg-1", "thread-A");
    expect(cache.getThreadId("msg-1")).toBe("thread-A");
  });

  it("returns undefined for unknown messageId", () => {
    const cache = new ThreadCache();
    expect(cache.getThreadId("unknown")).toBeUndefined();
  });

  it("resolves threadId from inReplyTo", () => {
    const cache = new ThreadCache();
    cache.set("msg-1", "thread-A");
    cache.set("msg-2", "thread-A");

    const threadId = cache.resolve("msg-1", []);
    expect(threadId).toBe("thread-A");
  });

  it("resolves threadId from references chain (last match wins)", () => {
    const cache = new ThreadCache();
    cache.set("msg-1", "thread-A");
    cache.set("msg-2", "thread-B");

    // inReplyTo not found, but references[1] found
    const threadId = cache.resolve("msg-unknown", ["msg-1", "msg-2"]);
    expect(threadId).toBe("thread-B");
  });

  it("prefers inReplyTo over references", () => {
    const cache = new ThreadCache();
    cache.set("msg-1", "thread-A");
    cache.set("msg-2", "thread-B");

    const threadId = cache.resolve("msg-1", ["msg-2"]);
    expect(threadId).toBe("thread-A");
  });

  it("returns undefined when neither inReplyTo nor references match", () => {
    const cache = new ThreadCache();
    const threadId = cache.resolve("unknown-1", ["unknown-2"]);
    expect(threadId).toBeUndefined();
  });

  it("returns undefined when inReplyTo is undefined and references are empty", () => {
    const cache = new ThreadCache();
    const threadId = cache.resolve(undefined, []);
    expect(threadId).toBeUndefined();
  });

  it("evicts oldest entries when capacity is exceeded", () => {
    const cache = new ThreadCache(3);
    cache.set("msg-1", "thread-A");
    cache.set("msg-2", "thread-B");
    cache.set("msg-3", "thread-C");
    cache.set("msg-4", "thread-D"); // evicts msg-1

    expect(cache.getThreadId("msg-1")).toBeUndefined();
    expect(cache.getThreadId("msg-2")).toBe("thread-B");
    expect(cache.getThreadId("msg-4")).toBe("thread-D");
  });

  it("refreshes entry on get (LRU behavior)", () => {
    const cache = new ThreadCache(3);
    cache.set("msg-1", "thread-A");
    cache.set("msg-2", "thread-B");
    cache.set("msg-3", "thread-C");

    // Access msg-1 to refresh it
    cache.getThreadId("msg-1");

    // Now msg-2 is the oldest, should be evicted
    cache.set("msg-4", "thread-D");
    expect(cache.getThreadId("msg-1")).toBe("thread-A");
    expect(cache.getThreadId("msg-2")).toBeUndefined();
  });

  it("uses default capacity of 1000", () => {
    const cache = new ThreadCache();
    // Add 1001 entries
    for (let i = 0; i < 1001; i++) {
      cache.set(`msg-${i}`, `thread-${i}`);
    }
    // First entry should be evicted
    expect(cache.getThreadId("msg-0")).toBeUndefined();
    // Last entry should exist
    expect(cache.getThreadId("msg-1000")).toBe("thread-1000");
  });

  it("returns current size", () => {
    const cache = new ThreadCache(5);
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);
  });

  it("overwrites existing entry without affecting capacity", () => {
    const cache = new ThreadCache(3);
    cache.set("msg-1", "thread-A");
    cache.set("msg-2", "thread-B");
    cache.set("msg-1", "thread-C"); // overwrite
    expect(cache.getThreadId("msg-1")).toBe("thread-C");
    expect(cache.size).toBe(2);
  });
});
