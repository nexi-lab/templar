import { describe, expect, it } from "vitest";
import { CONTINUE_RESULT, HOOK_PRIORITY } from "../constants.js";
import { HookRegistry } from "../registry.js";
import type { InterceptorHandler, PreToolUseData } from "../types.js";
import { makePostToolUseData, makePreToolUseData } from "./helpers.js";

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe("HookRegistry — registration", () => {
  it("on() returns a disposer function", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;
    const dispose = registry.on("PreToolUse", handler);

    expect(typeof dispose).toBe("function");
    expect(registry.handlerCount("PreToolUse")).toBe(1);
  });

  it("disposer removes the handler", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;
    const dispose = registry.on("PreToolUse", handler);

    dispose();
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("calling disposer twice is idempotent", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;
    const dispose = registry.on("PreToolUse", handler);

    dispose();
    dispose(); // should not throw
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("off() removes the handler by reference", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;
    registry.on("PreToolUse", handler);

    registry.off("PreToolUse", handler);
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("off() with non-existent handler is a no-op", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;

    // should not throw
    registry.off("PreToolUse", handler);
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("same handler registered twice creates two entries", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;

    registry.on("PreToolUse", handler);
    registry.on("PreToolUse", handler);
    expect(registry.handlerCount("PreToolUse")).toBe(2);
  });

  it("handler with priority inserts in correct sorted position", () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    const handlerA: InterceptorHandler<PreToolUseData> = () => {
      order.push(1);
      return CONTINUE_RESULT;
    };
    const handlerB: InterceptorHandler<PreToolUseData> = () => {
      order.push(2);
      return CONTINUE_RESULT;
    };

    // Register B (low priority) first, then A (high priority)
    registry.on("PreToolUse", handlerB, { priority: HOOK_PRIORITY.LOW });
    registry.on("PreToolUse", handlerA, { priority: HOOK_PRIORITY.HIGH });

    return registry.emit("PreToolUse", makePreToolUseData()).then(() => {
      expect(order).toEqual([1, 2]); // HIGH (25) runs before LOW (200)
    });
  });

  it("off() removes only one entry when handler registered twice", () => {
    const registry = new HookRegistry();
    const handler: InterceptorHandler<PreToolUseData> = () => CONTINUE_RESULT;

    registry.on("PreToolUse", handler);
    registry.on("PreToolUse", handler);
    expect(registry.handlerCount("PreToolUse")).toBe(2);

    registry.off("PreToolUse", handler);
    expect(registry.handlerCount("PreToolUse")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Priority ordering
// ---------------------------------------------------------------------------

describe("HookRegistry — priority ordering", () => {
  it("lower priority number executes first", async () => {
    const registry = new HookRegistry();
    const order: string[] = [];

    registry.on(
      "PreToolUse",
      () => {
        order.push("critical");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.CRITICAL },
    );
    registry.on(
      "PreToolUse",
      () => {
        order.push("monitor");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.MONITOR },
    );
    registry.on(
      "PreToolUse",
      () => {
        order.push("normal");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.NORMAL },
    );

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(order).toEqual(["critical", "normal", "monitor"]);
  });

  it("same priority preserves insertion order (stable sort)", async () => {
    const registry = new HookRegistry();
    const order: string[] = [];

    registry.on("PreToolUse", () => {
      order.push("first");
      return CONTINUE_RESULT;
    });
    registry.on("PreToolUse", () => {
      order.push("second");
      return CONTINUE_RESULT;
    });
    registry.on("PreToolUse", () => {
      order.push("third");
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("default priority is NORMAL (100)", async () => {
    const registry = new HookRegistry();
    const order: string[] = [];

    // Register with explicit priority 25 (before default 100)
    registry.on(
      "PreToolUse",
      () => {
        order.push("high");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.HIGH },
    );
    // Register with default priority (should be 100)
    registry.on("PreToolUse", () => {
      order.push("default");
      return CONTINUE_RESULT;
    });
    // Register with explicit priority 200 (after default 100)
    registry.on(
      "PreToolUse",
      () => {
        order.push("low");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(order).toEqual(["high", "default", "low"]);
  });
});

// ---------------------------------------------------------------------------
// Emit — interceptor events
// ---------------------------------------------------------------------------

describe("HookRegistry — interceptor emit", () => {
  it("continue result passes through all handlers", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PreToolUse", () => {
      calls.push("a");
      return CONTINUE_RESULT;
    });
    registry.on("PreToolUse", () => {
      calls.push("b");
      return CONTINUE_RESULT;
    });

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "continue" });
    expect(calls).toEqual(["a", "b"]);
  });

  it("block result short-circuits remaining handlers", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PreToolUse", () => {
      calls.push("a");
      return { action: "block" as const, reason: "denied" };
    });
    registry.on("PreToolUse", () => {
      calls.push("b"); // should NOT be called
      return CONTINUE_RESULT;
    });

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "block", reason: "denied" });
    expect(calls).toEqual(["a"]);
  });

  it("block result includes reason string", async () => {
    const registry = new HookRegistry();

    registry.on("PreToolUse", () => ({
      action: "block" as const,
      reason: "tool not permitted",
    }));

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "block", reason: "tool not permitted" });
  });

  it("first block wins when multiple handlers would block", async () => {
    const registry = new HookRegistry();

    registry.on(
      "PreToolUse",
      () => ({
        action: "block" as const,
        reason: "first blocker",
      }),
      { priority: HOOK_PRIORITY.HIGH },
    );
    registry.on(
      "PreToolUse",
      () => ({
        action: "block" as const,
        reason: "second blocker",
      }),
      { priority: HOOK_PRIORITY.LOW },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "block", reason: "first blocker" });
  });

  it("async interceptor handlers are awaited in order", async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    registry.on("PreToolUse", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(1);
      return CONTINUE_RESULT;
    });
    registry.on("PreToolUse", async () => {
      order.push(2);
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(order).toEqual([1, 2]); // serial: first completes before second starts
  });
});

