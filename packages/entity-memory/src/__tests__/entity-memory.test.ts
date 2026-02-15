import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityMemory, validateEntityMemoryConfig } from "../entity-memory.js";
import { MockEntityExtractor } from "../extractor.js";
import type { EntityMemoryConfig } from "../types.js";

// ============================================================================
// HELPERS
// ============================================================================

function createConfig(overrides: Partial<EntityMemoryConfig> = {}): EntityMemoryConfig {
  return { scope: "agent", ...overrides };
}

// ============================================================================
// CONFIG VALIDATION
// ============================================================================

describe("validateEntityMemoryConfig", () => {
  it("should accept valid config", () => {
    expect(() => validateEntityMemoryConfig(createConfig())).not.toThrow();
  });

  it("should reject invalid scope", () => {
    expect(() => validateEntityMemoryConfig(createConfig({ scope: "invalid" as "agent" }))).toThrow(
      "Invalid scope",
    );
  });

  it("should reject maxEntitiesPerQuery < 1", () => {
    expect(() => validateEntityMemoryConfig(createConfig({ maxEntitiesPerQuery: 0 }))).toThrow(
      "maxEntitiesPerQuery must be >= 1",
    );
  });

  it("should reject autoSaveInterval < 1", () => {
    expect(() => validateEntityMemoryConfig(createConfig({ autoSaveInterval: 0 }))).toThrow(
      "autoSaveInterval must be >= 1",
    );
  });

  it("should reject negative sessionStartTimeoutMs", () => {
    expect(() => validateEntityMemoryConfig(createConfig({ sessionStartTimeoutMs: -1 }))).toThrow(
      "sessionStartTimeoutMs must be >= 0",
    );
  });

  it("should reject invalid entity types", () => {
    expect(() =>
      validateEntityMemoryConfig(createConfig({ entityTypes: ["person", "invalid" as "person"] })),
    ).toThrow('Invalid entity type: "invalid"');
  });

  it("should accept all valid entity types", () => {
    expect(() =>
      validateEntityMemoryConfig(
        createConfig({
          entityTypes: ["person", "organization", "project", "concept", "location", "custom"],
        }),
      ),
    ).not.toThrow();
  });
});

// ============================================================================
// EntityMemory
// ============================================================================

