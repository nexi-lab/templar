import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearReactions,
  createReactionProcessorEvaluator,
  enqueueReaction,
  getReactionQueueSize,
} from "../../evaluators/reaction-processor.js";
import type { HeartbeatContext } from "../../types.js";

const baseContext: HeartbeatContext = {
  sessionId: "s-1",
  tickNumber: 1,
  lastActivityTimestamp: Date.now(),
  intervalMs: 300_000,
};

describe("createReactionProcessorEvaluator", () => {
  afterEach(() => {
    clearReactions();
  });

  it("should process queued reactions", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const evaluator = createReactionProcessorEvaluator({
      handlers: { "event-1": handler },
    });

    enqueueReaction("event-1", { foo: "bar" });
    expect(getReactionQueueSize()).toBe(1);

    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.kind).toBe("action");
    expect(result.metadata?.processedCount).toBe(1);
    expect(handler).toHaveBeenCalledWith("event-1", { foo: "bar" });
    expect(getReactionQueueSize()).toBe(0);
  });

  it("should return passed=true when queue is empty", async () => {
    const evaluator = createReactionProcessorEvaluator({ handlers: {} });
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.metadata?.processedCount).toBe(0);
  });

  it("should report errors when handler throws", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("handler boom"));
    const evaluator = createReactionProcessorEvaluator({
      handlers: { "event-fail": handler },
    });

    enqueueReaction("event-fail");
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(false);
    expect(result.metadata?.errorCount).toBe(1);
  });

  it("should have optional criticality", () => {
    const evaluator = createReactionProcessorEvaluator({ handlers: {} });
    expect(evaluator.criticality).toBe("optional");
  });

  it("should skip reactions without matching handlers", async () => {
    const evaluator = createReactionProcessorEvaluator({ handlers: {} });

    enqueueReaction("unknown-event");
    const result = await evaluator.evaluate(baseContext);

    expect(result.passed).toBe(true);
    expect(result.metadata?.processedCount).toBe(0);
  });
});