// ---------------------------------------------------------------------------
// Emit — observer events
// ---------------------------------------------------------------------------

describe("HookRegistry — observer emit", () => {
  it("all observer handlers are called", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PostToolUse", () => {
      calls.push("a");
    });
    registry.on("PostToolUse", () => {
      calls.push("b");
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(calls).toEqual(["a", "b"]);
  });

  it("observer emit returns void", async () => {
    const registry = new HookRegistry();

    registry.on("PostToolUse", () => {
      // no-op
    });

    const result = await registry.emit("PostToolUse", makePostToolUseData());
    expect(result).toBeUndefined();
  });

  it("async observer handlers are awaited in order", async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    registry.on("PostToolUse", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      order.push(1);
    });
    registry.on("PostToolUse", async () => {
      order.push(2);
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(order).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Clear and handlerCount
// ---------------------------------------------------------------------------

describe("HookRegistry — clear and handlerCount", () => {
  it("handlerCount returns 0 for unregistered events", () => {
    const registry = new HookRegistry();
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("handlerCount returns correct count", () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", () => CONTINUE_RESULT);
    registry.on("PreToolUse", () => CONTINUE_RESULT);
    expect(registry.handlerCount("PreToolUse")).toBe(2);
  });

  it("clear(event) removes all handlers for that event", () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", () => CONTINUE_RESULT);
    registry.on("PreToolUse", () => CONTINUE_RESULT);
    registry.on("PostToolUse", () => {});

    registry.clear("PreToolUse");
    expect(registry.handlerCount("PreToolUse")).toBe(0);
    expect(registry.handlerCount("PostToolUse")).toBe(1);
  });

  it("clear() with no args removes all handlers for all events", () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", () => CONTINUE_RESULT);
    registry.on("PostToolUse", () => {});

    registry.clear();
    expect(registry.handlerCount("PreToolUse")).toBe(0);
    expect(registry.handlerCount("PostToolUse")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Zero-handler fast path
// ---------------------------------------------------------------------------

describe("HookRegistry — zero handlers", () => {
  it("interceptor emit with no handlers returns CONTINUE_RESULT", async () => {
    const registry = new HookRegistry();
    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "continue" });
  });

  it("observer emit with no handlers returns void", async () => {
    const registry = new HookRegistry();
    const result = await registry.emit("PostToolUse", makePostToolUseData());
    expect(result).toBeUndefined();
  });
});
