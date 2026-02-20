import { describe, expect, it } from "vitest";
import { createCustomGuard } from "../../guards/custom-guard.js";
import type { GuardContext } from "../../types.js";

function makeContext(): GuardContext {
  return {
    hook: "model",
    response: { content: "test" },
    attempt: 1,
    previousIssues: [],
    metadata: {},
  };
}

describe("createCustomGuard", () => {
  it("wraps a synchronous validation function", () => {
    const guard = createCustomGuard("sync-guard", () => ({
      valid: true,
      issues: [],
    }));

    expect(guard.name).toBe("sync-guard");
    const result = guard.validate(makeContext());
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("wraps an async validation function", async () => {
    const guard = createCustomGuard("async-guard", async () => ({
      valid: false,
      issues: [
        {
          guard: "async-guard",
          path: [],
          message: "Custom validation failed",
          code: "CUSTOM",
          severity: "error" as const,
        },
      ],
    }));

    expect(guard.name).toBe("async-guard");
    const result = await guard.validate(makeContext());
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
  });
});
