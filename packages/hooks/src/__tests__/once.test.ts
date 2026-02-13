import { HookExecutionError, HookReentrancyError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { CONTINUE_RESULT, HOOK_PRIORITY } from "../constants.js";
import { HookRegistry } from "../registry.js";
import { makePostToolUseData, makePreToolUseData } from "./helpers.js";

describe("HookRegistry — once() interceptor", () => {
  it("fires once then is removed", async () => {
    const registry = new HookRegistry();
    let callCount = 0;

    registry.once("PreToolUse", () => {
      callCount++;
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    await registry.emit("PreToolUse", makePreToolUseData());

    expect(callCount).toBe(1);
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("disposer before fire prevents execution", async () => {
    const registry = new HookRegistry();
    let called = false;

    const dispose = registry.once("PreToolUse", () => {
      called = true;
      return CONTINUE_RESULT;
    });

    dispose();
    await registry.emit("PreToolUse", makePreToolUseData());

    expect(called).toBe(false);
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("coexists with on() handlers", async () => {
    const registry = new HookRegistry();
    const calls: string[] = [];

    registry.on("PreToolUse", () => {
      calls.push("persistent");
      return CONTINUE_RESULT;
    });
    registry.once("PreToolUse", () => {
      calls.push("once");
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(calls).toEqual(["persistent", "once"]);

    calls.length = 0;
    await registry.emit("PreToolUse", makePreToolUseData());
    expect(calls).toEqual(["persistent"]);
    expect(registry.handlerCount("PreToolUse")).toBe(1);
  });

  it("respects priority ordering", async () => {
    const registry = new HookRegistry();
    const order: string[] = [];

    registry.once(
      "PreToolUse",
      () => {
        order.push("once-low");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.LOW },
    );
    registry.once(
      "PreToolUse",
      () => {
        order.push("once-high");
        return CONTINUE_RESULT;
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(order).toEqual(["once-high", "once-low"]);
  });

  it("once + match: not consumed when match returns false", async () => {
    const registry = new HookRegistry();
    let callCount = 0;

    registry.once(
      "PreToolUse",
      () => {
        callCount++;
        return CONTINUE_RESULT;
      },
      { match: (data) => data.toolName === "target-tool" },
    );

    // First emit: match=false, handler not consumed
    await registry.emit("PreToolUse", makePreToolUseData({ toolName: "other-tool" }));
    expect(callCount).toBe(0);
    expect(registry.handlerCount("PreToolUse")).toBe(1);

    // Second emit: match=true, handler fires and is removed
    await registry.emit("PreToolUse", makePreToolUseData({ toolName: "target-tool" }));
    expect(callCount).toBe(1);
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("once + throw: handler is still removed", async () => {
    const registry = new HookRegistry();

    registry.once("PreToolUse", () => {
      throw new Error("boom");
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });

  it("multiple once handlers all fire and are removed", async () => {
    const registry = new HookRegistry();
    let count = 0;

    registry.once("PreToolUse", () => {
      count++;
      return CONTINUE_RESULT;
    });
    registry.once("PreToolUse", () => {
      count++;
      return CONTINUE_RESULT;
    });
    registry.once("PreToolUse", () => {
      count++;
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(count).toBe(3);
    expect(registry.handlerCount("PreToolUse")).toBe(0);
  });
});

describe("HookRegistry — once() observer", () => {
  it("fires once then is removed", async () => {
    const registry = new HookRegistry();
    let callCount = 0;

    registry.once("PostToolUse", () => {
      callCount++;
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    await registry.emit("PostToolUse", makePostToolUseData());

    expect(callCount).toBe(1);
    expect(registry.handlerCount("PostToolUse")).toBe(0);
  });

  it("once observer + throw: handler is still removed", async () => {
    const errors: Error[] = [];
    const registry = new HookRegistry({
      onObserverError: (_event, error) => {
        errors.push(error);
      },
    });

    registry.once("PostToolUse", () => {
      throw new Error("observer boom");
    });

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(errors).toHaveLength(1);
    expect(registry.handlerCount("PostToolUse")).toBe(0);

    // Second emit: handler gone, no error
    errors.length = 0;
    await registry.emit("PostToolUse", makePostToolUseData());
    expect(errors).toHaveLength(0);
  });

  it("once + match: not consumed when match returns false", async () => {
    const registry = new HookRegistry();
    let callCount = 0;

    registry.once(
      "PostToolUse",
      () => {
        callCount++;
      },
      { match: (data) => data.toolName === "target" },
    );

    await registry.emit("PostToolUse", makePostToolUseData({ toolName: "other" }));
    expect(callCount).toBe(0);
    expect(registry.handlerCount("PostToolUse")).toBe(1);

    await registry.emit("PostToolUse", makePostToolUseData({ toolName: "target" }));
    expect(callCount).toBe(1);
    expect(registry.handlerCount("PostToolUse")).toBe(0);
  });

  it("once observer + re-entrancy error: handler is still removed", async () => {
    const registry = new HookRegistry({ maxDepth: 1 });

    registry.once("PostToolUse", async () => {
      // Re-entrant emit at depth 2 exceeds maxDepth 1
      await registry.emit("PostToolUse", makePostToolUseData());
    });

    await expect(registry.emit("PostToolUse", makePostToolUseData())).rejects.toThrow(
      HookReentrancyError,
    );
    expect(registry.handlerCount("PostToolUse")).toBe(0);
  });
});
