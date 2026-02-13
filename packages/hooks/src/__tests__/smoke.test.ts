import { describe, expect, it } from "vitest";
import { CONTINUE_RESULT } from "../constants.js";
import { HookRegistry } from "../registry.js";
import type { InterceptorEvent, ObserverEvent } from "../types.js";
import {
  makeBudgetExhaustedData,
  makeBudgetWarningData,
  makeContextPressureData,
  makeErrorOccurredData,
  makeNodeConnectedData,
  makeNodeDisconnectedData,
  makePostMessageData,
  makePostModelCallData,
  makePostToolUseData,
  makePreCompactData,
  makePreMessageData,
  makePreModelCallData,
  makePreModelSelectData,
  makePreToolUseData,
  makeSessionEndData,
  makeSessionStartData,
  makeSubagentEndData,
  makeSubagentStartData,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Interceptor event smoke tests
// ---------------------------------------------------------------------------

const interceptorCases: Array<{ event: InterceptorEvent; factory: () => unknown }> = [
  { event: "PreToolUse", factory: makePreToolUseData },
  { event: "PreModelCall", factory: makePreModelCallData },
  { event: "PreModelSelect", factory: makePreModelSelectData },
  { event: "PreMessage", factory: makePreMessageData },
  { event: "BudgetExhausted", factory: makeBudgetExhaustedData },
  { event: "PreCompact", factory: makePreCompactData },
];

describe("Smoke — interceptor events", () => {
  it.each(interceptorCases)("$event: register, emit, verify HookResult", async ({
    event,
    factory,
  }) => {
    const registry = new HookRegistry();
    let called = false;

    // biome-ignore lint/suspicious/noExplicitAny: dynamic event registration
    registry.on(event as any, () => {
      called = true;
      return CONTINUE_RESULT;
    });

    // biome-ignore lint/suspicious/noExplicitAny: dynamic event emit
    const result = await registry.emit(event as any, factory() as any);
    expect(called).toBe(true);
    expect(result).toEqual({ action: "continue" });
  });
});

// ---------------------------------------------------------------------------
// Observer event smoke tests
// ---------------------------------------------------------------------------

const observerCases: Array<{ event: ObserverEvent; factory: () => unknown }> = [
  { event: "PostToolUse", factory: makePostToolUseData },
  { event: "PostModelCall", factory: makePostModelCallData },
  { event: "PostMessage", factory: makePostMessageData },
  { event: "SessionStart", factory: makeSessionStartData },
  { event: "SessionEnd", factory: makeSessionEndData },
  { event: "BudgetWarning", factory: makeBudgetWarningData },
  { event: "ErrorOccurred", factory: makeErrorOccurredData },
  { event: "ContextPressure", factory: makeContextPressureData },
  { event: "NodeConnected", factory: makeNodeConnectedData },
  { event: "NodeDisconnected", factory: makeNodeDisconnectedData },
  { event: "SubagentStart", factory: makeSubagentStartData },
  { event: "SubagentEnd", factory: makeSubagentEndData },
];

describe("Smoke — observer events", () => {
  it.each(observerCases)("$event: register, emit, verify void", async ({ event, factory }) => {
    const registry = new HookRegistry();
    let called = false;

    // biome-ignore lint/suspicious/noExplicitAny: dynamic event registration
    registry.on(event as any, () => {
      called = true;
    });

    // biome-ignore lint/suspicious/noExplicitAny: dynamic event emit
    const result = await registry.emit(event as any, factory() as any);
    expect(called).toBe(true);
    expect(result).toBeUndefined();
  });
});
