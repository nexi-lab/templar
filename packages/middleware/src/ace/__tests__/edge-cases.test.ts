import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusAceMiddleware } from "../middleware.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: "session-edge",
    agentId: "agent-1",
    userId: "user-1",
    ...overrides,
  };
}

function makeTurnContext(overrides?: Partial<TurnContext>): TurnContext {
  return {
    sessionId: "session-edge",
    turnNumber: 1,
    input: "hello",
    output: "world",
    ...overrides,
  };
}

function setupDefaultMocks(mocks: MockNexusClient): void {
  mocks.mockAce.playbooks.query.mockResolvedValue({ playbooks: [], total: 0 });
  mocks.mockMemory.search.mockResolvedValue({ results: [], total: 0, query: "" });
  mocks.mockAce.trajectories.start.mockResolvedValue({
    trajectory_id: "traj-edge",
    status: "active",
  });
  mocks.mockAce.trajectories.logStep.mockResolvedValue({ status: "ok" });
  mocks.mockAce.trajectories.complete.mockResolvedValue({ status: "ok" });
}

// ---------------------------------------------------------------------------
// Edge case tests (Decision 11A — all 7 failure modes)
// ---------------------------------------------------------------------------

describe("NexusAceMiddleware edge cases", () => {
  let mocks: MockNexusClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = createMockNexusClient();
    setupDefaultMocks(mocks);
  });

  it("1. Playbook load timeout → graceful degradation", async () => {
    mocks.mockAce.playbooks.query.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 10_000)),
    );

    const mw = new NexusAceMiddleware(mocks.client, {
      playbookLoadTimeoutMs: 10,
    });

    await mw.onSessionStart(makeSessionContext());

    // Should continue working without strategies
    const turnCtx = makeTurnContext();
    await mw.onBeforeTurn(turnCtx);
    expect(turnCtx.metadata?.aceStrategies).toBeUndefined();
  });

  it("2. Trajectory log failure mid-session → LLM chain uninterrupted", async () => {
    mocks.mockAce.trajectories.logStep.mockRejectedValue(
      new Error("trajectory API down"),
    );

    const mw = new NexusAceMiddleware(mocks.client, { stepBufferSize: 1 });
    await mw.onSessionStart(makeSessionContext());

    // Should not throw — step logging failure is non-fatal
    await expect(mw.onAfterTurn(makeTurnContext())).resolves.not.toThrow();
  });

  it("3. Reflection LLM call fails → session ends cleanly", async () => {
    mocks.mockAce.reflection.reflect.mockRejectedValue(
      new Error("LLM provider error"),
    );

    const mw = new NexusAceMiddleware(mocks.client, {
      enabled: { reflection: true },
      reflectionMode: "sync",
    });
    await mw.onSessionStart(makeSessionContext());

    // Should not throw
    await expect(mw.onSessionEnd(makeSessionContext())).resolves.not.toThrow();
  });

  it("4. Concurrent sessions → no shared mutable state", async () => {
    const mw1 = new NexusAceMiddleware(mocks.client);
    const mw2 = new NexusAceMiddleware(mocks.client);

    // Different trajectory IDs for different instances
    mocks.mockAce.trajectories.start
      .mockResolvedValueOnce({ trajectory_id: "traj-A", status: "active" })
      .mockResolvedValueOnce({ trajectory_id: "traj-B", status: "active" });

    await mw1.onSessionStart(makeSessionContext({ sessionId: "session-A" }));
    await mw2.onSessionStart(makeSessionContext({ sessionId: "session-B" }));

    // Each middleware tracks its own trajectory — no cross-contamination
    await mw1.onAfterTurn(makeTurnContext({ sessionId: "session-A", turnNumber: 1 }));
    await mw2.onAfterTurn(makeTurnContext({ sessionId: "session-B", turnNumber: 1 }));

    // Both should independently buffer steps without interference
    await mw1.onSessionEnd(makeSessionContext({ sessionId: "session-A" }));
    await mw2.onSessionEnd(makeSessionContext({ sessionId: "session-B" }));

    // Both trajectories should be completed independently
    expect(mocks.mockAce.trajectories.complete).toHaveBeenCalledTimes(2);
  });

  it("5. ACE disabled in config → all hooks no-op", async () => {
    const mw = new NexusAceMiddleware(mocks.client, {
      enabled: {
        playbooks: false,
        trajectory: false,
        curation: false,
        reflection: false,
        consolidation: false,
        feedback: false,
      },
    });

    await mw.onSessionStart(makeSessionContext());
    await mw.onBeforeTurn(makeTurnContext());
    await mw.onAfterTurn(makeTurnContext());
    await mw.onSessionEnd(makeSessionContext());

    // No API calls should have been made
    expect(mocks.mockAce.playbooks.query).not.toHaveBeenCalled();
    expect(mocks.mockMemory.search).not.toHaveBeenCalled();
    expect(mocks.mockAce.trajectories.start).not.toHaveBeenCalled();
    expect(mocks.mockAce.trajectories.logStep).not.toHaveBeenCalled();
    expect(mocks.mockAce.trajectories.complete).not.toHaveBeenCalled();
  });

  it("6. Empty playbook strategies → no empty system prompt injection", async () => {
    mocks.mockAce.playbooks.query.mockResolvedValue({
      playbooks: [
        {
          playbook_id: "pb-empty",
          name: "empty",
          strategies: [],
        },
      ],
      total: 1,
    });

    const mw = new NexusAceMiddleware(mocks.client);
    await mw.onSessionStart(makeSessionContext());

    const next = vi.fn().mockResolvedValue({ content: "response" });
    const req = {
      messages: [{ role: "user", content: "hello" }] as const,
      systemPrompt: "Original prompt.",
    };

    await mw.wrapModelCall(req, next);

    const passedReq = next.mock.calls[0]![0]!;
    expect(passedReq.systemPrompt).toBe("Original prompt.");
    expect(passedReq.systemPrompt).not.toContain("Playbook Strategies");
  });

  it("7. Nexus returns 403 → surfaced via console.warn, session continues", async () => {
    const permError = new Error("403 Forbidden");
    mocks.mockAce.playbooks.query.mockRejectedValue(permError);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mw = new NexusAceMiddleware(mocks.client);
    await mw.onSessionStart(makeSessionContext());

    // Should have logged a warning
    expect(warnSpy).toHaveBeenCalled();
    const warnMessages = warnSpy.mock.calls.map((c) => String(c[0]));
    expect(warnMessages.some((msg) => msg.includes("403 Forbidden"))).toBe(true);

    warnSpy.mockRestore();
  });
});
