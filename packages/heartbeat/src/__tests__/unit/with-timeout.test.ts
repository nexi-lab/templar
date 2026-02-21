import { HeartbeatEvaluatorTimeoutError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { withTimeout } from "../../with-timeout.js";

describe("withTimeout", () => {
  it("should resolve if promise completes within timeout", async () => {
    const result = await withTimeout(Promise.resolve(42), 1000, "test-eval");
    expect(result).toBe(42);
  });

  it("should throw HeartbeatEvaluatorTimeoutError on timeout", async () => {
    const slow = new Promise<never>((_resolve, _reject) => {
      globalThis.setTimeout(_resolve as () => void, 5000);
    });

    await expect(withTimeout(slow, 50, "slow-eval")).rejects.toThrow(
      HeartbeatEvaluatorTimeoutError,
    );
  });

  it("should include evaluator name and timeout in error", async () => {
    const slow = new Promise<never>(() => {}); // never resolves

    try {
      await withTimeout(slow, 50, "my-evaluator");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(HeartbeatEvaluatorTimeoutError);
      const err = error as HeartbeatEvaluatorTimeoutError;
      expect(err.evaluatorName).toBe("my-evaluator");
      expect(err.timeoutMs).toBe(50);
    }
  });

  it("should propagate original rejection", async () => {
    const failing = Promise.reject(new Error("boom"));

    await expect(withTimeout(failing, 1000, "fail-eval")).rejects.toThrow("boom");
  });
});
