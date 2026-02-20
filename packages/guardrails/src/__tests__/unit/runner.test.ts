import { describe, expect, it } from "vitest";
import { GuardRunner } from "../../runner.js";
import type { Guard, GuardContext, GuardResult } from "../../types.js";

function makeContext(): GuardContext {
  return {
    hook: "model",
    response: { content: "test" },
    attempt: 1,
    previousIssues: [],
    metadata: {},
  };
}

function makeGuard(name: string, result: GuardResult, delayMs = 0): Guard {
  return {
    name,
    validate:
      delayMs > 0
        ? () => new Promise<GuardResult>((resolve) => setTimeout(() => resolve(result), delayMs))
        : () => result,
  };
}

describe("GuardRunner", () => {
  describe("sequential execution", () => {
    it("runs guards in order", async () => {
      const order: string[] = [];
      const g1: Guard = {
        name: "first",
        validate: () => {
          order.push("first");
          return { valid: true, issues: [] };
        },
      };
      const g2: Guard = {
        name: "second",
        validate: () => {
          order.push("second");
          return { valid: true, issues: [] };
        },
      };

      const runner = new GuardRunner([g1, g2], "sequential", 5000);
      await runner.run(makeContext());

      expect(order).toEqual(["first", "second"]);
    });

    it("short-circuits on first error", async () => {
      const failGuard = makeGuard("fail", {
        valid: false,
        issues: [
          {
            guard: "fail",
            path: [],
            message: "failed",
            code: "ERR",
            severity: "error",
          },
        ],
      });
      const neverGuard: Guard = {
        name: "never",
        validate: () => {
          throw new Error("should not be called");
        },
      };

      const runner = new GuardRunner([failGuard, neverGuard], "sequential", 5000);
      const result = await runner.run(makeContext());

      expect(result.valid).toBe(false);
      expect(result.guardResults).toHaveLength(1);
    });

    it("continues past warnings", async () => {
      const warnGuard = makeGuard("warn", {
        valid: true,
        issues: [
          {
            guard: "warn",
            path: [],
            message: "warning",
            code: "WARN",
            severity: "warning",
          },
        ],
      });
      const passGuard = makeGuard("pass", { valid: true, issues: [] });

      const runner = new GuardRunner([warnGuard, passGuard], "sequential", 5000);
      const result = await runner.run(makeContext());

      expect(result.valid).toBe(true);
      expect(result.guardResults).toHaveLength(2);
      expect(result.issues).toHaveLength(1);
    });
  });

  describe("parallel execution", () => {
    it("runs guards concurrently", async () => {
      const start = performance.now();
      const g1 = makeGuard("slow1", { valid: true, issues: [] }, 50);
      const g2 = makeGuard("slow2", { valid: true, issues: [] }, 50);

      const runner = new GuardRunner([g1, g2], "parallel", 5000);
      await runner.run(makeContext());

      const elapsed = performance.now() - start;
      // Both should run in ~50ms, not ~100ms
      expect(elapsed).toBeLessThan(100);
    });

    it("aggregates all results (no short-circuit)", async () => {
      const fail1 = makeGuard("fail1", {
        valid: false,
        issues: [{ guard: "fail1", path: [], message: "f1", code: "E", severity: "error" }],
      });
      const fail2 = makeGuard("fail2", {
        valid: false,
        issues: [{ guard: "fail2", path: [], message: "f2", code: "E", severity: "error" }],
      });

      const runner = new GuardRunner([fail1, fail2], "parallel", 5000);
      const result = await runner.run(makeContext());

      expect(result.valid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.guardResults).toHaveLength(2);
    });
  });

  it("handles guard timeout", async () => {
    const hangingGuard: Guard = {
      name: "hanging",
      validate: () => new Promise(() => {}), // never resolves
    };

    const runner = new GuardRunner([hangingGuard], "sequential", 50);

    await expect(runner.run(makeContext())).rejects.toThrow("timed out");
  });

  it("handles empty guard array", async () => {
    const runner = new GuardRunner([], "sequential", 5000);
    const result = await runner.run(makeContext());

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.guardResults).toHaveLength(0);
  });
});
