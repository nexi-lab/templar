/**
 * E2E test — Collaboration middleware with mocked Nexus integration.
 *
 * Exercises all 3 middlewares (Reaction, Voice Evolution, Distillation) through
 * a full session lifecycle with a mocked NexusClient. Validates:
 *   - Full session lifecycle (start → turns → end)
 *   - Cross-middleware interaction
 *   - Performance (hot-path < 5ms)
 *   - Graceful degradation on failure
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Clock, ModelRequest } from "@templar/core";
import { createMockNexusClient } from "@templar/test-utils";

import { ReactionMiddleware } from "../../reaction/middleware.js";
import { InMemoryEventSource } from "../../reaction/event-source.js";
import { VoiceEvolutionMiddleware } from "../../voice/middleware.js";
import { DistillationMiddleware } from "../../distillation/middleware.js";
import type { NexusEvent } from "../../reaction/types.js";

// ---------------------------------------------------------------------------
// Shared test utilities
// ---------------------------------------------------------------------------

function createTestClock(): Clock & { advance(ms: number): void } {
  let time = 1000;
  const pending: Array<{ id: number; fn: () => void; fireAt: number }> = [];
  let nextId = 1;

  return {
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId;
      nextId += 1;
      pending.push({ id, fn, fireAt: time + ms });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => {
      const idx = pending.findIndex((p) => p.id === (id as unknown as number));
      if (idx >= 0) pending.splice(idx, 1);
    },
    advance(ms: number) {
      time += ms;
      const toFire = pending.filter((p) => p.fireAt <= time);
      for (const timer of toFire) {
        const idx = pending.indexOf(timer);
        if (idx >= 0) pending.splice(idx, 1);
        timer.fn();
      }
    },
  };
}

function createTestEvent(type: string, payload?: Record<string, unknown>): NexusEvent {
  return { id: `evt-${Date.now()}`, type, timestamp: Date.now(), payload: payload ?? {} };
}

// ---------------------------------------------------------------------------
// E2E: Full session lifecycle
// ---------------------------------------------------------------------------

describe("E2E: Collaboration middleware full session lifecycle", () => {
  let reaction: ReactionMiddleware | undefined;
  let voice: VoiceEvolutionMiddleware | undefined;
  let distillation: DistillationMiddleware | undefined;
  const clock = createTestClock();

  afterEach(async () => {
    await reaction?.onSessionEnd({ sessionId: "e2e" }).catch(() => {});
    await voice?.onSessionEnd({ sessionId: "e2e" }).catch(() => {});
    await distillation?.onSessionEnd({ sessionId: "e2e" }).catch(() => {});
    reaction = undefined;
    voice = undefined;
    distillation = undefined;
  });

  it("should run all 3 middlewares through a full agent session", async () => {
    const { client, mockMemory } = createMockNexusClient();

    // --- Configure Nexus mock responses ---
    mockMemory.query.mockResolvedValue({
      results: [
        { memory_id: "m1", content: "Be concise and direct", memory_type: "preference", created_at: "2025-01-01T00:00:00Z" },
        { memory_id: "m2", content: "Use bullet points", memory_type: "style", created_at: "2025-01-02T00:00:00Z" },
      ],
      total: 2,
    });
    mockMemory.batchStore.mockResolvedValue({ stored: 2, failed: 0 });

    // --- Set up ReactionMiddleware ---
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();

    reaction = new ReactionMiddleware({
      patterns: [
        { event: "nexus.file.*", action: "react-to-file", probability: 1.0, cooldown: "0s" },
        { event: "nexus.memory.stored", action: "react-to-memory", probability: 1.0, cooldown: "0s" },
      ],
      onReaction,
      eventSource,
      clock,
      rng: () => 0.5,
    });

    // --- Set up VoiceEvolutionMiddleware ---
    voice = new VoiceEvolutionMiddleware({
      nexusClient: client as never,
      updateInterval: "1h",
      maxDrift: 0.5,
      clock,
    });

    // --- Set up DistillationMiddleware ---
    distillation = new DistillationMiddleware({
      nexusClient: client as never,
      triggers: ["session_end"],
      maxTurns: 10,
      minConfidence: 0.3,
    });

    // === Phase 1: Session Start ===
    const sessionCtx = { sessionId: "e2e-session", agentId: "e2e-agent" };

    await reaction.onSessionStart(sessionCtx);
    await voice.onSessionStart(sessionCtx);
    await distillation.onSessionStart(sessionCtx);

    // Voice should have queried Nexus for personality modifiers
    expect(mockMemory.query).toHaveBeenCalledTimes(1);

    // === Phase 2: Simulate turns ===
    const conversations = [
      { input: "What's our tech stack?", output: "We decided to use React for the frontend." },
      { input: "What about testing?", output: "I prefer Vitest for unit testing." },
      { input: "Action items?", output: "We need to update the CI pipeline." },
    ];

    for (let i = 0; i < conversations.length; i++) {
      const turn = conversations[i];
      if (turn === undefined) continue;

      const turnCtx = {
        sessionId: "e2e-session",
        turnNumber: i + 1,
        input: turn.input,
        output: turn.output,
      };

      // Distillation buffers each turn
      await distillation.onAfterTurn(turnCtx);

      // Voice wraps model calls — test hot-path injection
      const modelReq: ModelRequest = {
        messages: [{ role: "user", content: turn.input }],
        systemPrompt: "You are a helpful assistant.",
      };
      const next = vi.fn().mockResolvedValue({ content: turn.output });

      const startTime = performance.now();
      await voice.wrapModelCall(modelReq, next);
      const elapsed = performance.now() - startTime;

      // Hot-path performance check: should be < 50ms (generous bound for CI)
      expect(elapsed).toBeLessThan(50);

      // Voice should inject modifiers into system prompt
      const calledReq = next.mock.calls[0]?.[0] as ModelRequest;
      expect(calledReq.systemPrompt).toContain("You are a helpful assistant.");
      expect(calledReq.systemPrompt).toContain("Be concise and direct");
    }

    // === Phase 3: Fire events (Reaction) ===
    eventSource.emit(createTestEvent("nexus.file.created", { path: "/docs/README.md" }));
    eventSource.emit(createTestEvent("nexus.memory.stored", { memory_id: "m3" }));
    await new Promise((r) => globalThis.setTimeout(r, 20));

    expect(onReaction).toHaveBeenCalledTimes(2);
    expect(reaction.getReactionCount()).toBe(2);

    // === Phase 4: Session End ===
    await distillation.onSessionEnd(sessionCtx);

    // Distillation should have extracted and stored memories
    const diagnostics = distillation.getDiagnostics();
    expect(diagnostics.extractionCount).toBe(1);
    expect(diagnostics.bufferSize).toBe(0); // cleared after extraction

    // Voice & Reaction clean up
    await voice.onSessionEnd(sessionCtx);
    await reaction.onSessionEnd(sessionCtx);

    // batchStore should have been called by distillation
    expect(mockMemory.batchStore).toHaveBeenCalledTimes(1);
  });

  it("should verify distillation stores memories with correct structure", async () => {
    const { client, mockMemory } = createMockNexusClient();

    mockMemory.query.mockResolvedValue({ results: [], total: 0 });
    mockMemory.batchStore.mockResolvedValue({ stored: 2, failed: 0 });

    distillation = new DistillationMiddleware({
      nexusClient: client as never,
      triggers: ["session_end"],
    });

    await distillation.onSessionStart({ sessionId: "mem-test" });

    // Add turns with extractable content
    await distillation.onAfterTurn({
      sessionId: "mem-test",
      turnNumber: 1,
      input: "Should we use React?",
      output: "We decided to use React for the frontend framework.",
    });
    await distillation.onAfterTurn({
      sessionId: "mem-test",
      turnNumber: 2,
      input: "Formatting?",
      output: "I prefer using Biome for formatting.",
    });

    await distillation.onSessionEnd({ sessionId: "mem-test" });

    // Validate stored memory structure
    expect(mockMemory.batchStore).toHaveBeenCalledTimes(1);

    const storedCall = mockMemory.batchStore.mock.calls[0]?.[0];
    const storedMemories = storedCall?.memories as Array<{
      content: string;
      scope: string;
      memory_type: string;
      importance: number;
    }>;

    expect(storedMemories.length).toBeGreaterThan(0);

    for (const mem of storedMemories) {
      // Every stored memory should have required fields
      expect(typeof mem.content).toBe("string");
      expect(mem.content.length).toBeGreaterThan(0);
      expect(typeof mem.scope).toBe("string");
      expect(typeof mem.memory_type).toBe("string");
      expect(typeof mem.importance).toBe("number");
      expect(mem.importance).toBeGreaterThanOrEqual(0);
      expect(mem.importance).toBeLessThanOrEqual(1);
    }
  });

  it("should degrade gracefully when Nexus is unavailable", async () => {
    const { client, mockMemory } = createMockNexusClient();

    // All API calls fail
    mockMemory.query.mockRejectedValue(new Error("Connection refused"));
    mockMemory.batchStore.mockRejectedValue(new Error("Connection refused"));

    const eventSource = new InMemoryEventSource();

    reaction = new ReactionMiddleware({
      patterns: [{ event: "nexus.*", action: "catch-all", probability: 1.0, cooldown: "0s" }],
      onReaction: vi.fn().mockRejectedValue(new Error("Handler failed")),
      eventSource,
      clock,
      rng: () => 0.5,
    });

    voice = new VoiceEvolutionMiddleware({
      nexusClient: client as never,
      updateInterval: "1h",
      maxDrift: 0.5,
      clock,
    });

    distillation = new DistillationMiddleware({
      nexusClient: client as never,
      triggers: ["session_end"],
    });

    const sessionCtx = { sessionId: "fail-test" };

    // None of these should throw
    await expect(reaction.onSessionStart(sessionCtx)).resolves.not.toThrow();
    await expect(voice.onSessionStart(sessionCtx)).resolves.not.toThrow();
    await expect(distillation.onSessionStart(sessionCtx)).resolves.not.toThrow();

    // Turns work normally
    await distillation.onAfterTurn({
      sessionId: "fail-test",
      turnNumber: 1,
      input: "hi",
      output: "hello",
    });

    // Voice passes through unchanged
    const req: ModelRequest = {
      messages: [{ role: "user", content: "test" }],
      systemPrompt: "Base prompt.",
    };
    const next = vi.fn().mockResolvedValue({ content: "ok" });
    await voice.wrapModelCall(req, next);

    // Should pass through with original prompt (no modifiers since query failed)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ systemPrompt: "Base prompt." }),
    );

    // Reaction handler errors don't crash
    eventSource.emit(createTestEvent("nexus.event"));
    await new Promise((r) => globalThis.setTimeout(r, 20));

    // Session end doesn't crash even if storage fails
    await expect(distillation.onSessionEnd(sessionCtx)).resolves.not.toThrow();
    await expect(voice.onSessionEnd(sessionCtx)).resolves.not.toThrow();
    await expect(reaction.onSessionEnd(sessionCtx)).resolves.not.toThrow();
  });

  it("should verify voice hot-path performance under load", async () => {
    const { client, mockMemory } = createMockNexusClient();

    mockMemory.query.mockResolvedValue({
      results: Array.from({ length: 20 }, (_, i) => ({
        memory_id: `m${i}`,
        content: `Trait ${i}: be ${["concise", "helpful", "clear", "precise"][i % 4]}`,
        memory_type: "preference",
        created_at: `2025-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      })),
      total: 20,
    });

    voice = new VoiceEvolutionMiddleware({
      nexusClient: client as never,
      updateInterval: "1h",
      maxDrift: 0.3,
      clock,
    });

    distillation = new DistillationMiddleware({
      nexusClient: client as never,
    });

    await voice.onSessionStart({ sessionId: "perf-test" });

    // Simulate 50 model calls to measure average latency
    const latencies: number[] = [];
    const next = vi.fn().mockResolvedValue({ content: "response" });

    for (let i = 0; i < 50; i++) {
      const req: ModelRequest = {
        messages: [{ role: "user", content: `Turn ${i}` }],
        systemPrompt: "Base system prompt for the agent.",
      };

      const start = performance.now();
      await voice.wrapModelCall(req, next);
      latencies.push(performance.now() - start);
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const maxLatency = Math.max(...latencies);

    // Average latency should be well under 1ms (just string concat)
    expect(avgLatency).toBeLessThan(5);
    // No outliers over 50ms
    expect(maxLatency).toBeLessThan(50);

    // Verify modifier weight cap is respected
    const cache = voice.getModifierCache();
    expect(cache.totalWeight()).toBeLessThanOrEqual(0.3);

    await voice.onSessionEnd({ sessionId: "perf-test" });
  });
});
