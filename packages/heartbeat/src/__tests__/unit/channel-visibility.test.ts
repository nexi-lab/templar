import { describe, expect, it } from "vitest";
import { createChannelVisibilityEvaluator } from "../../evaluators/channel-visibility.js";
import type { HeartbeatContext } from "../../types.js";

const baseContext: HeartbeatContext = {
  sessionId: "s-1",
  tickNumber: 1,
  lastActivityTimestamp: Date.now(),
  intervalMs: 300_000,
};

describe("createChannelVisibilityEvaluator", () => {
  it("should pass when active channels exist", async () => {
    const evaluator = createChannelVisibilityEvaluator({
      activeChannels: ["telegram", "discord"],
    });
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.earlyExit).toBe(false);
    expect(result.kind).toBe("check");
    expect(result.evaluator).toBe("channel-visibility");
    expect(result.metadata?.activeChannelCount).toBe(2);
  });

  it("should fail with earlyExit when no channels active", async () => {
    const evaluator = createChannelVisibilityEvaluator({
      activeChannels: [],
    });
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(false);
    expect(result.earlyExit).toBe(true);
  });

  it("should have required criticality", () => {
    const evaluator = createChannelVisibilityEvaluator({ activeChannels: [] });
    expect(evaluator.criticality).toBe("required");
  });

  it("should pass with single active channel", async () => {
    const evaluator = createChannelVisibilityEvaluator({
      activeChannels: ["slack"],
    });
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.earlyExit).toBe(false);
    expect(result.metadata?.activeChannelCount).toBe(1);
  });
});
