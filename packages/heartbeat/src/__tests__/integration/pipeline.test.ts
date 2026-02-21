import { describe, expect, it, vi } from "vitest";
import { runPipeline } from "../../pipeline.js";
import type { Clock, EvalResult, HeartbeatContext, HeartbeatEvaluator } from "../../types.js";

function createFakeClock(): Clock {
  let time = 1000;
  return {
    now: () => time++,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
}

function createEvaluator(
  overrides: Partial<HeartbeatEvaluator> & { result?: Partial<EvalResult> } = {},
): HeartbeatEvaluator {
  const name = overrides.name ?? "test-eval";
  return {
    name,
    criticality: overrides.criticality ?? "optional",
    evaluate:
      overrides.evaluate ??
      vi.fn().mockResolvedValue({
        evaluator: name,
        kind: "check",
        passed: true,
        earlyExit: false,
        latencyMs: 1,
        ...overrides.result,
      }),
  };
}

const baseContext: HeartbeatContext = {
  sessionId: "s-1",
  tickNumber: 1,
  lastActivityTimestamp: 0,
  intervalMs: 300_000,
};

describe("runPipeline", () => {
  it("should execute evaluators sequentially", async () => {
    const order: string[] = [];
    const eval1 = createEvaluator({
      name: "first",
      evaluate: async () => {
        order.push("first");
        return { evaluator: "first", kind: "check", passed: true, earlyExit: false, latencyMs: 1 };
      },
    });
    const eval2 = createEvaluator({
      name: "second",
      evaluate: async () => {
        order.push("second");
        return { evaluator: "second", kind: "check", passed: true, earlyExit: false, latencyMs: 1 };
      },
    });

    await runPipeline(baseContext, {
      evaluators: [eval1, eval2],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(order).toEqual(["first", "second"]);
  });

  it("should stop on early-exit signal", async () => {
    const eval1 = createEvaluator({
      name: "early",
      result: { earlyExit: true, passed: true },
    });
    const eval2 = createEvaluator({ name: "skipped" });

    const result = await runPipeline(baseContext, {
      evaluators: [eval1, eval2],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.results.length).toBe(1);
    expect(result.results[0]?.evaluator).toBe("early");
  });

  it("should stop pipeline on required evaluator failure", async () => {
    const requiredFail = createEvaluator({
      name: "required-fail",
      criticality: "required",
      result: { passed: false },
    });
    const after = createEvaluator({ name: "after" });

    const result = await runPipeline(baseContext, {
      evaluators: [requiredFail, after],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.overallPassed).toBe(false);
    expect(result.stoppedEarly).toBe(true);
    expect(result.health).toBe("critical");
    expect(result.results.length).toBe(1);
  });

  it("should continue on recommended evaluator failure", async () => {
    const recommendedFail = createEvaluator({
      name: "rec-fail",
      criticality: "recommended",
      result: { passed: false },
    });
    const after = createEvaluator({ name: "after" });

    const result = await runPipeline(baseContext, {
      evaluators: [recommendedFail, after],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.overallPassed).toBe(true);
    expect(result.health).toBe("degraded");
    expect(result.results.length).toBe(2);
  });

  it("should continue on optional evaluator failure", async () => {
    const optionalFail = createEvaluator({
      name: "opt-fail",
      criticality: "optional",
      result: { passed: false },
    });
    const after = createEvaluator({ name: "after" });

    const result = await runPipeline(baseContext, {
      evaluators: [optionalFail, after],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.overallPassed).toBe(true);
    expect(result.health).toBe("healthy");
    expect(result.results.length).toBe(2);
  });

  it("should return healthy when all pass", async () => {
    const result = await runPipeline(baseContext, {
      evaluators: [createEvaluator({ name: "a" }), createEvaluator({ name: "b" })],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.health).toBe("healthy");
    expect(result.overallPassed).toBe(true);
  });

  it("should handle evaluator that throws", async () => {
    const throwing = createEvaluator({
      name: "thrower",
      criticality: "optional",
      evaluate: async () => {
        throw new Error("evaluator boom");
      },
    });

    const result = await runPipeline(baseContext, {
      evaluators: [throwing, createEvaluator({ name: "after" })],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.error).toContain("evaluator boom");
    // Optional failure doesn't stop pipeline
    expect(result.results.length).toBe(2);
  });

  it("should handle zero evaluators", async () => {
    const result = await runPipeline(baseContext, {
      evaluators: [],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.results).toEqual([]);
    expect(result.overallPassed).toBe(true);
    expect(result.health).toBe("healthy");
    expect(result.stoppedEarly).toBe(false);
  });

  it("should handle all evaluators signaling early-exit", async () => {
    const eval1 = createEvaluator({
      name: "exit-1",
      result: { earlyExit: true, passed: true },
    });
    const eval2 = createEvaluator({ name: "never-reached" });

    const result = await runPipeline(baseContext, {
      evaluators: [eval1, eval2],
      evaluatorTimeoutMs: 5000,
      clock: createFakeClock(),
    });

    expect(result.stoppedEarly).toBe(true);
    expect(result.results.length).toBe(1);
  });
});
