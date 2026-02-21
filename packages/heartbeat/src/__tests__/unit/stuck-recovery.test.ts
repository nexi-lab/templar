import { describe, expect, it } from "vitest";
import { DEFAULT_STALE_THRESHOLD_MS } from "../../constants.js";
import { createStuckRecoveryEvaluator } from "../../evaluators/stuck-recovery.js";
import type { HeartbeatContext } from "../../types.js";

describe("createStuckRecoveryEvaluator", () => {
  it("should pass for fresh session", async () => {
    const evaluator = createStuckRecoveryEvaluator({
      action: "notify",
    });
    const result = await evaluator.evaluate({
      sessionId: "s-1",
      tickNumber: 1,
      lastActivityTimestamp: Date.now(),
      intervalMs: 300_000,
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.stale).toBe(false);
  });

  it("should detect stale session and trigger recovery", async () => {
    const evaluator = createStuckRecoveryEvaluator({
      staleThresholdMs: 1000,
      action: "summarize_and_restart",
    });

    const result = await evaluator.evaluate({
      sessionId: "s-1",
      tickNumber: 5,
      lastActivityTimestamp: Date.now() - 2000, // 2 seconds ago
      intervalMs: 300_000,
    });

    expect(result.passed).toBe(true);
    expect(result.metadata?.stale).toBe(true);
    expect(result.metadata?.action).toBe("summarize_and_restart");
    expect(result.metadata?.recovered).toBe(true);
  });

  it("should use default threshold when not specified", () => {
    const evaluator = createStuckRecoveryEvaluator({ action: "notify" });
    // Verify it uses default by testing a session just below threshold
    const context: HeartbeatContext = {
      sessionId: "s-1",
      tickNumber: 1,
      lastActivityTimestamp: Date.now() - (DEFAULT_STALE_THRESHOLD_MS - 500),
      intervalMs: 300_000,
    };

    // Should not be stale
    return evaluator.evaluate(context).then((result) => {
      expect(result.metadata?.stale).toBe(false);
    });
  });

  it("should pass on exact threshold boundary", async () => {
    const evaluator = createStuckRecoveryEvaluator({
      staleThresholdMs: 1000,
      action: "notify",
    });

    const result = await evaluator.evaluate({
      sessionId: "s-1",
      tickNumber: 1,
      lastActivityTimestamp: Date.now() - 1000,
      intervalMs: 300_000,
    });

    // At exact boundary, elapsed >= threshold, so stale
    expect(result.metadata?.stale).toBe(true);
  });

  it("should have recommended criticality", () => {
    const evaluator = createStuckRecoveryEvaluator({ action: "notify" });
    expect(evaluator.criticality).toBe("recommended");
  });
});
