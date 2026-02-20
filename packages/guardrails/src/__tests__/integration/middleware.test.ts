import type {
  ModelRequest,
  ModelResponse,
  ToolRequest,
  ToolResponse,
  TurnContext,
} from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGuardrailsMiddleware } from "../../middleware.js";
import type { ValidationMetrics } from "../../types.js";

function makeModelReq(_content: string, metadata?: Record<string, unknown>): ModelRequest {
  return {
    messages: [{ role: "user", content: "test" }],
    ...(metadata ? { metadata } : {}),
  };
}

function makeModelRes(content: string, metadata?: Record<string, unknown>): ModelResponse {
  return {
    content,
    ...(metadata ? { metadata } : {}),
  };
}

describe("GuardrailsMiddleware integration", () => {
  const schema = z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
  });

  describe("wrapModelCall", () => {
    it("validates model output and attaches metrics", async () => {
      const mw = createGuardrailsMiddleware({ guards: [], schema });
      const validOutput = JSON.stringify({ answer: "hello", confidence: 0.9 });
      const next = vi.fn().mockResolvedValue(makeModelRes(validOutput));

      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      const result = await mw.wrapModelCall!(makeModelReq("test"), next);

      expect(result.content).toBe(validOutput);
      const metrics = result.metadata?.guardrails as ValidationMetrics;
      expect(metrics).toBeDefined();
      expect(metrics.passed).toBe(true);
      expect(metrics.hook).toBe("model");
    });

    it("retries on validation failure with feedback", async () => {
      const mw = createGuardrailsMiddleware({
        guards: [],
        schema,
        maxRetries: 1,
      });

      const badOutput = JSON.stringify({ answer: 123 });
      const goodOutput = JSON.stringify({ answer: "hello", confidence: 0.9 });

      const next = vi
        .fn()
        .mockResolvedValueOnce(makeModelRes(badOutput))
        .mockResolvedValueOnce(makeModelRes(goodOutput));

      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      const result = await mw.wrapModelCall!(makeModelReq("test"), next);

      expect(next).toHaveBeenCalledTimes(2);
      // Second call should have feedback injected
      const secondCall = next.mock.calls[1]?.[0] as ModelRequest;
      expect(secondCall.messages.length).toBeGreaterThan(1);
      expect(secondCall.messages[secondCall.messages.length - 1]?.content).toContain(
        "failed validation",
      );

      const metrics = result.metadata?.guardrails as ValidationMetrics;
      expect(metrics.totalAttempts).toBe(2);
      expect(metrics.passed).toBe(true);
    });

    it("skips validation when validateModelCalls is false", async () => {
      const mw = createGuardrailsMiddleware({
        guards: [],
        schema,
        validateModelCalls: false,
      });
      const next = vi.fn().mockResolvedValue(makeModelRes("not json"));

      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      const result = await mw.wrapModelCall!(makeModelReq("test"), next);

      expect(result.content).toBe("not json");
      expect(result.metadata?.guardrails).toBeUndefined();
    });
  });

  describe("wrapToolCall", () => {
    it("validates tool output when enabled", async () => {
      const toolSchema = z.object({ result: z.string() });
      const mw = createGuardrailsMiddleware({
        guards: [],
        schema: toolSchema,
        validateToolCalls: true,
      });

      const toolReq: ToolRequest = { toolName: "search", input: { q: "test" } };
      const toolRes: ToolResponse = { output: { result: "found" } };
      const next = vi.fn().mockResolvedValue(toolRes);

      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      const result = await mw.wrapToolCall!(toolReq, next);

      const metrics = result.metadata?.guardrails as ValidationMetrics;
      expect(metrics).toBeDefined();
      expect(metrics.hook).toBe("tool");
      expect(metrics.passed).toBe(true);
    });
  });

  describe("onAfterTurn", () => {
    it("validates turn output when enabled", async () => {
      const turnSchema = z.object({ summary: z.string() });
      const mw = createGuardrailsMiddleware({
        guards: [],
        schema: turnSchema,
        validateTurns: true,
        onFailure: "warn",
        onWarning: vi.fn(),
      });

      const ctx: TurnContext = {
        sessionId: "s1",
        turnNumber: 1,
        output: { summary: "done" },
      };

      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      await mw.onAfterTurn!(ctx);

      const metrics = ctx.metadata?.guardrails as ValidationMetrics;
      expect(metrics).toBeDefined();
      expect(metrics.hook).toBe("turn");
    });

    it("throws on invalid turn output with onFailure: throw", async () => {
      const mw = createGuardrailsMiddleware({
        guards: [],
        schema: z.object({ required: z.string() }),
        validateTurns: true,
        onFailure: "throw",
      });

      const ctx: TurnContext = {
        sessionId: "s1",
        turnNumber: 1,
        output: { wrong: 123 },
      };

      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      await expect(mw.onAfterTurn!(ctx)).rejects.toThrow("Turn validation failed");
    });
  });
});
