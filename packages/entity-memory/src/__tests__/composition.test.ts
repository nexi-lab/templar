import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityMemoryMiddleware } from "../middleware.js";

/**
 * Composition tests — verify EntityMemoryMiddleware works alongside
 * NexusMemoryMiddleware without interference.
 *
 * We simulate both middlewares running on the same lifecycle events
 * without importing NexusMemoryMiddleware directly (to avoid circular deps).
 * Instead, we simulate its behavior via direct metadata manipulation.
 */

// ============================================================================
// HELPERS
// ============================================================================

function createSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "comp-session-1",
    agentId: "comp-agent",
    userId: "comp-user",
    ...overrides,
  };
}

function createTurnContext(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    sessionId: "comp-session-1",
    turnNumber: 1,
    ...overrides,
  };
}

// ============================================================================
// COMPOSITION TESTS
// ============================================================================

describe("Composition with NexusMemoryMiddleware", () => {
  let mockClient: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mockClient = createMockNexusClient();
    vi.restoreAllMocks();
  });

  it("should not overwrite memories metadata set by memory middleware", async () => {
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

    const entityMw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
    await entityMw.onSessionStart(createSessionContext());

    // Simulate NexusMemoryMiddleware injecting memories first
    const turnCtx = createTurnContext({
      metadata: {
        memories: [
          { memory_id: "m1", content: "User prefers TypeScript", scope: "agent", state: "active" },
        ],
      },
    });

    // Then entity middleware runs
    await entityMw.onBeforeTurn(turnCtx);

    // Both keys should coexist
    expect(turnCtx.metadata?.memories).toBeDefined();
    expect((turnCtx.metadata?.memories as unknown[]).length).toBe(1);
    expect(turnCtx.metadata?.entities).toBeDefined();
    expect((turnCtx.metadata?.entities as unknown[]).length).toBe(1);
  });

  it("should not overwrite entities metadata if entity middleware runs first", async () => {
    mockClient.mockMemory.query.mockResolvedValue({
      results: [
        {
          memory_id: "e1",
          content: { name: "Bob", type: "person", attributes: {} },
          scope: "agent",
          state: "active",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      filters: {},
    });

    const entityMw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
    await entityMw.onSessionStart(createSessionContext());

    const turnCtx = createTurnContext();

    // Entity middleware runs first
    await entityMw.onBeforeTurn(turnCtx);
    expect(turnCtx.metadata?.entities).toBeDefined();

    // Simulate NexusMemoryMiddleware running second (adding memories)
    turnCtx.metadata = {
      ...turnCtx.metadata,
      memories: [{ memory_id: "m1", content: "fact" }],
    };

    // Entities should still be there
    expect(turnCtx.metadata?.entities).toBeDefined();
    expect(turnCtx.metadata?.memories).toBeDefined();
  });

  it("should handle ordering independence (entity first, memory second)", async () => {
    mockClient.mockMemory.query.mockResolvedValue({
      results: [
        {
          memory_id: "e1",
          content: { name: "Charlie", type: "person", attributes: {} },
          scope: "agent",
          state: "active",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      filters: {},
    });

    const entityMw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
    await entityMw.onSessionStart(createSessionContext());

    const turnCtx = createTurnContext();
    await entityMw.onBeforeTurn(turnCtx);

    // Add memories (simulating memory middleware running after)
    const metadata = turnCtx.metadata ?? {};
    const updatedCtx = {
      ...turnCtx,
      metadata: {
        ...metadata,
        memories: [{ memory_id: "m1", content: "fact" }],
      },
    };

    expect((updatedCtx.metadata as Record<string, unknown>).entities).toBeDefined();
    expect(updatedCtx.metadata.memories).toBeDefined();
  });

  it("should handle graceful degradation when entity middleware fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Entity middleware fails on session start
    mockClient.mockMemory.query.mockRejectedValue(new Error("Connection refused"));

    const entityMw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
    await entityMw.onSessionStart(createSessionContext());

    // Session continues normally
    const turnCtx = createTurnContext({
      metadata: { memories: [{ memory_id: "m1", content: "fact" }] },
    });

    await entityMw.onBeforeTurn(turnCtx);

    // Memories from memory middleware are untouched
    expect(turnCtx.metadata?.memories).toBeDefined();
    // No entities injected (failed to load)
    expect(turnCtx.metadata?.entities).toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
  });

  it("should buffer and flush independently from memory middleware", async () => {
    mockClient.mockMemory.batchStore.mockResolvedValue({
      stored: 1,
      failed: 0,
      memory_ids: ["m1"],
    });

    const entityMw = new EntityMemoryMiddleware(mockClient.client, {
      scope: "agent",
      autoSaveInterval: 2,
    });

    // Turn 1 — entity middleware buffers
    await entityMw.onAfterTurn(
      createTurnContext({
        output: "Alice and Bob discussed the project timeline at length today",
        turnNumber: 1,
      }),
    );
    expect(entityMw.getPendingCount()).toBe(1);

    // Turn 2 — entity middleware flushes
    await entityMw.onAfterTurn(
      createTurnContext({
        output: "The team agreed to use TypeScript for the new service architecture",
        turnNumber: 2,
      }),
    );

    // Entity middleware called batchStore independently
    expect(mockClient.mockMemory.batchStore).toHaveBeenCalledOnce();
    const batchArgs = mockClient.mockMemory.batchStore.mock.calls[0]?.[0];
    // Should have entity extraction flags
    expect(batchArgs.memories[0].store_to_graph).toBe(true);
  });

  it("should use separate metadata keys avoiding collision", async () => {
    mockClient.mockMemory.query.mockResolvedValue({
      results: [
        {
          memory_id: "e1",
          content: { name: "Diana", type: "person", attributes: {} },
          scope: "agent",
          state: "active",
          created_at: "2026-01-01T00:00:00.000Z",
        },
      ],
      total: 1,
      filters: {},
    });

    const entityMw = new EntityMemoryMiddleware(mockClient.client, { scope: "agent" });
    await entityMw.onSessionStart(createSessionContext());

    const turnCtx = createTurnContext({
      metadata: {
        memories: [{ memory_id: "m1", content: "fact" }],
        custom_field: "should survive",
      },
    });

    await entityMw.onBeforeTurn(turnCtx);

    // All three keys should coexist
    expect(turnCtx.metadata?.memories).toBeDefined();
    expect(turnCtx.metadata?.entities).toBeDefined();
    expect(turnCtx.metadata?.custom_field).toBe("should survive");
  });
});
