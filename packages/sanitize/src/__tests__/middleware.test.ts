import type { TurnContext } from "@templar/core";
import { describe, expect, it } from "vitest";
import { createSanitizeMiddleware } from "../middleware.js";
import type { SanitizationRule, SanitizeResult } from "../types.js";

function makeTurnContext(input?: unknown): TurnContext {
  return {
    sessionId: "test-session",
    turnNumber: 1,
    input,
    metadata: {},
  };
}

describe("createSanitizeMiddleware", () => {
  it("returns a valid TemplarMiddleware", () => {
    const middleware = createSanitizeMiddleware();
    expect(middleware.name).toBe("@templar/sanitize");
    expect(typeof middleware.onBeforeTurn).toBe("function");
  });

  it("sanitizes string input in onBeforeTurn", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext("Hello <script>evil</script> world");
    await middleware.onBeforeTurn?.(context);
    expect(context.input).not.toContain("<script>");
  });

  it("attaches sanitizeResult to context.metadata", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext("Hello <script>evil</script> world");
    await middleware.onBeforeTurn?.(context);
    expect(context.metadata).toBeDefined();
    const result = (context.metadata as Record<string, unknown>).sanitizeResult as SanitizeResult;
    expect(result).toBeDefined();
    expect(result.original).toContain("<script>");
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("no-ops for non-string input", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext({ complex: "object" });
    await middleware.onBeforeTurn?.(context);
    expect(context.input).toEqual({ complex: "object" });
  });

  it("no-ops for undefined input", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext(undefined);
    await middleware.onBeforeTurn?.(context);
    expect(context.input).toBeUndefined();
  });

  it("no-ops for numeric input", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext(42);
    await middleware.onBeforeTurn?.(context);
    expect(context.input).toBe(42);
  });

  it("passes custom config through", async () => {
    const rule: SanitizationRule = {
      name: "custom",
      description: "Custom rule for test",
      test: () => [],
      strip: (c) => c.toUpperCase(),
    };
    const middleware = createSanitizeMiddleware({ rules: [rule] });
    const context = makeTurnContext("hello");
    await middleware.onBeforeTurn?.(context);
    expect(context.input).toBe("HELLO");
  });

  it("preserves existing metadata", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext("clean text");
    context.metadata = { existingKey: "existingValue" };
    await middleware.onBeforeTurn?.(context);
    expect((context.metadata as Record<string, unknown>).existingKey).toBe("existingValue");
    expect((context.metadata as Record<string, unknown>).sanitizeResult).toBeDefined();
  });

  it("handles clean input gracefully", async () => {
    const middleware = createSanitizeMiddleware();
    const context = makeTurnContext("Just a normal message");
    await middleware.onBeforeTurn?.(context);
    expect(context.input).toBe("Just a normal message");
    const result = (context.metadata as Record<string, unknown>).sanitizeResult as SanitizeResult;
    expect(result.safe).toBe(true);
  });
});
