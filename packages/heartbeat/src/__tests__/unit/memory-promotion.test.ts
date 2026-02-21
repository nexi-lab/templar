import { describe, expect, it, vi } from "vitest";
import { createMemoryPromotionEvaluator } from "../../evaluators/memory-promotion.js";
import type { HeartbeatContext } from "../../types.js";

const baseContext: HeartbeatContext = {
  sessionId: "s-1",
  tickNumber: 1,
  lastActivityTimestamp: Date.now(),
  intervalMs: 300_000,
};

describe("createMemoryPromotionEvaluator", () => {
  it("should skip gracefully when no ACE available", async () => {
    const evaluator = createMemoryPromotionEvaluator();
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.metadata?.skipped).toBe(true);
    expect(result.metadata?.reason).toBe("no ACE resource available");
  });

  it("should skip when nexus client has no ace", async () => {
    const mockClient = {} as never;
    const evaluator = createMemoryPromotionEvaluator();
    const result = await evaluator.evaluate({
      ...baseContext,
      nexusClient: mockClient,
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.skipped).toBe(true);
  });

  it("should promote memories when ACE available", async () => {
    const mockClient = {
      ace: { trajectories: {} },
      memory: {
        query: vi.fn().mockResolvedValue([{ content: "memory 1" }, { content: "memory 2" }]),
        store: vi.fn().mockResolvedValue({}),
      },
    } as never;

    const evaluator = createMemoryPromotionEvaluator({ maxPromotionsPerTick: 5 });
    const result = await evaluator.evaluate({
      ...baseContext,
      nexusClient: mockClient,
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.promotedCount).toBe(2);
  });

  it("should handle memory query failure gracefully", async () => {
    const mockClient = {
      ace: {},
      memory: {
        query: vi.fn().mockRejectedValue(new Error("query failed")),
      },
    } as never;

    const evaluator = createMemoryPromotionEvaluator();
    const result = await evaluator.evaluate({
      ...baseContext,
      nexusClient: mockClient,
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.promotedCount).toBe(0);
  });

  it("should have optional criticality", () => {
    const evaluator = createMemoryPromotionEvaluator();
    expect(evaluator.criticality).toBe("optional");
  });
});
