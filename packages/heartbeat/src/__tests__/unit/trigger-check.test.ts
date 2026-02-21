import { describe, expect, it, vi } from "vitest";
import { createTriggerCheckEvaluator } from "../../evaluators/trigger-check.js";
import type { HeartbeatContext } from "../../types.js";

const baseContext: HeartbeatContext = {
  sessionId: "s-1",
  tickNumber: 1,
  lastActivityTimestamp: Date.now(),
  intervalMs: 300_000,
};

describe("createTriggerCheckEvaluator", () => {
  it("should skip gracefully when no nexus client", async () => {
    const evaluator = createTriggerCheckEvaluator({
      sources: ["nexus.events"],
    });
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.earlyExit).toBe(false);
    expect(result.metadata?.skipped).toBe(true);
    expect(result.metadata?.reason).toBe("no nexus client");
  });

  it("should check sources when nexus client available", async () => {
    const mockNexusClient = {
      eventLog: { write: vi.fn().mockResolvedValue({ event_id: "e-1" }) },
    } as never;

    const evaluator = createTriggerCheckEvaluator({
      sources: ["nexus.events"],
    });
    const result = await evaluator.evaluate({
      ...baseContext,
      nexusClient: mockNexusClient,
    });

    expect(result.passed).toBe(true);
    expect(result.evaluator).toBe("trigger-check");
    expect(result.metadata?.sources).toEqual(["nexus.events"]);
    expect(result.metadata?.checkedCount).toBe(1);
  });

  it("should have recommended criticality", () => {
    const evaluator = createTriggerCheckEvaluator({ sources: [] });
    expect(evaluator.criticality).toBe("recommended");
  });

  it("should handle nexus call failure gracefully", async () => {
    const mockNexusClient = {
      eventLog: { write: vi.fn().mockRejectedValue(new Error("network error")) },
    } as never;

    const evaluator = createTriggerCheckEvaluator({
      sources: ["nexus.events"],
    });
    const result = await evaluator.evaluate({
      ...baseContext,
      nexusClient: mockNexusClient,
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.checkedCount).toBe(0);
  });
});
