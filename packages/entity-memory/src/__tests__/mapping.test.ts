import type { MemoryEntry } from "@nexus/sdk";
import { describe, expect, it } from "vitest";
import { fromEntity, fromRelationship, toEntity, toRelationship } from "../mapping.js";
import type { Entity, Relationship } from "../types.js";

// ============================================================================
// HELPERS
// ============================================================================

function createEntityEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    memory_id: "entity-1",
    content: {
      name: "Alice",
      type: "person",
      entityType: "person",
      attributes: { role: "engineer" },
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-02-01T00:00:00.000Z",
      sourceMemoryIds: ["m1", "m2"],
    },
    scope: "agent",
    state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
    ...overrides,
  };
}

function createRelationshipEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    memory_id: "rel-1",
    content: {
      sourceEntityId: "entity-1",
      targetEntityId: "entity-2",
      relationType: "works_at",
      type: "works_at",
      weight: 0.9,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: null,
      sourceMemoryIds: ["m1"],
    },
    scope: "agent",
    state: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ============================================================================
// toEntity
// ============================================================================

describe("toEntity", () => {
  it("should map a valid entity MemoryEntry to Entity", () => {
    const entry = createEntityEntry();
    const entity = toEntity(entry);

    expect(entity).toBeDefined();
    expect(entity?.id).toBe("entity-1");
    expect(entity?.name).toBe("Alice");
    expect(entity?.entityType).toBe("person");
    expect(entity?.attributes).toEqual({ role: "engineer" });
    expect(entity?.firstSeen).toBe("2026-01-01T00:00:00.000Z");
    expect(entity?.lastSeen).toBe("2026-02-01T00:00:00.000Z");
    expect(entity?.sourceMemoryIds).toEqual(["m1", "m2"]);
  });

  it("should return undefined for string content that is not JSON", () => {
    const entry = createEntityEntry({ content: "plain text" });
    expect(toEntity(entry)).toBeUndefined();
  });

  it("should parse valid JSON string content", () => {
    const entry = createEntityEntry({
      content: JSON.stringify({
        name: "Bob",
        type: "person",
        attributes: {},
        sourceMemoryIds: [],
      }),
    });
    const entity = toEntity(entry);
    expect(entity).toBeDefined();
    expect(entity?.name).toBe("Bob");
  });

  it("should return undefined if name is missing", () => {
    const entry = createEntityEntry({
      content: { type: "person" },
    });
    expect(toEntity(entry)).toBeUndefined();
  });

  it("should return undefined if type is missing", () => {
    const entry = createEntityEntry({
      content: { name: "Alice" },
    });
    expect(toEntity(entry)).toBeUndefined();
  });

  it("should normalize unknown entity types to 'custom'", () => {
    const entry = createEntityEntry({
      content: { name: "Something", type: "unknown_type", attributes: {} },
    });
    const entity = toEntity(entry);
    expect(entity).toBeDefined();
    expect(entity?.entityType).toBe("custom");
  });

  it("should handle missing attributes", () => {
    const entry = createEntityEntry({
      content: { name: "Alice", type: "person" },
    });
    const entity = toEntity(entry);
    expect(entity).toBeDefined();
    expect(entity?.attributes).toEqual({});
  });

  it("should handle missing sourceMemoryIds", () => {
    const entry = createEntityEntry({
      content: { name: "Alice", type: "person", attributes: {} },
    });
    const entity = toEntity(entry);
    expect(entity).toBeDefined();
    expect(entity?.sourceMemoryIds).toEqual([]);
  });

  it("should fall back to created_at for firstSeen/lastSeen", () => {
    const entry = createEntityEntry({
      content: { name: "Alice", type: "person" },
      created_at: "2026-03-01T00:00:00.000Z",
      updated_at: "2026-03-15T00:00:00.000Z",
    });
    const entity = toEntity(entry);
    expect(entity?.firstSeen).toBe("2026-03-01T00:00:00.000Z");
    expect(entity?.lastSeen).toBe("2026-03-15T00:00:00.000Z");
  });

  it("should use entityType field as fallback for type", () => {
    const entry = createEntityEntry({
      content: { name: "Alice", entityType: "organization" },
    });
    const entity = toEntity(entry);
    expect(entity).toBeDefined();
    expect(entity?.entityType).toBe("organization");
  });
});

// ============================================================================
// toRelationship
// ============================================================================

