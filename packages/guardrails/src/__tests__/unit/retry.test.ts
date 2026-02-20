import { GuardrailRetryExhaustedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { buildFeedbackMessage, RetryExecutor } from "../../retry.js";
import type { AggregatedGuardResult, GuardIssue } from "../../types.js";

const validResult: AggregatedGuardResult = {
  valid: true,
  issues: [],
  guardResults: [{ guard: "test", durationMs: 1, valid: true }],
};

const invalidResult: AggregatedGuardResult = {
  valid: false,
  issues: [
    {
      guard: "test",
      path: ["field"],
      message: "invalid",
      code: "ERR",
      severity: "error",
    },
  ],
  guardResults: [{ guard: "test", durationMs: 1, valid: false }],
};

describe("RetryExecutor", () => {
  it("returns immediately when first attempt succeeds", async () => {
    const executor = new RetryExecutor({ maxRetries: 2, onFailure: "retry" });
    const next = vi.fn().mockResolvedValue("response");
    const validate = vi.fn().mockResolvedValue(validResult);

    const { response, metrics } = await executor.execute("req", next, validate, (r) => r, "model");

    expect(response).toBe("response");
    expect(metrics.totalAttempts).toBe(1);
    expect(metrics.passed).toBe(true);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("succeeds on second attempt after retry", async () => {
    const executor = new RetryExecutor({ maxRetries: 2, onFailure: "retry" });
    const next = vi.fn().mockResolvedValueOnce("bad").mockResolvedValueOnce("good");
    const validate = vi
      .fn()
      .mockResolvedValueOnce(invalidResult)
      .mockResolvedValueOnce(validResult);
    const feedback = vi.fn().mockReturnValue("req-with-feedback");

    const { response, metrics } = await executor.execute("req", next, validate, feedback, "model");

    expect(response).toBe("good");
    expect(metrics.totalAttempts).toBe(2);
    expect(metrics.passed).toBe(true);
    expect(feedback).toHaveBeenCalledOnce();
  });

  it("throws GuardrailRetryExhaustedError after all retries", async () => {
    const executor = new RetryExecutor({ maxRetries: 1, onFailure: "retry" });
    const next = vi.fn().mockResolvedValue("bad");
    const validate = vi.fn().mockResolvedValue(invalidResult);

    await expect(executor.execute("req", next, validate, (r) => r, "model")).rejects.toBeInstanceOf(
      GuardrailRetryExhaustedError,
    );

    // 1 initial + 1 retry = 2 total
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("throws immediately with onFailure: throw", async () => {
    const executor = new RetryExecutor({ maxRetries: 2, onFailure: "throw" });
    const next = vi.fn().mockResolvedValue("bad");
    const validate = vi.fn().mockResolvedValue(invalidResult);

    await expect(executor.execute("req", next, validate, (r) => r, "model")).rejects.toBeInstanceOf(
      GuardrailRetryExhaustedError,
    );

    // Only one attempt with "throw" — no retries
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("calls onWarning and returns response with onFailure: warn", async () => {
    const onWarning = vi.fn();
    const executor = new RetryExecutor({ maxRetries: 0, onFailure: "warn", onWarning });
    const next = vi.fn().mockResolvedValue("response");
    const validate = vi.fn().mockResolvedValue(invalidResult);

    const { response, metrics } = await executor.execute("req", next, validate, (r) => r, "model");

    expect(onWarning).toHaveBeenCalledWith(invalidResult.issues);
    expect(metrics.passed).toBe(false);
    expect(response).toBe("response");
  });
});

describe("buildFeedbackMessage", () => {
  it("formats issues into feedback text", () => {
    const issues: GuardIssue[] = [
      {
        guard: "test",
        path: ["name"],
        message: "Expected string",
        code: "type",
        severity: "error",
      },
      { guard: "test", path: [], message: "Root error", code: "type", severity: "error" },
      { guard: "test", path: ["x"], message: "warn", code: "type", severity: "warning" },
    ];

    const msg = buildFeedbackMessage(issues);
    expect(msg).toContain("name: Expected string");
    expect(msg).toContain("(root): Root error");
    // Warnings are filtered out
    expect(msg).not.toContain("warn");
  });
});
