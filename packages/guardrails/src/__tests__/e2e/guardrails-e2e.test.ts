import type {
  ModelHandler,
  ModelRequest,
  ModelResponse,
  ToolHandler,
  ToolRequest,
  ToolResponse,
  TurnContext,
} from "@templar/core";
import { GuardrailRetryExhaustedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCustomGuard } from "../../guards/custom-guard.js";
import { EvidenceGuard } from "../../guards/evidence-guard.js";
import { createGuardrailsMiddleware } from "../../middleware.js";
import type { ValidationMetrics } from "../../types.js";

describe("Guardrails E2E", () => {
  it("full session lifecycle with mock LLM", async () => {
    const schema = z.object({
      answer: z.string(),
      sources: z.array(z.string()).min(1),
      confidence: z.number().min(0).max(1),
    });

    const evidenceGuard = new EvidenceGuard({
      requiredFields: ["sources"],
      minEvidence: 1,
    });

    const mw = createGuardrailsMiddleware({
      guards: [evidenceGuard],
      schema,
      maxRetries: 2,
      validateModelCalls: true,
      validateToolCalls: true,
      validateTurns: true,
      onFailure: "retry",
    });

    // Simulate model call that succeeds on first try
    const modelNext: ModelHandler = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        answer: "The capital of France is Paris",
        sources: ["wikipedia.org/france"],
        confidence: 0.95,
      }),
    } satisfies ModelResponse);

    const modelReq: ModelRequest = {
      messages: [{ role: "user", content: "What is the capital of France?" }],
    };

    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const modelResult = await mw.wrapModelCall!(modelReq, modelNext);
    const modelMetrics = modelResult.metadata?.guardrails as ValidationMetrics;
    expect(modelMetrics.passed).toBe(true);
    expect(modelMetrics.hook).toBe("model");

    // Simulate tool call
    const toolSchema = z.object({ result: z.string() });
    const toolMw = createGuardrailsMiddleware({
      guards: [],
      schema: toolSchema,
      validateToolCalls: true,
    });

    const toolNext: ToolHandler = vi.fn().mockResolvedValue({
      output: { result: "search completed" },
    } satisfies ToolResponse);

    const toolReq: ToolRequest = { toolName: "web_search", input: { q: "France capital" } };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const toolResult = await toolMw.wrapToolCall!(toolReq, toolNext);
    const toolMetrics = toolResult.metadata?.guardrails as ValidationMetrics;
    expect(toolMetrics.passed).toBe(true);

    // Simulate turn validation
    const turnCtx: TurnContext = {
      sessionId: "session-1",
      turnNumber: 1,
      output: {
        answer: "Paris",
        sources: ["wiki"],
        confidence: 0.9,
      },
    };

    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    await mw.onAfterTurn!(turnCtx);
    const turnMetrics = turnCtx.metadata?.guardrails as ValidationMetrics;
    expect(turnMetrics.passed).toBe(true);
  });

  it("retry exhaustion scenario with progressive failures", async () => {
    const schema = z.object({
      status: z.literal("complete"),
      data: z.object({ count: z.number().int().positive() }),
    });

    const mw = createGuardrailsMiddleware({
      guards: [],
      schema,
      maxRetries: 2,
      onFailure: "retry",
    });

    // All attempts return invalid data
    const next: ModelHandler = vi
      .fn()
      .mockResolvedValueOnce({ content: JSON.stringify({ status: "partial" }) })
      .mockResolvedValueOnce({ content: JSON.stringify({ status: "complete", data: {} }) })
      .mockResolvedValueOnce({
        content: JSON.stringify({ status: "complete", data: { count: -1 } }),
      });

    const req: ModelRequest = { messages: [{ role: "user", content: "process data" }] };

    try {
      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      await mw.wrapModelCall!(req, next);
      expect.fail("Should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(GuardrailRetryExhaustedError);
      expect((err as GuardrailRetryExhaustedError).attempts).toBe(3);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  it("mixed validation modes across different hooks", async () => {
    const warnings: unknown[] = [];
    const modelSchema = z.object({ text: z.string() });
    const customGuard = createCustomGuard("length-check", (ctx) => {
      // In model hook, response is ModelResponse; in turn hook, it's raw output
      let text: string;
      if (ctx.hook === "model") {
        const resp = ctx.response as ModelResponse;
        const parsed = JSON.parse(resp.content) as { text: string };
        text = parsed.text;
      } else {
        const data = ctx.response as { text: string };
        text = data.text;
      }
      if (text.length < 10) {
        return {
          valid: true,
          issues: [
            {
              guard: "length-check",
              path: ["text"],
              message: "Response is very short",
              code: "SHORT",
              severity: "warning" as const,
            },
          ],
        };
      }
      return { valid: true, issues: [] };
    });

    const mw = createGuardrailsMiddleware({
      guards: [customGuard],
      schema: modelSchema,
      validateModelCalls: true,
      validateToolCalls: false,
      validateTurns: true,
      onFailure: "warn",
      onWarning: (issues) => warnings.push(...issues),
    });

    // Model call — should validate
    const modelNext: ModelHandler = vi.fn().mockResolvedValue({
      content: JSON.stringify({ text: "short" }),
    });
    const modelReq: ModelRequest = { messages: [{ role: "user", content: "test" }] };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const modelResult = await mw.wrapModelCall!(modelReq, modelNext);
    expect(modelResult.metadata?.guardrails).toBeDefined();

    // Tool call — should skip validation
    const toolNext: ToolHandler = vi.fn().mockResolvedValue({ output: "anything" });
    const toolReq: ToolRequest = { toolName: "test", input: {} };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const toolResult = await mw.wrapToolCall!(toolReq, toolNext);
    expect(toolResult.metadata?.guardrails).toBeUndefined();

    // Turn — should validate
    const turnCtx: TurnContext = {
      sessionId: "s1",
      turnNumber: 1,
      output: { text: "hi" },
    };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    await mw.onAfterTurn!(turnCtx);
    expect(turnCtx.metadata?.guardrails).toBeDefined();
  });
});
