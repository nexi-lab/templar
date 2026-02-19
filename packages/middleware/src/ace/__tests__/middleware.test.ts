import type { SessionContext, TurnContext } from "@templar/core";
import { AceConfigurationError } from "@templar/errors";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusAceMiddleware, validateAceConfig } from "../middleware.js";
import type { NexusAceConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: "session-1",
    agentId: "agent-1",
    userId: "user-1",
    ...overrides,
  };
}

function makeTurnContext(overrides?: Partial<TurnContext>): TurnContext {
  return {
    sessionId: "session-1",
    turnNumber: 1,
    input: "hello",
    output: "world",
    ...overrides,
  };
}

function setupDefaultMocks(mocks: MockNexusClient): void {
  mocks.mockAce.playbooks.query.mockResolvedValue({
    playbooks: [
      {
        playbook_id: "pb-1",
        name: "test-playbook",
        strategies: [
          { description: "Use concise responses", confidence: 0.9 },
          { description: "Low confidence tip", confidence: 0.3 },
        ],
      },
    ],
    total: 1,
  });

  mocks.mockMemory.search.mockResolvedValue({
    results: [{ memory_id: "m-1", content: "curated memory", scope: "agent", state: "active" }],
    total: 1,
    query: "",
  });

  mocks.mockAce.trajectories.start.mockResolvedValue({
    trajectory_id: "traj-1",
    status: "active",
  });

  mocks.mockAce.trajectories.logStep.mockResolvedValue({ status: "ok" });
  mocks.mockAce.trajectories.complete.mockResolvedValue({ status: "ok" });
  mocks.mockAce.reflection.reflect.mockResolvedValue({
    memory_id: "ref-1",
    trajectory_id: "traj-1",
    helpful_strategies: [],
    harmful_patterns: [],
    observations: [],
    confidence: 0.8,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NexusAceMiddleware", () => {
  let mocks: MockNexusClient;
  let middleware: NexusAceMiddleware;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = createMockNexusClient();
    setupDefaultMocks(mocks);
    middleware = new NexusAceMiddleware(mocks.client);
  });

  // =========================================================================
  // Constructor + Config validation
  // =========================================================================

  describe("constructor + config validation", () => {
    it("creates with default config", () => {
      expect(middleware.name).toBe("nexus-ace");
    });

    it("rejects invalid maxStrategiesInjected", () => {
      expect(() => new NexusAceMiddleware(mocks.client, { maxStrategiesInjected: 0 })).toThrow(
        AceConfigurationError,
      );
    });

    it("rejects invalid minStrategyConfidence", () => {
      expect(() => new NexusAceMiddleware(mocks.client, { minStrategyConfidence: 1.5 })).toThrow(
        AceConfigurationError,
      );
    });

    it("accepts valid custom config", () => {
      const config: NexusAceConfig = {
        maxStrategiesInjected: 5,
        minStrategyConfidence: 0.8,
        stepBufferSize: 3,
        reflectionMode: "sync",
        taskType: "coding",
      };
      const mw = new NexusAceMiddleware(mocks.client, config);
      expect(mw.name).toBe("nexus-ace");
    });
  });

  // =========================================================================
  // onSessionStart
  // =========================================================================

  describe("onSessionStart", () => {
    it("loads playbook strategies and curated memories in parallel", async () => {
      const ctx = makeSessionContext();
      await middleware.onSessionStart(ctx);

      expect(mocks.mockAce.playbooks.query).toHaveBeenCalledOnce();
      expect(mocks.mockMemory.search).toHaveBeenCalledOnce();
      expect(mocks.mockAce.trajectories.start).toHaveBeenCalledOnce();
    });

    it("gracefully degrades when playbook load times out", async () => {
      mocks.mockAce.playbooks.query.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10_000)),
      );

      const mw = new NexusAceMiddleware(mocks.client, {
        playbookLoadTimeoutMs: 10,
      });
      const ctx = makeSessionContext();

      // Should not throw
      await mw.onSessionStart(ctx);
    });

    it("gracefully degrades when trajectory start fails", async () => {
      mocks.mockAce.trajectories.start.mockRejectedValue(new Error("network error"));

      const ctx = makeSessionContext();
      await middleware.onSessionStart(ctx);

      // Middleware should still work, trajectory just won't be tracked
    });
  });

  // =========================================================================
  // onBeforeTurn
  // =========================================================================

  describe("onBeforeTurn", () => {
    it("injects strategies and curated memories into turn metadata", async () => {
      const sessionCtx = makeSessionContext();
      await middleware.onSessionStart(sessionCtx);

      const turnCtx = makeTurnContext();
      await middleware.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata).toBeDefined();
      expect(turnCtx.metadata!.aceStrategies).toBeDefined();
      expect(turnCtx.metadata!.aceCuratedMemories).toBeDefined();
    });

    it("does not inject empty strategies", async () => {
      mocks.mockAce.playbooks.query.mockResolvedValue({
        playbooks: [{ playbook_id: "pb-1", name: "empty", strategies: [] }],
        total: 1,
      });
      mocks.mockMemory.search.mockResolvedValue({ results: [], total: 0, query: "" });

      await middleware.onSessionStart(makeSessionContext());

      const turnCtx = makeTurnContext();
      await middleware.onBeforeTurn(turnCtx);

      expect(turnCtx.metadata?.aceStrategies).toBeUndefined();
      expect(turnCtx.metadata?.aceCuratedMemories).toBeUndefined();
    });
  });

  // =========================================================================
  // onAfterTurn
  // =========================================================================

  describe("onAfterTurn", () => {
    it("buffers trajectory steps", async () => {
      await middleware.onSessionStart(makeSessionContext());

      // Log 3 turns — should NOT flush yet (default buffer = 5)
      for (let i = 1; i <= 3; i++) {
        await middleware.onAfterTurn(makeTurnContext({ turnNumber: i }));
      }

      expect(mocks.mockAce.trajectories.logStep).not.toHaveBeenCalled();
    });

    it("flushes when buffer is full", async () => {
      await middleware.onSessionStart(makeSessionContext());

      // Log 5 turns — should trigger flush
      for (let i = 1; i <= 5; i++) {
        await middleware.onAfterTurn(makeTurnContext({ turnNumber: i }));
      }

      expect(mocks.mockAce.trajectories.logStep).toHaveBeenCalledTimes(5);
    });

    it("uses configured stepBufferSize", async () => {
      const mw = new NexusAceMiddleware(mocks.client, { stepBufferSize: 2 });
      await mw.onSessionStart(makeSessionContext());

      await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
      expect(mocks.mockAce.trajectories.logStep).not.toHaveBeenCalled();

      await mw.onAfterTurn(makeTurnContext({ turnNumber: 2 }));
      expect(mocks.mockAce.trajectories.logStep).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // onSessionEnd
  // =========================================================================

  describe("onSessionEnd", () => {
    it("flushes remaining buffer and completes trajectory", async () => {
      await middleware.onSessionStart(makeSessionContext());
      await middleware.onAfterTurn(makeTurnContext({ turnNumber: 1 }));

      await middleware.onSessionEnd(makeSessionContext());

      expect(mocks.mockAce.trajectories.logStep).toHaveBeenCalledTimes(1);
      expect(mocks.mockAce.trajectories.complete).toHaveBeenCalledOnce();
    });

    it("triggers async reflection when enabled", async () => {
      const mw = new NexusAceMiddleware(mocks.client, {
        enabled: { reflection: true },
        reflectionMode: "async",
      });
      await mw.onSessionStart(makeSessionContext());
      await mw.onSessionEnd(makeSessionContext());

      // Fire-and-forget — give it a tick to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mocks.mockAce.reflection.reflect).toHaveBeenCalledOnce();
    });

    it("triggers sync reflection when configured", async () => {
      const mw = new NexusAceMiddleware(mocks.client, {
        enabled: { reflection: true },
        reflectionMode: "sync",
      });
      await mw.onSessionStart(makeSessionContext());
      await mw.onSessionEnd(makeSessionContext());

      expect(mocks.mockAce.reflection.reflect).toHaveBeenCalledOnce();
    });

    it("does not trigger reflection when disabled", async () => {
      const mw = new NexusAceMiddleware(mocks.client, {
        enabled: { reflection: false },
      });
      await mw.onSessionStart(makeSessionContext());
      await mw.onSessionEnd(makeSessionContext());

      expect(mocks.mockAce.reflection.reflect).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // wrapModelCall
  // =========================================================================

  describe("wrapModelCall", () => {
    it("injects strategies into system prompt", async () => {
      await middleware.onSessionStart(makeSessionContext());

      const next = vi.fn().mockResolvedValue({
        content: "response",
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      const req = {
        messages: [{ role: "user", content: "hello" }] as const,
        systemPrompt: "You are a helpful assistant.",
      };

      await middleware.wrapModelCall(req, next);

      // next should have been called with enriched system prompt
      const enrichedReq = next.mock.calls[0]![0]!;
      expect(enrichedReq.systemPrompt).toContain("Playbook Strategies");
      expect(enrichedReq.systemPrompt).toContain("Use concise responses");
      // Low confidence (0.3 < 0.6 threshold) should be filtered
      expect(enrichedReq.systemPrompt).not.toContain("Low confidence tip");
    });

    it("passes through when no strategies loaded", async () => {
      mocks.mockAce.playbooks.query.mockResolvedValue({
        playbooks: [],
        total: 0,
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
    });
  });

  // =========================================================================
  // wrapToolCall
  // =========================================================================

  describe("wrapToolCall", () => {
    it("records tool call as trajectory step", async () => {
      await middleware.onSessionStart(makeSessionContext());

      const next = vi.fn().mockResolvedValue({ output: "tool result" });
      const req = { toolName: "search", input: { query: "test" } };

      await middleware.wrapToolCall(req, next);

      // Step should be buffered (not immediately flushed)
      expect(next).toHaveBeenCalledOnce();
    });
  });

  // =========================================================================
  // Feature flag disable — all hooks no-op
  // =========================================================================

  describe("feature flag disable", () => {
    it("skips all operations when all features disabled", async () => {
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

      expect(mocks.mockAce.playbooks.query).not.toHaveBeenCalled();
      expect(mocks.mockMemory.search).not.toHaveBeenCalled();
      expect(mocks.mockAce.trajectories.start).not.toHaveBeenCalled();
      expect(mocks.mockAce.trajectories.logStep).not.toHaveBeenCalled();
      expect(mocks.mockAce.trajectories.complete).not.toHaveBeenCalled();
      expect(mocks.mockAce.reflection.reflect).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// validateAceConfig standalone tests
// ---------------------------------------------------------------------------

describe("validateAceConfig", () => {
  it("accepts empty config", () => {
    expect(() => validateAceConfig({})).not.toThrow();
  });

  it("rejects invalid reflectionMode", () => {
    expect(() => validateAceConfig({ reflectionMode: "invalid" as "sync" })).toThrow(
      AceConfigurationError,
    );
  });

  it("rejects negative timeouts", () => {
    expect(() => validateAceConfig({ playbookLoadTimeoutMs: -1 })).toThrow(AceConfigurationError);
  });

  it("rejects maxCuratedMemories > 100", () => {
    expect(() => validateAceConfig({ maxCuratedMemories: 101 })).toThrow(AceConfigurationError);
  });
});
