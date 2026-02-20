import type { ModelRequest, ModelResponse } from "@templar/core";
import { GuardrailRetryExhaustedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGuardrailsMiddleware } from "../../middleware.js";
import type { ValidationMetrics } from "../../types.js";

describe("Retry flow integration", () => {
  const schema = z.object({
    answer: z.string(),
    score: z.number(),
  });

  it("injects error feedback into model messages across retries", async () => {
    const mw = createGuardrailsMiddleware({
      guards: [],
      schema,
      maxRetries: 2,
    });

    const next = vi
      .fn<(req: ModelRequest) => Promise<ModelResponse>>()
      .mockResolvedValueOnce({ content: JSON.stringify({ answer: 123 }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ answer: "ok", score: "bad" }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ answer: "ok", score: 0.9 }) });

    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);

    expect(next).toHaveBeenCalledTimes(3);

    // First retry should include feedback about first failure
    const call2 = next.mock.calls[1]?.[0] as ModelRequest;
    expect(call2.messages.length).toBe(2);
    expect(call2.messages[1]?.content).toContain("failed validation");

    // Second retry should include feedback about second failure
    const call3 = next.mock.calls[2]?.[0] as ModelRequest;
    expect(call3.messages.length).toBe(3);

    const metrics = result.metadata?.guardrails as ValidationMetrics;
    expect(metrics.totalAttempts).toBe(3);
    expect(metrics.passed).toBe(true);
  });

  it("preserves request metadata across retries", async () => {
    const mw = createGuardrailsMiddleware({
      guards: [],
      schema,
      maxRetries: 1,
    });

    const next = vi
      .fn<(req: ModelRequest) => Promise<ModelResponse>>()
      .mockResolvedValueOnce({ content: JSON.stringify({ wrong: true }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ answer: "ok", score: 1 }) });

    const req: ModelRequest = {
      messages: [{ role: "user", content: "test" }],
      metadata: { customKey: "preserved" },
    };

    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);

    // Metadata should be preserved in retry requests
    const retryReq = next.mock.calls[1]?.[0] as ModelRequest;
    expect(retryReq.metadata?.customKey).toBe("preserved");

    expect(result.metadata?.guardrails).toBeDefined();
  });

  it("exhaustion error includes attempt count and last issues", async () => {
    const mw = createGuardrailsMiddleware({
      guards: [],
      schema,
      maxRetries: 1,
    });

    const next = vi.fn().mockResolvedValue({ content: "not json at all" });
    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };

    try {
      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      await mw.wrapModelCall!(req, next);
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GuardrailRetryExhaustedError);
      const retryErr = err as GuardrailRetryExhaustedError;
      expect(retryErr.attempts).toBe(2);
      expect(retryErr.lastIssues.length).toBeGreaterThan(0);
    }
  });
});