describe("toRelationship", () => {
  it("should map a valid relationship MemoryEntry to Relationship", () => {
    const entry = createRelationshipEntry();
    const rel = toRelationship(entry);

    expect(rel).toBeDefined();
    expect(rel?.id).toBe("rel-1");
    expect(rel?.sourceEntityId).toBe("entity-1");
    expect(rel?.targetEntityId).toBe("entity-2");
    expect(rel?.relationType).toBe("works_at");
    expect(rel?.weight).toBe(0.9);
    expect(rel?.validFrom).toBe("2026-01-01T00:00:00.000Z");
    expect(rel?.validUntil).toBeNull();
    expect(rel?.sourceMemoryIds).toEqual(["m1"]);
  });

  it("should return undefined if sourceEntityId is missing", () => {
    const entry = createRelationshipEntry({
      content: { targetEntityId: "entity-2", relationType: "works_at" },
    });
    expect(toRelationship(entry)).toBeUndefined();
  });

  it("should return undefined if targetEntityId is missing", () => {
    const entry = createRelationshipEntry({
      content: { sourceEntityId: "entity-1", relationType: "works_at" },
    });
    expect(toRelationship(entry)).toBeUndefined();
  });

  it("should return undefined if relationType and type are missing", () => {
    const entry = createRelationshipEntry({
      content: { sourceEntityId: "entity-1", targetEntityId: "entity-2" },
    });
    expect(toRelationship(entry)).toBeUndefined();
  });

  it("should clamp weight to [0, 1]", () => {
    const entry = createRelationshipEntry({
      content: {
        sourceEntityId: "a",
        targetEntityId: "b",
        relationType: "x",
        weight: 5.0,
      },
    });
    const rel = toRelationship(entry);
    expect(rel?.weight).toBe(1);

    const entry2 = createRelationshipEntry({
      content: {
        sourceEntityId: "a",
        targetEntityId: "b",
        relationType: "x",
        weight: -0.5,
      },
    });
    const rel2 = toRelationship(entry2);
    expect(rel2?.weight).toBe(0);
  });

  it("should default weight to 1.0 if missing", () => {
    const entry = createRelationshipEntry({
      content: {
        sourceEntityId: "a",
        targetEntityId: "b",
        relationType: "x",
      },
    });
    const rel = toRelationship(entry);
    expect(rel?.weight).toBe(1.0);
  });

  it("should use 'type' as fallback for relationType", () => {
    const entry = createRelationshipEntry({
      content: {
        sourceEntityId: "a",
        targetEntityId: "b",
        type: "manages",
      },
    });
    const rel = toRelationship(entry);
    expect(rel?.relationType).toBe("manages");
  });

  it("should parse JSON string content for relationships", () => {
    const entry = createRelationshipEntry({
      content: JSON.stringify({
        sourceEntityId: "a",
        targetEntityId: "b",
        relationType: "depends_on",
        weight: 0.5,
      }),
    });
    const rel = toRelationship(entry);
    expect(rel).toBeDefined();
    expect(rel?.relationType).toBe("depends_on");
    expect(rel?.weight).toBe(0.5);
  });
});

// ============================================================================
// fromEntity
// ============================================================================

describe("fromEntity", () => {
  it("should build content record from Entity", () => {
    const entity: Omit<Entity, "id"> = {
      name: "Alice",
      entityType: "person",
      attributes: { role: "engineer" },
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-02-01T00:00:00.000Z",
      sourceMemoryIds: ["m1"],
    };

    const content = fromEntity(entity);
    expect(content.name).toBe("Alice");
    expect(content.type).toBe("person");
    expect(content.entityType).toBe("person");
    expect(content.attributes).toEqual({ role: "engineer" });
    expect(content.sourceMemoryIds).toEqual(["m1"]);
  });

  it("should create a new array for sourceMemoryIds (no mutation)", () => {
    const ids = ["m1", "m2"];
    const entity: Omit<Entity, "id"> = {
      name: "X",
      entityType: "concept",
      attributes: {},
      firstSeen: "",
      lastSeen: "",
      sourceMemoryIds: ids,
    };
    const content = fromEntity(entity);
    expect(content.sourceMemoryIds).toEqual(["m1", "m2"]);
    expect(content.sourceMemoryIds).not.toBe(ids);
  });
});

// ============================================================================
// fromRelationship
// ============================================================================

describe("fromRelationship", () => {
  it("should build content record from Relationship", () => {
    const rel: Omit<Relationship, "id"> = {
      sourceEntityId: "a",
      targetEntityId: "b",
      relationType: "works_at",
      weight: 0.8,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: null,
      sourceMemoryIds: ["m1"],
    };

    const content = fromRelationship(rel);
    expect(content.sourceEntityId).toBe("a");
    expect(content.targetEntityId).toBe("b");
    expect(content.relationType).toBe("works_at");
    expect(content.type).toBe("works_at");
    expect(content.weight).toBe(0.8);
    expect(content.validUntil).toBeNull();
  });
});

// ============================================================================
// ROUNDTRIP
// ============================================================================

describe("roundtrip", () => {
  it("should roundtrip Entity → content → MemoryEntry → Entity", () => {
    const original: Omit<Entity, "id"> = {
      name: "Acme Corp",
      entityType: "organization",
      attributes: { industry: "tech" },
      firstSeen: "2026-01-01T00:00:00.000Z",
      lastSeen: "2026-02-01T00:00:00.000Z",
      sourceMemoryIds: ["m1"],
    };

    const content = fromEntity(original);
    const entry: MemoryEntry = {
      memory_id: "roundtrip-1",
      content,
      scope: "agent",
      state: "active",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    };

    const restored = toEntity(entry);
    expect(restored).toBeDefined();
    expect(restored?.name).toBe(original.name);
    expect(restored?.entityType).toBe(original.entityType);
    expect(restored?.attributes).toEqual(original.attributes);
    expect(restored?.sourceMemoryIds).toEqual(original.sourceMemoryIds);
  });
});
