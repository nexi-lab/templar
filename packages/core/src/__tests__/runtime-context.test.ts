import { describe, expect, it } from "vitest";
import {
  buildEnvVars,
  getContext,
  runWithContext,
  TEMPLAR_ENV_VARS,
  type TemplarRuntimeContext,
  tryGetContext,
} from "../runtime-context.js";

// ---------------------------------------------------------------------------
// Helper: create a full context with all 6 fields
// ---------------------------------------------------------------------------

function fullContext(overrides: Partial<TemplarRuntimeContext> = {}): TemplarRuntimeContext {
  return {
    sessionId: "sess-001",
    agentId: "agent-001",
    userId: "user-001",
    channelType: "telegram",
    zoneId: "zone-alpha",
    nodeId: "node-001",
    ...overrides,
  };
}

// ===========================================================================
// 1. getContext() / tryGetContext() accessor contract
// ===========================================================================

describe("getContext()", () => {
  it("throws when called outside an active session", () => {
    expect(() => getContext()).toThrow("outside an active session");
  });

  it("error message includes helpful guidance", () => {
    expect(() => getContext()).toThrow("runWithContext");
  });

  it("returns the context when inside runWithContext()", () => {
    const ctx = fullContext();
    runWithContext(ctx, () => {
      const result = getContext();
      expect(result.sessionId).toBe("sess-001");
      expect(result.userId).toBe("user-001");
      expect(result.agentId).toBe("agent-001");
      expect(result.channelType).toBe("telegram");
      expect(result.zoneId).toBe("zone-alpha");
      expect(result.nodeId).toBe("node-001");
    });
  });

  it("returns a frozen context (top-level properties cannot be reassigned)", () => {
    const ctx = fullContext();
    runWithContext(ctx, () => {
      const result = getContext();
      expect(Object.isFrozen(result)).toBe(true);
      expect(() => {
        (result as unknown as Record<string, unknown>).sessionId = "hacked";
      }).toThrow();
    });
  });

  it("context with metadata is still accessible", () => {
    const ctx = fullContext({ metadata: { role: "admin" } });
    runWithContext(ctx, () => {
      const result = getContext();
      expect(result.metadata).toEqual({ role: "admin" });
    });
  });
});

describe("tryGetContext()", () => {
  it("returns undefined when called outside an active session", () => {
    expect(tryGetContext()).toBeUndefined();
  });

  it("returns the context when inside runWithContext()", () => {
    const ctx = fullContext();
    runWithContext(ctx, () => {
      const result = tryGetContext();
      expect(result).toBeDefined();
      expect(result?.sessionId).toBe("sess-001");
    });
  });
});

// ===========================================================================
// 2. buildEnvVars() — table-driven exhaustive tests
// ===========================================================================

describe("buildEnvVars()", () => {
  const testCases: Array<{
    name: string;
    input: TemplarRuntimeContext;
    expected: Record<string, string>;
  }> = [
    {
      name: "all 6 fields set",
      input: fullContext(),
      expected: {
        TEMPLAR_SESSION_ID: "sess-001",
        TEMPLAR_USER_ID: "user-001",
        TEMPLAR_AGENT_ID: "agent-001",
        TEMPLAR_CHANNEL: "telegram",
        TEMPLAR_ZONE_ID: "zone-alpha",
        TEMPLAR_NODE_ID: "node-001",
      },
    },
    {
      name: "only sessionId (all optional undefined)",
      input: { sessionId: "sess-002" },
      expected: {
        TEMPLAR_SESSION_ID: "sess-002",
      },
    },
    {
      name: "userId is undefined — TEMPLAR_USER_ID omitted",
      input: { sessionId: "sess-003", agentId: "agent-003" },
      expected: {
        TEMPLAR_SESSION_ID: "sess-003",
        TEMPLAR_AGENT_ID: "agent-003",
      },
    },
    {
      name: "userId is empty string — TEMPLAR_USER_ID omitted",
      input: { sessionId: "sess-004", userId: "" },
      expected: {
        TEMPLAR_SESSION_ID: "sess-004",
      },
    },
    {
      name: "channelType + nodeId set, others undefined",
      input: { sessionId: "sess-005", channelType: "slack", nodeId: "node-005" },
      expected: {
        TEMPLAR_SESSION_ID: "sess-005",
        TEMPLAR_CHANNEL: "slack",
        TEMPLAR_NODE_ID: "node-005",
      },
    },
    {
      name: "zoneId set alone",
      input: { sessionId: "sess-006", zoneId: "zone-beta" },
      expected: {
        TEMPLAR_SESSION_ID: "sess-006",
        TEMPLAR_ZONE_ID: "zone-beta",
      },
    },
    {
      name: "all fields + metadata — metadata NOT leaked to env vars",
      input: fullContext({ metadata: { secret: "should-not-appear" } }),
      expected: {
        TEMPLAR_SESSION_ID: "sess-001",
        TEMPLAR_USER_ID: "user-001",
        TEMPLAR_AGENT_ID: "agent-001",
        TEMPLAR_CHANNEL: "telegram",
        TEMPLAR_ZONE_ID: "zone-alpha",
        TEMPLAR_NODE_ID: "node-001",
      },
    },
    {
      name: "mixed: some empty strings, some undefined",
      input: { sessionId: "sess-007", userId: "", channelType: "discord" },
      expected: {
        TEMPLAR_SESSION_ID: "sess-007",
        TEMPLAR_CHANNEL: "discord",
      },
    },
  ];

  for (const { name, input, expected } of testCases) {
    it(name, () => {
      const result = buildEnvVars(input);
      expect(result).toEqual(expected);
    });
  }

  it("returns exactly the TEMPLAR_* prefixed keys (no extras)", () => {
    const result = buildEnvVars(fullContext({ metadata: { extra: "val" } }));
    for (const key of Object.keys(result)) {
      expect(key).toMatch(/^TEMPLAR_/);
    }
  });

  it("strips null bytes and newlines from values", () => {
    const result = buildEnvVars({
      sessionId: "sess\0-injected",
      userId: "user\n-newline\r-cr",
    });
    expect(result.TEMPLAR_SESSION_ID).toBe("sess-injected");
    expect(result.TEMPLAR_USER_ID).toBe("user-newline-cr");
  });

  it("truncates values exceeding 1024 characters", () => {
    const longValue = "x".repeat(2000);
    const result = buildEnvVars({ sessionId: longValue });
    expect(result.TEMPLAR_SESSION_ID).toHaveLength(1024);
  });
});

