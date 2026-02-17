import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityMemory } from "../entity-memory.js";
import { EntityMemoryMiddleware } from "../middleware.js";
import type { EntityMemoryConfig } from "../types.js";

// ============================================================================
// HELPERS
// ============================================================================

function createConfig(overrides: Partial<EntityMemoryConfig> = {}): EntityMemoryConfig {
  return { scope: "agent", ...overrides };
}

describe("Edge Cases", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // #1: Entity resolution ambiguity
  // =========================================================================

  describe("entity resolution ambiguity", () => {
    it("should track entities with similar names independently", async () => {
      mockClient.mockMemory.store.mockResolvedValueOnce({
        memory_id: "e-alice",
        status: "created",
      });
      mockClient.mockMemory.store.mockResolvedValueOnce({
        memory_id: "e-alice-smith",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig());

      const alice1 = await em.track({ entity: "Alice", type: "person" });
      const alice2 = await em.track({ entity: "Alice Smith", type: "person" });

      // Each gets its own unique ID — resolution is delegated to Nexus
      expect(alice1.id).toBe("e-alice");
      expect(alice2.id).toBe("e-alice-smith");
      expect(alice1.id).not.toBe(alice2.id);
    });

    it("should use path_key for dedup of exact same entity", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e-alice",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig());

      await em.track({ entity: "Alice", type: "person" });
      await em.track({ entity: "Alice", type: "person" });

      // Both calls should have same path_key for upsert
      const call1 = mockClient.mockMemory.store.mock.calls[0]?.[0];
      const call2 = mockClient.mockMemory.store.mock.calls[1]?.[0];
      expect(call1.path_key).toBe(call2.path_key);
      expect(call1.path_key).toBe("entity:Alice:person");
    });
  });

  // =========================================================================
  // #2: Circular relationships
  // =========================================================================

  describe("circular relationships", () => {
    it("should allow A manages B and B manages A", async () => {
      mockClient.mockMemory.store.mockResolvedValueOnce({
        memory_id: "e-alice",
        status: "created",
      });
      mockClient.mockMemory.batchStore.mockResolvedValueOnce({
        stored: 1,
        failed: 0,
        memory_ids: ["rel-1"],
      });
      mockClient.mockMemory.store.mockResolvedValueOnce({
        memory_id: "e-bob",
        status: "created",
      });
      mockClient.mockMemory.batchStore.mockResolvedValueOnce({
        stored: 1,
        failed: 0,
        memory_ids: ["rel-2"],
      });

      const em = new EntityMemory(mockClient.client, createConfig());

      // A manages B
      await em.track({
        entity: "Alice",
        type: "person",
        relationships: [{ target: "Bob", type: "manages" }],
      });

      // B manages A (circular)
      await em.track({
        entity: "Bob",
        type: "person",
        relationships: [{ target: "Alice", type: "manages" }],
      });

      // Both should succeed — no cycle detection (Nexus handles graph semantics)
      expect(mockClient.mockMemory.store).toHaveBeenCalledTimes(2);
      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // #3: Stale entity data
  // =========================================================================

  describe("stale entity data", () => {
    it("should handle entity deleted between load and query", async () => {
      // First call succeeds (load)
      mockClient.mockMemory.query.mockResolvedValueOnce({
        results: [
          {
            memory_id: "e1",
            content: { name: "Alice", type: "person" },
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

      // Entity was deleted in Nexus — getEntity returns 404
      mockClient.mockMemory.get.mockRejectedValue(new Error("Not found"));
      const stale = await em.getEntity(entity?.id ?? "");
      expect(stale).toBeUndefined();
    });
  });

  // =========================================================================
  // #4: Empty extraction
  // =========================================================================

  describe("empty extraction", () => {
    it("should handle turn with no extractable entities (acknowledgement)", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, createConfig());

      await mw.onAfterTurn({
        sessionId: "s1",
        turnNumber: 1,
        output: "OK",
      });

      expect(mw.getPendingCount()).toBe(0);
    });

    it("should handle turn with empty string output", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, createConfig());

      await mw.onAfterTurn({
        sessionId: "s1",
        turnNumber: 1,
        output: "",
      });

      expect(mw.getPendingCount()).toBe(0);
    });

    it("should handle turn with boolean output", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, createConfig());

      await mw.onAfterTurn({
        sessionId: "s1",
        turnNumber: 1,
        output: true,
      });

      expect(mw.getPendingCount()).toBe(0);
    });

    it("should handle turn with number output", async () => {
      const mw = new EntityMemoryMiddleware(mockClient.client, createConfig());

      await mw.onAfterTurn({
        sessionId: "s1",
        turnNumber: 1,
        output: 42,
      });

      expect(mw.getPendingCount()).toBe(0);
    });
  });

  // =========================================================================
  // #5: Concurrent middleware
  // =========================================================================

  describe("concurrent middleware", () => {
    it("should not interfere with NexusMemoryMiddleware metadata", async () => {
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

      const entityMw = new EntityMemoryMiddleware(mockClient.client, createConfig());
      await entityMw.onSessionStart({ sessionId: "s1" });

      // Simulate existing metadata from NexusMemoryMiddleware
      const turnCtx = {
        sessionId: "s1",
        turnNumber: 1,
        metadata: {
          memories: [{ content: "some memory", memory_id: "m1" }],
        },
      };

      await entityMw.onBeforeTurn(turnCtx);

      // Both should coexist
      expect(turnCtx.metadata?.memories).toBeDefined();
      expect((turnCtx.metadata as Record<string, unknown>)?.entities).toBeDefined();
    });
  });

  // =========================================================================
  // #6: Large relationship sets
  // =========================================================================

  describe("large relationship sets", () => {
    it("should respect maxEntitiesPerQuery limit", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig({ maxEntitiesPerQuery: 5 }));
      await em.getRelationships("e1");

      const queryArgs = mockClient.mockMemory.query.mock.calls[0]?.[0];
      expect(queryArgs.limit).toBe(5);
    });

    it("should allow overriding limit per query", async () => {
      mockClient.mockMemory.query.mockResolvedValue({
        results: [],
        total: 0,
        filters: {},
      });

      const em = new EntityMemory(mockClient.client, createConfig({ maxEntitiesPerQuery: 20 }));
      await em.getRelationships("e1", { limit: 3 });

      const queryArgs = mockClient.mockMemory.query.mock.calls[0]?.[0];
      expect(queryArgs.limit).toBe(3);
    });

    it("should handle many relationships in batch store", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e1",
        status: "created",
      });
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 50,
        failed: 0,
        memory_ids: Array.from({ length: 50 }, (_, i) => `rel-${i}`),
      });

      const em = new EntityMemory(mockClient.client, createConfig());

      const relationships = Array.from({ length: 50 }, (_, i) => ({
        target: `Entity-${i}`,
        type: "related_to",
      }));

      await em.track({
        entity: "Hub",
        type: "concept",
        relationships,
      });

      const batchCall = mockClient.mockMemory.batchStore.mock.calls[0]?.[0];
      expect(batchCall.memories).toHaveLength(50);
    });
  });

  // =========================================================================
  // #7: Invalid entity type
  // =========================================================================

  describe("invalid entity type", () => {
    it("should reject invalid entity types in config", () => {
      expect(
        () =>
          new EntityMemory(
            mockClient.client,
            createConfig({ entityTypes: ["person", "invalid_type" as "person"] }),
          ),
      ).toThrow('Invalid entity type: "invalid_type"');
    });

    it("should accept entity with custom type via track", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e1",
        status: "created",
      });

      const em = new EntityMemory(mockClient.client, createConfig());
      const entity = await em.track({
        entity: "CustomThing",
        type: "custom",
      });

      expect(entity.entityType).toBe("custom");
    });
  });

  // =========================================================================
  // #8: Relationship to non-existent entity
  // =========================================================================

  describe("relationship to non-existent entity", () => {
    it("should track relationship even when target entity does not exist yet", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e-alice",
        status: "created",
      });
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 1,
        failed: 0,
        memory_ids: ["rel-1"],
      });

      const em = new EntityMemory(mockClient.client, createConfig());

      // Bob doesn't exist yet, but we can still create the relationship
      await em.track({
        entity: "Alice",
        type: "person",
        relationships: [{ target: "NonExistentEntity", type: "collaborates_with" }],
      });

      expect(mockClient.mockMemory.batchStore).toHaveBeenCalledOnce();

      // The relationship should have a pending target ID
      const batchArgs = mockClient.mockMemory.batchStore.mock.calls[0]?.[0];
      const relContent = batchArgs.memories[0].content;
      expect(relContent.targetEntityId).toBe("pending:NonExistentEntity");
    });

    it("should use path_key for relationship dedup", async () => {
      mockClient.mockMemory.store.mockResolvedValue({
        memory_id: "e-alice",
        status: "created",
      });
      mockClient.mockMemory.batchStore.mockResolvedValue({
        stored: 1,
        failed: 0,
        memory_ids: ["rel-1"],
      });

      const em = new EntityMemory(mockClient.client, createConfig());

      await em.track({
        entity: "Alice",
        type: "person",
        relationships: [{ target: "Bob", type: "knows" }],
      });

      const batchArgs = mockClient.mockMemory.batchStore.mock.calls[0]?.[0];
      expect(batchArgs.memories[0].path_key).toBe("rel:Alice:knows:Bob");
    });
  });
});
