import { HookExecutionError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { CONTINUE_RESULT } from "../constants.js";
import { HookRegistry } from "../registry.js";
import { makePreToolUseData } from "./helpers.js";

describe("HookRegistry — interceptor return validation", () => {
  it("handler returning null throws HookExecutionError", async () => {
    const registry = new HookRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid return
    registry.on("PreToolUse", () => null as any);

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(/null/);
  });

  it("handler returning undefined throws HookExecutionError", async () => {
    const registry = new HookRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid return
    registry.on("PreToolUse", () => undefined as any);

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(/undefined/);
  });

  it("handler returning a string throws HookExecutionError", async () => {
    const registry = new HookRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid return
    registry.on("PreToolUse", () => "invalid" as any);

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      /non-HookResult/,
    );
  });

  it("handler returning object without action throws HookExecutionError", async () => {
    const registry = new HookRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid return
    registry.on("PreToolUse", () => ({ foo: "bar" }) as any);

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
  });

  it("handler returning unknown action throws HookExecutionError", async () => {
    const registry = new HookRegistry();
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid return
    registry.on("PreToolUse", () => ({ action: "unknown" }) as any);

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      /unknown action/,
    );
  });

  it("valid continue result passes", async () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", () => CONTINUE_RESULT);

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "continue" });
  });

  it("valid block result passes", async () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", () => ({ action: "block" as const, reason: "test" }));

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({ action: "block", reason: "test" });
  });

  it("valid modify result passes", async () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", (data) => ({
      action: "modify" as const,
      data: { ...data, toolName: "modified" },
    }));

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(result).toEqual({
      action: "modify",
      data: expect.objectContaining({ toolName: "modified" }),
    });
  });
});