describe("EntityMemory", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create with valid config", () => {
      const em = new EntityMemory(mockClient.client, createConfig());
      expect(em.getConfig().scope).toBe("agent");
    });

    it("should apply defaults for optional config", () => {
      const em = new EntityMemory(mockClient.client, createConfig());
      expect(em.getConfig().maxEntitiesPerQuery).toBe(20);
      expect(em.getConfig().autoSaveInterval).toBe(5);
      expect(em.getConfig().sessionStartTimeoutMs).toBe(3000);
    });

    it("should throw on invalid config", () => {
      expect(
        () => new EntityMemory(mockClient.client, createConfig({ scope: "bad" as "agent" })),
      ).toThrow();
    });

    it("should use NexusEntityExtractor by default", () => {
      const em = new EntityMemory(mockClient.client, createConfig());
      expect(em.getExtractor()).toBeDefined();
    });

    it("should accept custom extractor", () => {
      const customExtractor = new MockEntityExtractor();
      const em = new EntityMemory(mockClient.client, createConfig(), customExtractor);
      expect(em.getExtractor()).toBe(customExtractor);
    });
  });

  describe("track", () => {
    it("should store entity via Nexus API", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "new-entity-1",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.track({
        entity: "Alice",
        type: "person",
        attributes: { role: "engineer" },
      });

      expect(entity.id).toBe("new-entity-1");
      expect(entity.name).toBe("Alice");
      expect(entity.entityType).toBe("person");
      expect(entity.attributes).toEqual({ role: "engineer" });
      expect(mockClient.mockMemory.store).toHaveBeenCalledOnce();
    });

    it("should store entity with relationships", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "new-entity-1",
        status: "created",
      });
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 2,
        failed: 0,
        memory_ids: ["rel-1", "rel-2"],
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      await em.track({
        entity: "Alice",
        type: "person",
        relationships: [
          { target: "Acme Corp", type: "works_at" },
          { target: "Bob", type: "manages" },
        ],
      });

      expect(mockClient.mockMemory.store).toHaveBeenCalledOnce();
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledOnce();

      const batchCall = mockClient.mockMemory.batchStore.mock.calls[0]?.[0];
      expect(batchCall.memories).toHaveLength(2);
    });

    it("should not call batchStore when no relationships", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "new-entity-1",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      await em.track({ entity: "Alice", type: "person" });

      expect(mockClient.mockMemory.batchStore).not.toHaveBeenCalled();
    });

    it("should use path_key for entity upsert", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e1",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      await em.track({ entity: "Alice", type: "person" });

      const storeCall = mockClient.mockMemory.store.mock.calls[0]?.[0];
      expect(storeCall.path_key).toBe("entity:Alice:person");
    });

    it("should include namespace when configured", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e1",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig({ namespace: "test-ns" }));
      await em.track({ entity: "Alice", type: "person" });

      const storeCall = mockClient.mockMemory.store.mock.calls[0]?.[0];
      expect(storeCall.namespace).toBe("test-ns");
    });
  });

  describe("getEntity", () => {
    it("should return entity when found", async () => {
      mockClient.mockMemory.get.mockResolvedValue({
        memory: {
          memory_id: "e1",
          content: { name: "Alice", type: "person", attributes: {} },
          scope: "agent",
          state: "active",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.getEntity("e1");

      expect(entity).toBeDefined();
      expect(entity?.name).toBe("Alice");
    });

    it("should return undefined when not found", async () => {
      mockClient.mockMemory.get.mockRejectedValue(new Error("Not found"));

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.getEntity("nonexistent");

      expect(entity).toBeUndefined();
    });

    it("should return undefined when entry is not an entity", async () => {
      mockClient.mockMemory.get.mockResolvedValue({
        memory: {
          memory_id: "e1",
          content: "plain string without entity data",
          scope: "agent",
          state: "active",
        },
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.getEntity("e1");

      expect(entity).toBeUndefined();
    });
  });

  describe("getEntityByName", () => {
    it("should query by name and return entity", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "e1",
            content: { name: "Alice", type: "person", attributes: {} },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.getEntityByName("Alice");

      expect(entity).toBeDefined();
      expect(entity?.name).toBe("Alice");
      expect(mockClient.mockMemory.query).toHaveBeenCalledOnce();
    });

    it("should return undefined when no match", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.getEntityByName("Nobody");

      expect(entity).toBeUndefined();
    });

    it("should include entity type filter when specified", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      await em.getEntityByName("Alice", "person");

      const queryArgs = mockClient.mockMemory.query.mock.calls[0]?.[0];
      expect(queryArgs.entity_type).toBe("person");
    });

    it("should return undefined on API error", async () => {
      mockClient.mockMemory.query.mockRejectedValue(new Error("API error"));

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.getEntityByName("Alice");

      expect(entity).toBeUndefined();
    });
  });

  describe("getRelationships", () => {
    it("should return relationships for entity", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "rel-1",
            content: {
              sourceEntityId: "e1",
              targetEntityId: "e2",
              relationType: "works_at",
              weight: 0.9,
              validFrom: "2026-01-01T00:00:00.000Z",
              validUntil: null,
            },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const rels = await em.getRelationships("e1");

      expect(rels).toHaveLength(1);
      expect(rels[0]?.relationType).toBe("works_at");
    });

    it("should filter by relationship type", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "rel-1",
            content: {
              sourceEntityId: "e1",
              targetEntityId: "e2",
              relationType: "works_at",
              validUntil: null,
            },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          {
            memory_id: "rel-2",
            content: {
              sourceEntityId: "e1",
              targetEntityId: "e3",
              relationType: "manages",
              validUntil: null,
            },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 2,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const rels = await em.getRelationships("e1", { relationType: "manages" });

      expect(rels).toHaveLength(1);
      expect(rels[0]?.relationType).toBe("manages");
    });

    it("should filter out expired relationships by default", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "rel-1",
            content: {
              sourceEntityId: "e1",
              targetEntityId: "e2",
              relationType: "works_at",
              validUntil: "2025-12-31T00:00:00.000Z", // expired
            },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const rels = await em.getRelationships("e1");

      expect(rels).toHaveLength(0);
    });

    it("should include expired relationships when validOnly=false", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "rel-1",
            content: {
              sourceEntityId: "e1",
              targetEntityId: "e2",
              relationType: "works_at",
              validUntil: "2025-12-31T00:00:00.000Z",
            },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const rels = await em.getRelationships("e1", { validOnly: false });

      expect(rels).toHaveLength(1);
    });

    it("should return empty array on API error", async () => {
      mockClient.mockMemory.query.mockRejectedValue(new Error("API error"));

      const em = new EntityMemory(mockClient.client, createConfig());
      const rels = await em.getRelationships("e1");

      expect(rels).toEqual([]);
    });
  });

  describe("searchEntities", () => {
    it("should search with hybrid mode", async () => {
      mockClient.mockMemory.search.mockResolvedValue({
        results: [
          {
            memory_id: "e1",
            content: { name: "Alice", type: "person", attributes: {} },
            scope: "agent",
            state: "active",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
        total: 1,
        query: "Alice",
        search_mode: "hybrid",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const results = await em.searchEntities("Alice");

      expect(results).toHaveLength(1);
      expect(results[0]?.name).toBe("Alice");

      const searchArgs = mockClient.mockMemory.search.mock.calls[0]?.[0];
      expect(searchArgs.search_mode).toBe("hybrid");
      expect(searchArgs.memory_type).toBe("entity");
    });

    it("should apply entity type filter", async () => {
      mockClient.mockMemory.search.mockResolvedValue({
        results: [],
        total: 0,
        query: "test",
        search_mode: "hybrid",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      await em.searchEntities("test", { entityType: "organization" });

      const searchArgs = mockClient.mockMemory.search.mock.calls[0]?.[0];
      expect(searchArgs.entity_type).toBe("organization");
    });

    it("should return empty array on API error", async () => {
      mockClient.mockMemory.search.mockRejectedValue(new Error("API error"));

      const em = new EntityMemory(mockClient.client, createConfig());
      const results = await em.searchEntities("anything");

      expect(results).toEqual([]);
    });

    it("should skip non-entity results from search", async () => {
      mockClient.mockMemory.search.mockResolvedValue({
        results: [
          {
            memory_id: "e1",
            content: "plain string without entity data",
            scope: "agent",
            state: "active",
          },
        ],
        total: 1,
        query: "test",
        search_mode: "hybrid",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const results = await em.searchEntities("test");

      expect(results).toHaveLength(0);
    });
  });
});
