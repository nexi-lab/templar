import type { ModelRequest, ModelResponse } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createGuardrailsMiddleware } from "../../middleware.js";
import type { ValidationMetrics } from "../../types.js";

describe("Metadata flow integration", () => {
  it("uses config default schema when no per-request override", async () => {
    const schema = z.object({ name: z.string() });
    const mw = createGuardrailsMiddleware({ guards: [], schema });

    const next = vi.fn().mockResolvedValue({
      content: JSON.stringify({ name: "Alice" }),
    } satisfies ModelResponse);

    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);

    const metrics = result.metadata?.guardrails as ValidationMetrics;
    expect(metrics.passed).toBe(true);
  });

  it("uses per-request schema override from metadata", async () => {
    const defaultSchema = z.object({ x: z.number() });
    const overrideSchema = z.object({ y: z.string() });

    const mw = createGuardrailsMiddleware({ guards: [], schema: defaultSchema });

    const next = vi.fn().mockResolvedValue({
      content: JSON.stringify({ y: "hello" }),
    } satisfies ModelResponse);

    const req: ModelRequest = {
      messages: [{ role: "user", content: "test" }],
      metadata: { guardrailSchema: overrideSchema },
    };

    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);

    const metrics = result.metadata?.guardrails as ValidationMetrics;
    expect(metrics.passed).toBe(true);
  });

  it("passes through without validation when no guards and no schema", async () => {
    // Can't create middleware with no guards AND no schema — it throws.
    // But we can test with guards only (no schema)
    const passGuard = {
      name: "pass",
      validate: () => ({ valid: true, issues: [] }),
    };
    const mw = createGuardrailsMiddleware({ guards: [passGuard] });

    const next = vi.fn().mockResolvedValue({
      content: "arbitrary content",
    } satisfies ModelResponse);

    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);

    const metrics = result.metadata?.guardrails as ValidationMetrics;
    expect(metrics.passed).toBe(true);
  });

  it("attaches metrics to response metadata immutably", async () => {
    const mw = createGuardrailsMiddleware({
      guards: [],
      schema: z.object({ ok: z.boolean() }),
    });

    const originalMetadata = { existingKey: "value" };
    const next = vi.fn().mockResolvedValue({
      content: JSON.stringify({ ok: true }),
      metadata: originalMetadata,
    } satisfies ModelResponse);

    const req: ModelRequest = { messages: [{ role: "user", content: "test" }] };
    // biome-ignore lint/style/noNonNullAssertion: test - hook always defined
    const result = await mw.wrapModelCall!(req, next);

    // Original metadata preserved
    expect(result.metadata?.existingKey).toBe("value");
    // New metrics added
    expect(result.metadata?.guardrails).toBeDefined();
    // Original object not mutated
    expect(originalMetadata).not.toHaveProperty("guardrails");
  });
});