// ===========================================================================
// 3. Concurrency isolation tests
// ===========================================================================

describe("concurrency isolation", () => {
  it("two parallel runWithContext() calls each see their own context", async () => {
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) => {
        runWithContext({ sessionId: "session-A", userId: "user-A" }, () => {
          // Simulate async work
          setTimeout(() => {
            results.push(getContext().userId ?? "missing");
            resolve();
          }, 10);
        });
      }),
      new Promise<void>((resolve) => {
        runWithContext({ sessionId: "session-B", userId: "user-B" }, () => {
          setTimeout(() => {
            results.push(getContext().userId ?? "missing");
            resolve();
          }, 5);
        });
      }),
    ]);

    // Both should see their own userId, not the other's
    expect(results).toContain("user-A");
    expect(results).toContain("user-B");
    expect(results).toHaveLength(2);
  });

  it("nested await within runWithContext preserves context", async () => {
    const result = await runWithContext(
      { sessionId: "sess-nested", userId: "user-nested" },
      async () => {
        // Multiple await hops
        await Promise.resolve();
        const first = getContext().userId;
        await new Promise((r) => setTimeout(r, 5));
        const second = getContext().userId;
        return { first, second };
      },
    );

    expect(result.first).toBe("user-nested");
    expect(result.second).toBe("user-nested");
  });

  it("tryGetContext() returns undefined after runWithContext() completes", () => {
    runWithContext({ sessionId: "sess-done" }, () => {
      expect(tryGetContext()).toBeDefined();
    });

    // Outside the scope
    expect(tryGetContext()).toBeUndefined();
  });

  it("cleans up context when fn throws synchronously", () => {
    expect(() =>
      runWithContext({ sessionId: "sess-throw" }, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");

    expect(tryGetContext()).toBeUndefined();
  });

  it("metadata is deeply frozen inside runWithContext", () => {
    const ctx = fullContext({ metadata: { role: "admin" } });
    runWithContext(ctx, () => {
      const result = getContext();
      expect(Object.isFrozen(result.metadata)).toBe(true);
      expect(() => {
        (result.metadata as Record<string, unknown>).role = "hacked";
      }).toThrow();
    });
  });

  it("context with spawnDepth (subagent scenario) propagates correctly", () => {
    const parentCtx = fullContext({ metadata: { spawnDepth: 0 } });
    runWithContext(parentCtx, () => {
      const parent = getContext();
      expect(parent.metadata?.spawnDepth).toBe(0);

      // Simulate nested subagent with its own context
      const childCtx: TemplarRuntimeContext = {
        ...parent,
        sessionId: "sess-child",
        metadata: { ...parent.metadata, spawnDepth: 1 },
      };
      runWithContext(childCtx, () => {
        const child = getContext();
        expect(child.sessionId).toBe("sess-child");
        expect(child.metadata?.spawnDepth).toBe(1);
        // Parent context fields inherited
        expect(child.userId).toBe("user-001");
      });

      // Back in parent scope
      expect(getContext().sessionId).toBe("sess-001");
    });
  });
});

// ===========================================================================
// 4. TEMPLAR_ENV_VARS const correctness
// ===========================================================================

describe("TEMPLAR_ENV_VARS", () => {
  it("has exactly 6 entries", () => {
    expect(Object.keys(TEMPLAR_ENV_VARS)).toHaveLength(6);
  });

  it("all values are TEMPLAR_ prefixed", () => {
    for (const value of Object.values(TEMPLAR_ENV_VARS)) {
      expect(value).toMatch(/^TEMPLAR_/);
    }
  });

  it("values match expected names", () => {
    expect(TEMPLAR_ENV_VARS.USER_ID).toBe("TEMPLAR_USER_ID");
    expect(TEMPLAR_ENV_VARS.AGENT_ID).toBe("TEMPLAR_AGENT_ID");
    expect(TEMPLAR_ENV_VARS.SESSION_ID).toBe("TEMPLAR_SESSION_ID");
    expect(TEMPLAR_ENV_VARS.CHANNEL).toBe("TEMPLAR_CHANNEL");
    expect(TEMPLAR_ENV_VARS.ZONE_ID).toBe("TEMPLAR_ZONE_ID");
    expect(TEMPLAR_ENV_VARS.NODE_ID).toBe("TEMPLAR_NODE_ID");
  });
});
