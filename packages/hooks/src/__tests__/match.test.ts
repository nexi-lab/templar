import { HookExecutionError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { CONTINUE_RESULT, HOOK_PRIORITY } from "../constants.js";
import { HookRegistry } from "../registry.js";
import type { PreToolUseData } from "../types.js";
import { makePostToolUseData, makePreToolUseData } from "./helpers.js";

describe("HookRegistry — match predicate (interceptor)", () => {
  it("handler called when match returns true", async () => {
    const registry = new HookRegistry();
    let called = false;

    registry.on(
      "PreToolUse",
      () => {
        called = true;
        return CONTINUE_RESULT;
      },
      { match: () => true },
    );

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(called).toBe(true);
  });

  it("handler skipped when match returns false", async () => {
    const registry = new HookRegistry();
    let called = false;

    registry.on(
      "PreToolUse",
      () => {
        called = true;
        return CONTINUE_RESULT;
      },
      { match: () => false },
    );

    const result = await registry.emit("PreToolUse", makePreToolUseData());
    expect(called).toBe(false);
    expect(result).toEqual({ action: "continue" });
  });

  it("match receives current (waterfalled) data", async () => {
    const registry = new HookRegistry();
    let matchReceivedData: unknown;

    registry.on(
      "PreToolUse",
      (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: "modified-tool" },
      }),
      { priority: HOOK_PRIORITY.HIGH },
    );

    registry.on("PreToolUse", () => CONTINUE_RESULT, {
      priority: HOOK_PRIORITY.LOW,
      match: (data) => {
        matchReceivedData = data;
        return true;
      },
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect((matchReceivedData as PreToolUseData).toolName).toBe("modified-tool");
  });

  it("no match option means handler always called", async () => {
    const registry = new HookRegistry();
    let called = false;

    registry.on("PreToolUse", () => {
      called = true;
      return CONTINUE_RESULT;
    });

    await registry.emit("PreToolUse", makePreToolUseData());
    expect(called).toBe(true);
  });

  it("match predicate throwing wraps in HookExecutionError", async () => {
    const registry = new HookRegistry();

    registry.on("PreToolUse", () => CONTINUE_RESULT, {
      match: () => {
        throw new Error("match boom");
      },
    });

    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      HookExecutionError,
    );
    await expect(registry.emit("PreToolUse", makePreToolUseData())).rejects.toThrow(
      /match predicate threw/,
    );
  });
});

describe("HookRegistry — match predicate (observer)", () => {
  it("handler called when match returns true", async () => {
    const registry = new HookRegistry();
    let called = false;

    registry.on(
      "PostToolUse",
      () => {
        called = true;
      },
      { match: () => true },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(called).toBe(true);
  });

  it("handler skipped when match returns false", async () => {
    const registry = new HookRegistry();
    let called = false;

    registry.on(
      "PostToolUse",
      () => {
        called = true;
      },
      { match: () => false },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(called).toBe(false);
  });

  it("match predicate throwing reports via onObserverError", async () => {
    const errors: Error[] = [];
    const registry = new HookRegistry({
      onObserverError: (_event, error) => {
        errors.push(error);
      },
    });

    registry.on(
      "PostToolUse",
      () => {
        // should not be called
      },
      {
        match: () => {
          throw new Error("match boom");
        },
      },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("match boom");
  });

  it("match predicate throwing without callback logs to console.warn", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = new HookRegistry();

    registry.on(
      "PostToolUse",
      () => {
        // should not be called
      },
      {
        match: () => {
          throw new Error("match boom");
        },
      },
    );

    await registry.emit("PostToolUse", makePostToolUseData());
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0]?.[0]).toContain("match predicate error");
    warnSpy.mockRestore();
  });
});
