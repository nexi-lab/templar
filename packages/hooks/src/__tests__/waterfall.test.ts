import { describe, expect, it } from "vitest";
import { CONTINUE_RESULT, HOOK_PRIORITY } from "../constants.js";
import { HookRegistry } from "../registry.js";
import { makePreToolUseData } from "./helpers.js";

// ---------------------------------------------------------------------------
// Waterfall modify chain
// ---------------------------------------------------------------------------

describe("HookRegistry — waterfall modify chain", () => {
  it("single modify hook transforms the data", async () => {
    const registry = new HookRegistry();

    registry.on("PreToolUse", (data) => ({
      action: "modify" as const,
      data: { ...data, toolName: "modified-tool" },
    }));

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({ toolName: "modified-tool" }),
    });
  });

  it("two modify hooks both apply in priority order", async () => {
    const registry = new HookRegistry();

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: `${data.toolName}-first` },
      }),
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: `${data.toolName}-second` },
      }),
      { priority: HOOK_PRIORITY.LOW },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({ toolName: "test-tool-first-second" }),
    });
  });

  it("modify then block — block receives modified data", async () => {
    const registry = new HookRegistry();
    let blockReceivedData: unknown;

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: "modified" },
      }),
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PreToolUse",
      (data) => {
        blockReceivedData = data;
        return { action: "block" as const, reason: "blocked" };
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "block", reason: "blocked" });
    expect((blockReceivedData as { toolName: string }).toolName).toBe("modified");
  });

  it("block then modify — second hook never runs (short-circuit)", async () => {
    const registry = new HookRegistry();
    let secondCalled = false;

    registry.on("PreToolUse", () => ({ action: "block" as const, reason: "stopped" }), {
      priority: HOOK_PRIORITY.HIGH,
    });

    registry.on(
      "PreToolUse",
      (data) => {
        secondCalled = true;
        return { action: "modify" as const, data: { ...data, toolName: "never" } };
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(secondCalled).toBe(false);
  });

  it("continue in middle of chain does not transform data", async () => {
    const registry = new HookRegistry();

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: "first-mod" },
      }),
      { priority: HOOK_PRIORITY.HIGH },
    );

    // Middle handler returns continue — data passes through unchanged
    registry.on("PreToolUse", () => CONTINUE_RESULT, { priority: HOOK_PRIORITY.NORMAL });

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: `${data.toolName}-third-mod` },
      }),
      { priority: HOOK_PRIORITY.LOW },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({ toolName: "first-mod-third-mod" }),
    });
  });

  it("three hooks: modify, continue, modify — cumulative result", async () => {
    const registry = new HookRegistry();

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, args: { ...data.args, added1: true } },
      }),
      { priority: 10 },
    );

    registry.on("PreToolUse", () => CONTINUE_RESULT, { priority: 50 });

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, args: { ...data.args, added2: true } },
      }),
      { priority: 90 },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({
        args: { key: "value", added1: true, added2: true },
      }),
    });
  });

  it("empty handler list returns continue result with original data", async () => {
    const registry = new HookRegistry();
    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "continue" });
  });

  it("async modify hooks maintain serial waterfall ordering", async () => {
    const registry = new HookRegistry();
    const order: number[] = [];

    registry.on(
      "PreToolUse",
      async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 15));
        order.push(1);
        return { action: "modify" as const, data: { ...data, toolName: "async-1" } };
      },
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on(
      "PreToolUse",
      async (data) => {
        order.push(2);
        return {
          action: "modify" as const,
          data: { ...data, toolName: `${data.toolName}-async-2` },
        };
      },
      { priority: HOOK_PRIORITY.LOW },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(order).toEqual([1, 2]);
    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({ toolName: "async-1-async-2" }),
    });
  });

  it("modify on BudgetExhausted flows through waterfall", async () => {
    const registry = new HookRegistry();

    registry.on("BudgetExhausted", (data) => ({
      action: "modify" as const,
      data: { ...data, remaining: 0 },
    }));

    const result = await registry.emit("BudgetExhausted", {
      budget: 100,
      spent: 95,
      remaining: 5,
      agentId: "agent-1",
    });

    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({ remaining: 0 }),
    });
  });
});
