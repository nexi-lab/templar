import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusMemoryMiddleware } from "../middleware.js";
import type { NexusMemoryConfig } from "../types.js";

/**
 * Full lifecycle integration tests
 */

function sessionCtx(id = "session-1"): SessionContext {
  return { sessionId: id, agentId: "agent-1", userId: "user-1" };
}

function turnCtx(turnNumber: number, sessionId = "session-1"): TurnContext {
  return {
    sessionId,
    turnNumber,
    output: `Turn ${turnNumber} response with enough content for extraction to work.`,
  };
}

describe("Lifecycle integration tests", () => {
  let mock: ReturnType<typeof createMockNexusClient>;

  beforeEach(() => {
    mock = createMockNexusClient();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("should handle full lifecycle: start → 5 turns → end", async () => {
    mock.mockMemory.query.mockResolvedValue({
      results: [{ memory_id: "m1", content: "prior knowledge", scope: "agent", state: "active" }],
      total: 1,
      filters: {},
    });
    mock.mockMemory.batchStore.mockResolvedValue({ stored: 5, failed: 0, memory_ids: [] });
    mock.mockMemory.store.mockResolvedValue({ memory_id: "distill-1", status: "ok" });

    const config: NexusMemoryConfig = { scope: "agent", autoSaveInterval: 5 };
    const middleware = new NexusMemoryMiddleware(mock.client, config);

    // Session start
    await middleware.onSessionStart(sessionCtx());
    expect(mock.mockMemory.query).toHaveBeenCalledTimes(1);

    // 5 turns
    for (let i = 1; i <= 5; i++) {
      await middleware.onBeforeTurn(turnCtx(i));
      await middleware.onAfterTurn(turnCtx(i));
    }

    // Should have flushed once at turn 5
    expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(1);

    // Session end
    await middleware.onSessionEnd(sessionCtx());

    // Distillation stored
    expect(mock.mockMemory.store).toHaveBeenCalledTimes(1);
    expect(mock.mockMemory.store).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ type: "session_distillation", turn_count: 5 }),
      }),
    );
  });

  it("should handle full lifecycle: start → 12 turns → end", async () => {
    mock.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
    mock.mockMemory.batchStore.mockResolvedValue({ stored: 5, failed: 0, memory_ids: [] });
    mock.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

    const config: NexusMemoryConfig = { scope: "user", autoSaveInterval: 5 };
    const middleware = new NexusMemoryMiddleware(mock.client, config);

    await middleware.onSessionStart(sessionCtx());

    for (let i = 1; i <= 12; i++) {
      await middleware.onBeforeTurn(turnCtx(i));
      await middleware.onAfterTurn(turnCtx(i));
    }

    // Flushed at turn 5 and turn 10
    expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(2);

    await middleware.onSessionEnd(sessionCtx());

    // Remaining 2 turns flushed at end
    expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(3);
    // Distillation stored
    expect(mock.mockMemory.store).toHaveBeenCalledTimes(1);
  });

  it("should handle timeout on start → turns → end gracefully", async () => {
    // Query never resolves (timeout)
    mock.mockMemory.query.mockImplementation(() => new Promise(() => {}));
    mock.mockMemory.batchStore.mockResolvedValue({ stored: 3, failed: 0, memory_ids: [] });
    mock.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

    const config: NexusMemoryConfig = {
      scope: "agent",
      autoSaveInterval: 5,
      sessionStartTimeoutMs: 50,
    };
    const middleware = new NexusMemoryMiddleware(mock.client, config);

    // Start times out — should continue
    await middleware.onSessionStart(sessionCtx());

    // 3 turns should still work
    for (let i = 1; i <= 3; i++) {
      const tc = turnCtx(i);
      await middleware.onBeforeTurn(tc);
      // No memories should be injected
      expect(tc.metadata).toBeUndefined();
      await middleware.onAfterTurn(tc);
    }

    await middleware.onSessionEnd(sessionCtx());

    // Batch store should have been called for pending memories
    expect(mock.mockMemory.batchStore).toHaveBeenCalledTimes(1);
  });

  it("should handle errors on every API call without throwing", async () => {
    mock.mockMemory.query.mockRejectedValue(new Error("query failed"));
    mock.mockMemory.batchStore.mockRejectedValue(new Error("batch failed"));
    mock.mockMemory.store.mockRejectedValue(new Error("store failed"));

    const config: NexusMemoryConfig = { scope: "agent", autoSaveInterval: 2 };
    const middleware = new NexusMemoryMiddleware(mock.client, config);

    // Every step should succeed (graceful degradation)
    await expect(middleware.onSessionStart(sessionCtx())).resolves.toBeUndefined();

    for (let i = 1; i <= 4; i++) {
      await expect(middleware.onBeforeTurn(turnCtx(i))).resolves.toBeUndefined();
      await expect(middleware.onAfterTurn(turnCtx(i))).resolves.toBeUndefined();
    }

    await expect(middleware.onSessionEnd(sessionCtx())).resolves.toBeUndefined();
  });

  it("should work with every_turn injection strategy across multiple turns", async () => {
    let queryCount = 0;
    mock.mockMemory.query.mockImplementation(() => {
      queryCount++;
      return Promise.resolve({
        results: [
          {
            memory_id: `m${queryCount}`,
            content: `data ${queryCount}`,
            scope: "agent",
            state: "active",
          },
        ],
        total: 1,
        filters: {},
      });
    });
    mock.mockMemory.batchStore.mockResolvedValue({ stored: 3, failed: 0, memory_ids: [] });
    mock.mockMemory.store.mockResolvedValue({ memory_id: "d1", status: "ok" });

    const config: NexusMemoryConfig = {
      scope: "agent",
      injectionStrategy: "every_turn",
      autoSaveInterval: 3,
    };
    const middleware = new NexusMemoryMiddleware(mock.client, config);

    await middleware.onSessionStart(sessionCtx());
    expect(mock.mockMemory.query).toHaveBeenCalledTimes(1);

    for (let i = 1; i <= 3; i++) {
      const tc = turnCtx(i);
      await middleware.onBeforeTurn(tc);
      // Should have injected memories
      expect(tc.metadata).toHaveProperty("memories");
      await middleware.onAfterTurn(tc);
    }

    // 1 from start + 3 from before each turn = 4 total queries
    expect(mock.mockMemory.query).toHaveBeenCalledTimes(4);

    await middleware.onSessionEnd(sessionCtx());
  });
});
