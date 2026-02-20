import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SchemaGuard } from "../../guards/schema-guard.js";
import type { GuardContext } from "../../types.js";

function makeContext(response: unknown, metadata: Record<string, unknown> = {}): GuardContext {
  return {
    hook: "model",
    response,
    attempt: 1,
    previousIssues: [],
    metadata,
  };
}

describe("SchemaGuard", () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
  });

  it("passes when output matches schema", async () => {
    const guard = new SchemaGuard(schema);
    const ctx = makeContext({ content: JSON.stringify({ name: "Alice", age: 30 }) });

    const result = await guard.validate(ctx);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when output violates schema", async () => {
    const guard = new SchemaGuard(schema);
    const ctx = makeContext({ content: JSON.stringify({ name: 123, age: "old" }) });

    const result = await guard.validate(ctx);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.severity).toBe("error");
  });

  it("reports nested path correctly", async () => {
    const nestedSchema = z.object({
      user: z.object({
        profile: z.object({
          email: z.string().email(),
        }),
      }),
    });
    const guard = new SchemaGuard(nestedSchema);
    const ctx = makeContext({
      content: JSON.stringify({ user: { profile: { email: "not-an-email" } } }),
    });

    const result = await guard.validate(ctx);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.path).toEqual(["user", "profile", "email"]);
  });

  it("reports array indices in path", async () => {
    const arraySchema = z.object({
      items: z.array(z.object({ id: z.number() })),
    });
    const guard = new SchemaGuard(arraySchema);
    const ctx = makeContext({
      content: JSON.stringify({ items: [{ id: 1 }, { id: "bad" }] }),
    });

    const result = await guard.validate(ctx);
    expect(result.valid).toBe(false);
    const paths = result.issues.map((i) => i.path);
    expect(paths.some((p) => p.includes(1))).toBe(true);
  });

  it("supports per-request schema override via metadata", async () => {
    const defaultGuard = new SchemaGuard(z.object({ x: z.number() }));
    const overrideSchema = z.object({ y: z.string() });

    const ctx = makeContext(
      { content: JSON.stringify({ y: "hello" }) },
      { guardrailSchema: overrideSchema },
    );

    const result = await defaultGuard.validate(ctx);
    expect(result.valid).toBe(true);
  });

  it("handles non-JSON string content", async () => {
    const guard = new SchemaGuard(z.string());
    const ctx = makeContext({ content: "plain text" });

    const result = await guard.validate(ctx);
    expect(result.valid).toBe(true);
  });

  it("handles tool response output directly", async () => {
    const guard = new SchemaGuard(z.object({ result: z.string() }));
    const ctx = makeContext({ output: { result: "ok" } });

    const result = await guard.validate(ctx);
    expect(result.valid).toBe(true);
  });
});
