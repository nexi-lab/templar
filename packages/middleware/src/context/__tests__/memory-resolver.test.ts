import { describe, expect, it } from "vitest";
import { MemoryQueryResolver } from "../resolvers/memory-resolver.js";
import { createMockNexusClient } from "./helpers.js";

describe("MemoryQueryResolver", () => {
  it("should search memories and return formatted content", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({
      results: [
        { memory_id: "m1", content: "User likes TypeScript", state: "active" },
        { memory_id: "m2", content: "User prefers dark mode", state: "active" },
      ],
    });

    const resolver = new MemoryQueryResolver(client);
    const result = await resolver.resolve({ query: "preferences", limit: 5 }, {});

    expect(result.type).toBe("memory_query");
    expect(result.content).toContain("User likes TypeScript");
    expect(result.content).toContain("User prefers dark mode");
    expect(result.truncated).toBe(false);
    expect(mockMemory.search).toHaveBeenCalledWith({
      query: "preferences",
      limit: 5,
    });
  });

  it("should interpolate template variables in query", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({ results: [] });

    const resolver = new MemoryQueryResolver(client);
    await resolver.resolve(
      { query: "{{task.description}}" },
      { task: { description: "fix auth bug" } },
    );

    expect(mockMemory.search).toHaveBeenCalledWith({
      query: "fix auth bug",
      limit: 5,
    });
  });

  it("should return empty content when no results", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({ results: [] });

    const resolver = new MemoryQueryResolver(client);
    const result = await resolver.resolve({ query: "nothing" }, {});

    expect(result.content).toBe("");
    expect(result.originalChars).toBe(0);
  });

  it("should handle API errors by propagating", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockRejectedValue(new Error("API unavailable"));

    const resolver = new MemoryQueryResolver(client);
    await expect(resolver.resolve({ query: "q" }, {})).rejects.toThrow("API unavailable");
  });

  it("should truncate when maxChars is exceeded", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({
      results: [{ memory_id: "m1", content: "a".repeat(100), state: "active" }],
    });

    const resolver = new MemoryQueryResolver(client);
    const result = await resolver.resolve({ query: "q", maxChars: 10 }, {});

    expect(result.content.length).toBe(10);
    expect(result.truncated).toBe(true);
  });

  it("should throw when abort signal is already aborted", async () => {
    const { client } = createMockNexusClient();
    const resolver = new MemoryQueryResolver(client);
    const controller = new AbortController();
    controller.abort();

    await expect(resolver.resolve({ query: "q" }, {}, controller.signal)).rejects.toThrow(
      "Aborted",
    );
  });

  it("should handle object content in memory entries", async () => {
    const { client, mockMemory } = createMockNexusClient();
    mockMemory.search.mockResolvedValue({
      results: [{ memory_id: "m1", content: { key: "value" }, state: "active" }],
    });

    const resolver = new MemoryQueryResolver(client);
    const result = await resolver.resolve({ query: "q" }, {});

    expect(result.content).toBe('{"key":"value"}');
  });
});
