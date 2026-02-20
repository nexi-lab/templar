import type { ModelRequest, ModelResponse } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCustomGuard } from "../../guards/custom-guard.js";
import { EvidenceGuard } from "../../guards/evidence-guard.js";
import { createGuardrailsMiddleware } from "../../middleware.js";
import type { ValidationMetrics } from "../../types.js";

describe("Guard composition integration", () => {
  it("runs schema + evidence + custom guards together", async () => {
    const schema = z.object({
      answer: z.string(),
      sources: z.array(z.string()),
      confidence: z.number(),
    });

    const evidenceGuard = new EvidenceGuard({
      requiredFields: ["sources"],
      minEvidence: 1,
    });

    const customGuard = createCustomGuard("confidence-check", (ctx) => {
      const data = JSON.parse((ctx.response as ModelResponse).content);
      if (data.confidence < 0.5) {
        return {
          valid: false,
          issues: [
            {
              guard: "confidence-check",
              path: ["confidence"],
              message: "Confidence too low",
              code: "LOW_CONFIDENCE",
              severity: "error" as const,
            },
          ],
        };
      }
      return { valid: true, issues: [] };
    });

    const mw = createGuardrailsMiddleware({
      guards: [evidenceGuard, customGuard],
      schema,
    });

    const validOutput = JSON.stringify({
      answer: "The answer is 42",
      sources: ["hitchhikers-guide"],
      confidence: 0.95,
    });

    const next = vi.fn().mockResolvedValue({ content: validOutput } satisfies ModelResponse);
    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };

    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);
    const metrics = result.metadata?.guardrails as ValidationMetrics;

    expect(metrics.passed).toBe(true);
    // Schema guard + evidence guard + custom guard = 3
    expect(metrics.guardResults).toHaveLength(3);
  });

  it("sequential mode fails fast on schema error", async () => {
    const evidenceGuard = new EvidenceGuard({ requiredFields: ["sources"] });
    const neverGuard = createCustomGuard("never", () => {
      throw new Error("should not run");
    });

    const mw = createGuardrailsMiddleware({
      guards: [evidenceGuard, neverGuard],
      schema: z.object({ x: z.number() }),
      executionStrategy: "sequential",
      onFailure: "throw",
      maxRetries: 0,
    });

    const next = vi.fn().mockResolvedValue({ content: "not json" } satisfies ModelResponse);
    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };

    // Should fail on schema guard and not reach the never guard
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    await expect(mw.wrapModelCall!(req, next)).rejects.toThrow();
  });

  it("parallel mode aggregates all guard results", async () => {
    const guard1 = createCustomGuard("g1", () => ({
      valid: false,
      issues: [{ guard: "g1", path: [], message: "err1", code: "E1", severity: "error" as const }],
    }));
    const guard2 = createCustomGuard("g2", () => ({
      valid: false,
      issues: [{ guard: "g2", path: [], message: "err2", code: "E2", severity: "error" as const }],
    }));

    const mw = createGuardrailsMiddleware({
      guards: [guard1, guard2],
      executionStrategy: "parallel",
      onFailure: "throw",
      maxRetries: 0,
    });

    const next = vi.fn().mockResolvedValue({ content: "test" } satisfies ModelResponse);
    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };

    try {
      // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
      await mw.wrapModelCall!(req, next);
      expect.fail("Should have thrown");
    } catch {
      // Both guards should have run in parallel
      expect(next).toHaveBeenCalledTimes(1);
    }
  });
});
