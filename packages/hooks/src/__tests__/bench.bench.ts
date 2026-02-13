import { bench, describe } from "vitest";
import { CONTINUE_RESULT } from "../constants.js";
import { HookRegistry } from "../registry.js";
import { makePostToolUseData, makePreToolUseData } from "./helpers.js";

// ---------------------------------------------------------------------------
// Interceptor emit benchmarks
// ---------------------------------------------------------------------------

describe("Interceptor emit", () => {
  bench("0 handlers", async () => {
    const registry = new HookRegistry();
    await registry.emit("PreToolUse", makePreToolUseData());
  });

  bench("1 handler", async () => {
    const registry = new HookRegistry();
    registry.on("PreToolUse", () => CONTINUE_RESULT);
    await registry.emit("PreToolUse", makePreToolUseData());
  });

  bench("10 handlers", async () => {
    const registry = new HookRegistry();
    for (let i = 0; i < 10; i++) {
      registry.on("PreToolUse", () => CONTINUE_RESULT);
    }
    await registry.emit("PreToolUse", makePreToolUseData());
  });
});

// ---------------------------------------------------------------------------
// Observer emit benchmarks
// ---------------------------------------------------------------------------

describe("Observer emit", () => {
  bench("0 handlers", async () => {
    const registry = new HookRegistry();
    await registry.emit("PostToolUse", makePostToolUseData());
  });

  bench("1 handler", async () => {
    const registry = new HookRegistry();
    registry.on("PostToolUse", () => {});
    await registry.emit("PostToolUse", makePostToolUseData());
  });

  bench("10 handlers", async () => {
    const registry = new HookRegistry();
    for (let i = 0; i < 10; i++) {
      registry.on("PostToolUse", () => {});
    }
    await registry.emit("PostToolUse", makePostToolUseData());
  });
});

// ---------------------------------------------------------------------------
// Waterfall benchmark
// ---------------------------------------------------------------------------

describe("Waterfall", () => {
  bench("5 modifiers", async () => {
    const registry = new HookRegistry();
    for (let i = 0; i < 5; i++) {
      registry.on("PreToolUse", (data) => ({
        action: "modify" as const,
        data: { ...data, toolName: `${data.toolName}-${i}` },
      }));
    }
    await registry.emit("PreToolUse", makePreToolUseData());
  });
});

// ---------------------------------------------------------------------------
// Concurrent observer emits
// ---------------------------------------------------------------------------

describe("Concurrent", () => {
  bench("10 concurrent observer emits", async () => {
    const registry = new HookRegistry();
    registry.on("PostToolUse", () => {});
    await Promise.all(
      Array.from({ length: 10 }, () => registry.emit("PostToolUse", makePostToolUseData())),
    );
  });
});

// ---------------------------------------------------------------------------
// On + emit + dispose cycle
// ---------------------------------------------------------------------------

describe("Lifecycle", () => {
  bench("on + emit + dispose", async () => {
    const registry = new HookRegistry();
    const dispose = registry.on("PreToolUse", () => CONTINUE_RESULT);
    await registry.emit("PreToolUse", makePreToolUseData());
    dispose();
  });
});
