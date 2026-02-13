import { describe, expect, it } from "vitest";
import { createHookMiddleware } from "../bridge.js";
import { HookRegistry } from "../registry.js";

describe("createHookMiddleware", () => {
  it("has name '@templar/hooks/bridge'", () => {
    const registry = new HookRegistry();
    const middleware = createHookMiddleware(registry);
    expect(middleware.name).toBe("@templar/hooks/bridge");
  });

  it("onSessionStart emits SessionStart event", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("SessionStart", (data) => {
      received = data;
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onSessionStart?.({
      sessionId: "s1",
      agentId: "agent-1",
      userId: "user-1",
    });

    expect(received).toEqual({
      sessionId: "s1",
      agentId: "agent-1",
      userId: "user-1",
    });
  });

  it("onSessionStart defaults agentId and userId to 'unknown'", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("SessionStart", (data) => {
      received = data;
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onSessionStart?.({ sessionId: "s1" });

    expect(received).toEqual({
      sessionId: "s1",
      agentId: "unknown",
      userId: "unknown",
    });
  });

  it("onBeforeTurn emits PreMessage event", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("PreMessage", (data) => {
      received = data;
      return { action: "continue" as const };
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onBeforeTurn?.({
      sessionId: "s1",
      turnNumber: 1,
      input: "hello",
    });

    expect(received).toEqual({
      message: { content: "hello" },
      channelId: "lifecycle",
      sessionId: "s1",
    });
  });

  it("onBeforeTurn with no input emits empty message", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("PreMessage", (data) => {
      received = data;
      return { action: "continue" as const };
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onBeforeTurn?.({
      sessionId: "s1",
      turnNumber: 1,
    });

    expect(received).toEqual({
      message: {},
      channelId: "lifecycle",
      sessionId: "s1",
    });
  });

  it("onAfterTurn emits PostMessage event", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("PostMessage", (data) => {
      received = data;
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onAfterTurn?.({
      sessionId: "s1",
      turnNumber: 3,
      output: "response",
    });

    expect(received).toEqual({
      message: { content: "response" },
      channelId: "lifecycle",
      messageId: "turn-3",
      sessionId: "s1",
    });
  });

  it("onSessionEnd emits SessionEnd event", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("SessionEnd", (data) => {
      received = data;
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onSessionEnd?.({
      sessionId: "s1",
      agentId: "agent-1",
      userId: "user-1",
    });

    expect(received).toEqual({
      sessionId: "s1",
      agentId: "agent-1",
      userId: "user-1",
      durationMs: 0,
      turnCount: 0,
    });
  });

  it("onSessionEnd defaults agentId and userId to 'unknown'", async () => {
    const registry = new HookRegistry();
    let received: unknown;

    registry.on("SessionEnd", (data) => {
      received = data;
    });

    const middleware = createHookMiddleware(registry);
    await middleware.onSessionEnd?.({ sessionId: "s1" });

    expect(received).toEqual({
      sessionId: "s1",
      agentId: "unknown",
      userId: "unknown",
      durationMs: 0,
      turnCount: 0,
    });
  });
});
