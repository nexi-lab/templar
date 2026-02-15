import { describe, expect, it } from "vitest";
import { MockEntityExtractor, NexusEntityExtractor } from "../extractor.js";

// ============================================================================
// NexusEntityExtractor
// ============================================================================

describe("NexusEntityExtractor", () => {
  it("should return empty extraction result from extract()", async () => {
    const extractor = new NexusEntityExtractor();
    const result = await extractor.extract("Alice works at Acme Corp");

    expect(result.entities).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it("should build store params with extraction flags", () => {
    const extractor = new NexusEntityExtractor();
    const params = extractor.buildStoreParams("Alice works at Acme", "agent", undefined);

    expect(params.content).toBe("Alice works at Acme");
    expect(params.scope).toBe("agent");
    expect(params.memory_type).toBe("entity");
    expect(params.extract_entities).toBe(true);
    expect(params.extract_relationships).toBe(true);
    expect(params.store_to_graph).toBe(true);
    expect(params.importance).toBe(0.7);
  });

  it("should include namespace when provided", () => {
    const extractor = new NexusEntityExtractor();
    const params = extractor.buildStoreParams("text", "agent", "test-ns");

    expect(params.namespace).toBe("test-ns");
  });

  it("should not include namespace when undefined", () => {
    const extractor = new NexusEntityExtractor();
    const params = extractor.buildStoreParams("text", "agent", undefined);

    expect(params).not.toHaveProperty("namespace");
  });

  it("should handle all valid scopes", () => {
    const extractor = new NexusEntityExtractor();

    for (const scope of ["agent", "user", "zone", "global", "session"]) {
      const params = extractor.buildStoreParams("text", scope, undefined);
      expect(params.scope).toBe(scope);
    }
  });
});

// ============================================================================
// MockEntityExtractor
// ============================================================================

describe("MockEntityExtractor", () => {
  it("should return empty results by default", async () => {
    const mock = new MockEntityExtractor();
    const result = await mock.extract("anything");

    expect(result.entities).toEqual([]);
    expect(result.relationships).toEqual([]);
  });

  it("should return configured results", async () => {
    const mock = new MockEntityExtractor({
      entities: [{ name: "Alice", type: "person" }],
      relationships: [{ source: "Alice", target: "Bob", type: "knows" }],
    });

    const result = await mock.extract("anything");
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.name).toBe("Alice");
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]?.type).toBe("knows");
  });

  it("should update results via setResults", async () => {
    const mock = new MockEntityExtractor();

    mock.setResults({
      entities: [{ name: "Updated", type: "concept" }],
      relationships: [],
    });

    const result = await mock.extract("anything");
    expect(result.entities[0]?.name).toBe("Updated");
  });

  it("should update entities via setEntities", async () => {
    const mock = new MockEntityExtractor({
      entities: [],
      relationships: [{ source: "A", target: "B", type: "x" }],
    });

    mock.setEntities([{ name: "New", type: "person" }]);
    const result = await mock.extract("anything");

    expect(result.entities[0]?.name).toBe("New");
    // Relationships should be preserved
    expect(result.relationships).toHaveLength(1);
  });

  it("should update relationships via setRelationships", async () => {
    const mock = new MockEntityExtractor({
      entities: [{ name: "A", type: "person" }],
      relationships: [],
    });

    mock.setRelationships([{ source: "A", target: "B", type: "knows" }]);
    const result = await mock.extract("anything");

    // Entities should be preserved
    expect(result.entities).toHaveLength(1);
    expect(result.relationships[0]?.type).toBe("knows");
  });
});
