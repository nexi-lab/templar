import {
  HookConfigurationError,
  HookExecutionError,
  HookReentrancyError,
  HookTimeoutError,
} from "@templar/errors";
import { describe, expect, it } from "vitest";
import { CONTINUE_RESULT, HOOK_PRIORITY } from "../constants.js";
import { HookRegistry } from "../registry.js";
import type { PostToolUseData, PreToolUseData } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePreToolUseData(overrides?: Partial<PreToolUseData>): PreToolUseData {
  return {
    toolName: "test-tool",
    args: { key: "value" },
    sessionId: "session-1",
    ...overrides,
  };
}

function makePostToolUseData(overrides?: Partial<PostToolUseData>): PostToolUseData {
  return {
    toolName: "test-tool",
    args: { key: "value" },
    result: "ok",
    durationMs: 100,
    sessionId: "session-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Configuration validation
// ---------------------------------------------------------------------------

describe("HookRegistry — configuration validation", () => {
  it("throws HookConfigurationError for maxDepth < 1", () => {
    expect(() => new HookRegistry({ maxDepth: 0 })).toThrow(HookConfigurationError);
  });

  it("throws HookConfigurationError for negative maxDepth", () => {
    expect(() => new HookRegistry({ maxDepth: -1 })).toThrow(HookConfigurationError);
  });

  it("throws HookConfigurationError for non-finite maxDepth", () => {
    expect(() => new HookRegistry({ maxDepth: Number.POSITIVE_INFINITY })).toThrow(
      HookConfigurationError,
    );
    expect(() => new HookRegistry({ maxDepth: Number.NaN })).toThrow(HookConfigurationError);
  });

  it("throws HookConfigurationError for defaultTimeout <= 0", () => {
    expect(() => new HookRegistry({ defaultTimeout: 0 })).toThrow(HookConfigurationError);
    expect(() => new HookRegistry({ defaultTimeout: -1 })).toThrow(HookConfigurationError);
  });

  it("throws HookConfigurationError for non-finite defaultTimeout", () => {
    expect(() => new HookRegistry({ defaultTimeout: Number.POSITIVE_INFINITY })).toThrow(
      HookConfigurationError,
    );
    expect(() => new HookRegistry({ defaultTimeout: Number.NaN })).toThrow(HookConfigurationError);
  });

  it("accepts valid configuration", () => {
    expect(() => new HookRegistry({ maxDepth: 1, defaultTimeout: 1 })).not.toThrow();
    expect(() => new HookRegistry({ maxDepth: 100, defaultTimeout: 60_000 })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Registration validation
// ---------------------------------------------------------------------------

describe("HookRegistry — registration validation", () => {
  it("throws HookConfigurationError for non-finite priority", () => {
    const registry = new HookRegistry();
    expect(() =>
      registry.on("PreToolUse", () => CONTINUE_RESULT, { priority: Number.NaN }),
    ).toThrow(HookConfigurationError);
    expect(() =>
      registry.on("PreToolUse", () => CONTINUE_RESULT, {
        priority: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(HookConfigurationError);
  });

  it("throws HookConfigurationError for non-positive timeout", () => {
    const registry = new HookRegistry();
    expect(() => registry.on("PreToolUse", () => CONTINUE_RESULT, { timeout: 0 })).toThrow(
      HookConfigurationError,
    );
    expect(() => registry.on("PreToolUse", () => CONTINUE_RESULT, { timeout: -1 })).toThrow(
      HookConfigurationError,
    );
  });

  it("throws HookConfigurationError for non-finite timeout", () => {
    const registry = new HookRegistry();
    expect(() =>
      registry.on("PreToolUse", () => CONTINUE_RESULT, {
        timeout: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(HookConfigurationError);
  });

  it("accepts valid options", () => {
    const registry = new HookRegistry();
    expect(() =>
      registry.on("PreToolUse", () => CONTINUE_RESULT, { priority: 0, timeout: 1 }),
    ).not.toThrow();
    expect(() =>
      registry.on("PreToolUse", () => CONTINUE_RESULT, { priority: -10, timeout: 100 }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Re-entrancy
// ---------------------------------------------------------------------------

describe("HookRegistry — re-entrancy", () => {
  it("depth-2 cascade succeeds", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PostToolUse", async (_data, _ctx) => {
      calls.push("post-tool");
      // Trigger another event from within a hook
      await registry.emit("SessionStart", {
        sessionId: "s1",
        agentId: "a1",
        userId: "u1",
      });
    });

    registry.on("SessionStart", () => {
      calls.push("session-start");
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toEqual(["post-tool", "session-start"]);
  });

  it("depth exceeding max throws HookReentrancyError", async () => {
    const registry = new HookRegistry({ maxDepth: 3 });

    // Create a recursive loop: PreToolUse -> PreToolUse -> PreToolUse -> ...
    registry.on("PreToolUse", async (data, _ctx) => {
      await registry.emit("PreToolUse", data);
      return CONTINUE_RESULT;
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookReentrancyError,
    );
  });

  it("depth resets after emit completes", async () => {
    const registry = new HookRegistry({ maxDepth: 2 });
    let callCount = 0;

    registry.on("PostToolUse", () => {
      callCount++;
    });

    // Two separate emits should both succeed (depth resets between them)
    await registry.emit("PostToolUse", makePostToolUseData());
    await registry.emit("PostToolUse", makePostToolUseData());
    expect(callCount).toBe(2);
  });

  it("shared depth counter across all events", async () => {
    const registry = new HookRegistry({ maxDepth: 3 });

    // A -> B -> C -> D (exceeds depth 3)
    registry.on("PreToolUse", async (_data) => {
      await registry.emit("PreModelCall", {
        model: "m",
        messages: [],
        config: {},
        sessionId: "s1",
      });
      return CONTINUE_RESULT;
    });

    registry.on("PreModelCall", async (_data) => {
      await registry.emit("PreMessage", {
        message: {},
        channelId: "c1",
        sessionId: "s1",
      });
      return CONTINUE_RESULT;
    });

    registry.on("PreMessage", async (_data) => {
      // This would be depth 4, exceeding maxDepth 3
      await registry.emit("PreToolUse", makePreToolUseData());
      return CONTINUE_RESULT;
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookReentrancyError,
    );
  });

  it("concurrent emits have independent depth tracking", async () => {
    const registry = new HookRegistry({ maxDepth: 2 });
    let completedCount = 0;

    registry.on("PostToolUse", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completedCount++;
    });

    // Both should succeed — AsyncLocalStorage provides independent depth per call chain
    await Promise.all([
      registry.emit("PostToolUse", makePostToolUseData()),
      registry.emit("PostToolUse", makePostToolUseData()),
    ]);
    expect(completedCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe("HookRegistry — timeout", () => {
  it("handler exceeding timeout throws HookTimeoutError for interceptor", async () => {
    const registry = new HookRegistry({ defaultTimeout: 50 });

    registry.on("PreToolUse", async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return CONTINUE_RESULT;
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookTimeoutError,
    );
  });

  it("handler completing before timeout succeeds", async () => {
    const registry = new HookRegistry({ defaultTimeout: 500 });

    registry.on("PreToolUse", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return CONTINUE_RESULT;
    });

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "continue" });
  });

  it("per-handler timeout override takes precedence", async () => {
    const registry = new HookRegistry({ defaultTimeout: 500 });

    registry.on(
      "PreToolUse",
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return CONTINUE_RESULT;
      },
      { timeout: 50 }, // much shorter than default
    );

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookTimeoutError,
    );
  });

  it("AbortSignal is passed to handler context", async () => {
    const registry = new HookRegistry({ defaultTimeout: 1000 });
    let receivedSignal: AbortSignal | undefined;

    registry.on("PreToolUse", (_data, ctx) => {
      receivedSignal = ctx.signal;
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("observer handler exceeding timeout is caught, remaining handlers run", async () => {
    const errors: Error[] = [];
    const registry = new HookRegistry({
      defaultTimeout: 50,
      onObserverError: (_event, error) => {
        errors.push(error);
      },
    });
    const calls: string[] = [];

    registry.on(
      "PostToolUse",
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        calls.push("slow"); // should not reach
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PostToolUse",
      () => {
        calls.push("fast");
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toContain("fast");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(HookTimeoutError);
  });
});

// ---------------------------------------------------------------------------
// Error isolation
// ---------------------------------------------------------------------------

describe("HookRegistry — error isolation", () => {
  it("Pre handler throws → treated as block with HookExecutionError", async () => {
    const registry = new HookRegistry();

    registry.on("PreToolUse", () => {
      throw new Error("handler crashed");
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
  });

  it("Pre handler rejects → treated as block with HookExecutionError", async () => {
    const registry = new HookRegistry();

    registry.on("PreToolUse", async () => {
      throw new Error("async handler crashed");
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
  });

  it("Pre handler throws → remaining Pre handlers skipped", async () => {
    const registry = new HookRegistry();
    let secondCalled = false;

    registry.on(
      "PreToolUse",
      () => {
        throw new Error("crash");
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PreToolUse",
      () => {
        secondCalled = true;
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow();
    expect(secondCalled).toBe(false);
  });

  it("Post handler throws → caught, remaining handlers still called", async () => {
    const errors: Error[] = [];
    const registry = new HookRegistry({
      onObserverError: (_event, error) => {
        errors.push(error);
      },
    });
    const calls: string[] = [];

    registry.on(
      "PostToolUse",
      () => {
        calls.push("before-crash");
        throw new Error("observer crash");
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PostToolUse",
      () => {
        calls.push("after-crash");
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    // Should NOT throw
    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toEqual(["before-crash", "after-crash"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("observer crash");
  });

  it("Post handler rejects → caught, remaining handlers still called", async () => {
    const errors: Error[] = [];
    const registry = new HookRegistry({
      onObserverError: (_event, error) => {
        errors.push(error);
      },
    });
    const calls: string[] = [];

    registry.on(
      "PostToolUse",
      async () => {
        throw new Error("async observer crash");
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PostToolUse",
      () => {
        calls.push("still-called");
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toEqual(["still-called"]);
    expect(errors).toHaveLength(1);
  });

  it("multiple Post handlers, one throws → others all complete", async () => {
    const errors: Error[] = [];
    const registry = new HookRegistry({
      onObserverError: (_event, error) => {
        errors.push(error);
      },
    });
    const calls: string[] = [];

    registry.on(
      "PostToolUse",
      () => {
        calls.push("a");
      },
      { priority: 10 },
    );
    registry.on(
      "PostToolUse",
      () => {
        calls.push("b");
        throw new Error("b crashed");
      },
      { priority: 20 },
    );
    registry.on(
      "PostToolUse",
      () => {
        calls.push("c");
      },
      { priority: 30 },
    );
    registry.on(
      "PostToolUse",
      () => {
        calls.push("d");
      },
      { priority: 40 },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toEqual(["a", "b", "c", "d"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("b crashed");
  });

  it("observer error without callback is silently swallowed", async () => {
    // No onObserverError provided — should not throw
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on(
      "PostToolUse",
      () => {
        throw new Error("silent crash");
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PostToolUse",
      () => {
        calls.push("still-runs");
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toEqual(["still-runs"]);
  });

  it("onObserverError receives event name and error", async () => {
    let receivedEvent: string | undefined;
    let receivedError: Error | undefined;
    const registry = new HookRegistry({
      onObserverError: (event, error) => {
        receivedEvent = event;
        receivedError = error;
      },
    });

    registry.on("PostToolUse", () => {
      throw new Error("specific error");
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(receivedEvent).toBe("PostToolUse");
    expect(receivedError?.message).toBe("specific error");
  });
});

// ---------------------------------------------------------------------------
// Concurrent emits & snapshot behavior
// ---------------------------------------------------------------------------

describe("HookRegistry — concurrent emits and snapshots", () => {
  it("two concurrent emit() calls both complete independently", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PostToolUse", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      calls.push("a");
    });

    // Launch two emits concurrently
    const [_r1, _r2] = await Promise.all([
      registry.emit("PostToolUse", makePostToolUseData()),
      registry.emit("PostToolUse", makePostToolUseData()),
    ]);

    expect(calls).toHaveLength(2);
  });

  it("handler registered during emit not included in current emit", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PostToolUse", () => {
      calls.push("original");
      // Register new handler during emit
      registry.on("PostToolUse", () => {
        calls.push("dynamic");
      });
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    // The dynamic handler should NOT be called in this emit
    expect(calls).toEqual(["original"]);

    // But it should be called in the next emit
    calls.length = 0;
    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toContain("dynamic");
  });

  it("handler removed during emit still runs in current emit (snapshot)", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];
    let dispose: (() => void) | undefined;

    registry.on(
      "PostToolUse",
      () => {
        calls.push("first");
        // Remove the second handler
        dispose?.();
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    dispose = registry.on(
      "PostToolUse",
      () => {
        calls.push("second");
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    // Second handler should still run because emit snapshots the handler list
    expect(calls).toEqual(["first", "second"]);
  });

  it("100 handlers execute in correct priority order", async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    // Register 100 handlers with shuffled priorities
    const priorities = Array.from({ length: 100 }, (_, i) => i);
    // Fisher-Yates shuffle
    for (let i = priorities.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = priorities[i];
      priorities[i] = priorities[j] as number;
      priorities[j] = temp as number;
    }

    for (const p of priorities) {
      registry.on(
        "PostToolUse",
        () => {
          order.push(p);
        },
        { priority: p },
      );
    }

    await registry.emit("PostToolUse", makePostToolUseData());
    // Should be sorted ascending
    const sorted = [...order].sort((a, b) => a - b);
    expect(order).toEqual(sorted);
  });
});

// ---------------------------------------------------------------------------
// CONTINUE_RESULT immutability
// ---------------------------------------------------------------------------

describe("CONTINUE_RESULT", () => {
  it("is frozen and cannot be mutated", () => {
    expect(Object.isFrozen(CONTINUE_RESULT)).toBe(true);
  });
});
