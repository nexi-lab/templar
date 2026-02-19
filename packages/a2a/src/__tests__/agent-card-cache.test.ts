import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCardCache } from "../agent-card-cache.js";
import { createMockAgentCard } from "./helpers.js";

describe("AgentCardCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for cache miss", () => {
    const cache = new AgentCardCache();
    expect(cache.get("https://unknown.com")).toBeUndefined();
  });

  it("stores and retrieves an Agent Card", () => {
    const cache = new AgentCardCache();
    const card = createMockAgentCard({ name: "Cached Agent" });
    cache.set("https://agent.com", card);

    const result = cache.get("https://agent.com");
    expect(result).toEqual(card);
    expect(result?.name).toBe("Cached Agent");
  });

  it("returns undefined for expired entries", () => {
    const cache = new AgentCardCache({ ttlMs: 1000 });
    const card = createMockAgentCard();
    cache.set("https://agent.com", card);

    // Not yet expired
    vi.advanceTimersByTime(999);
    expect(cache.get("https://agent.com")).toEqual(card);

    // Now expired
    vi.advanceTimersByTime(2);
    expect(cache.get("https://agent.com")).toBeUndefined();
  });

  it("evicts LRU entry when at capacity", () => {
    const cache = new AgentCardCache({ maxEntries: 2 });
    const card1 = createMockAgentCard({ name: "Agent 1" });
    const card2 = createMockAgentCard({ name: "Agent 2" });
    const card3 = createMockAgentCard({ name: "Agent 3" });

    cache.set("https://a1.com", card1);
    cache.set("https://a2.com", card2);

    // Both present
    expect(cache.size).toBe(2);

    // Insert third — should evict a1 (LRU)
    cache.set("https://a3.com", card3);
    expect(cache.size).toBe(2);
    expect(cache.get("https://a1.com")).toBeUndefined();
    expect(cache.get("https://a2.com")).toEqual(card2);
    expect(cache.get("https://a3.com")).toEqual(card3);
  });

  it("updates LRU order on access", () => {
    const cache = new AgentCardCache({ maxEntries: 2 });
    const card1 = createMockAgentCard({ name: "Agent 1" });
    const card2 = createMockAgentCard({ name: "Agent 2" });
    const card3 = createMockAgentCard({ name: "Agent 3" });

    cache.set("https://a1.com", card1);
    cache.set("https://a2.com", card2);

    // Access a1 — now a2 is LRU
    cache.get("https://a1.com");

    // Insert third — should evict a2 (now LRU)
    cache.set("https://a3.com", card3);
    expect(cache.get("https://a1.com")).toEqual(card1);
    expect(cache.get("https://a2.com")).toBeUndefined();
    expect(cache.get("https://a3.com")).toEqual(card3);
  });

  it("clears all entries", () => {
    const cache = new AgentCardCache();
    cache.set("https://a1.com", createMockAgentCard());
    cache.set("https://a2.com", createMockAgentCard());
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("https://a1.com")).toBeUndefined();
  });

  it("deletes a specific entry", () => {
    const cache = new AgentCardCache();
    cache.set("https://a1.com", createMockAgentCard());
    expect(cache.delete("https://a1.com")).toBe(true);
    expect(cache.get("https://a1.com")).toBeUndefined();
    expect(cache.delete("https://a1.com")).toBe(false);
  });

  it("has() returns false for missing or expired entries", () => {
    const cache = new AgentCardCache({ ttlMs: 1000 });
    expect(cache.has("https://a1.com")).toBe(false);

    cache.set("https://a1.com", createMockAgentCard());
    expect(cache.has("https://a1.com")).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(cache.has("https://a1.com")).toBe(false);
  });

  it("uses default config values", () => {
    const cache = new AgentCardCache();
    // Default TTL is 300_000ms (5 min)
    cache.set("https://a1.com", createMockAgentCard());

    vi.advanceTimersByTime(299_999);
    expect(cache.has("https://a1.com")).toBe(true);

    vi.advanceTimersByTime(2);
    expect(cache.has("https://a1.com")).toBe(false);
  });

  it("overwrites existing entry on set", () => {
    const cache = new AgentCardCache();
    const card1 = createMockAgentCard({ name: "V1" });
    const card2 = createMockAgentCard({ name: "V2" });

    cache.set("https://a1.com", card1);
    cache.set("https://a1.com", card2);

    expect(cache.size).toBe(1);
    expect(cache.get("https://a1.com")?.name).toBe("V2");
  });
});
