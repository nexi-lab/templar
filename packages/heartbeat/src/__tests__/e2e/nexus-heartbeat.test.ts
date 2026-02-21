/**
 * E2E test — HeartbeatMiddleware with real-ish Nexus integration.
 *
 * This test uses mock Nexus client to verify the full heartbeat lifecycle
 * with all 5 built-in evaluators. For true Nexus E2E, start a Nexus server
 * and set NEXUS_API_URL + NEXUS_API_KEY environment variables.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createChannelVisibilityEvaluator } from "../../evaluators/channel-visibility.js";
import { createMemoryPromotionEvaluator } from "../../evaluators/memory-promotion.js";
import {
  clearReactions,
  createReactionProcessorEvaluator,
  enqueueReaction,
} from "../../evaluators/reaction-processor.js";
import { createStuckRecoveryEvaluator } from "../../evaluators/stuck-recovery.js";
import { createTriggerCheckEvaluator } from "../../evaluators/trigger-check.js";
import { HeartbeatMiddleware } from "../../middleware.js";
import type { Clock } from "../../types.js";

function createTestClock(): Clock & { advance(ms: number): void } {
  let time = 1000;
  const pending: Array<{ fn: () => void; ms: number; id: number }> = [];
  let nextId = 1;

  return {
    now: () => time,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      pending.push({ fn, ms, id });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (id) => {
      const idx = pending.findIndex((t) => t.id === (id as unknown as number));
      if (idx !== -1) pending.splice(idx, 1);
    },
    advance: (ms: number) => {
      time += ms;
      const ready = pending.filter((t) => t.ms <= ms);
      for (const timer of ready) {
        const idx = pending.indexOf(timer);
        if (idx !== -1) pending.splice(idx, 1);
        timer.fn();
      }
    },
  };
}

describe("E2E: HeartbeatMiddleware with all evaluators", () => {
  let middleware: HeartbeatMiddleware;

  afterEach(async () => {
    clearReactions();
    try {
      await middleware?.stop();
    } catch {
      // ignore
    }
  });

  it("should run 3 heartbeat cycles with all evaluators", async () => {
    const clock = createTestClock();
    const onTick = vi.fn();

    // Create a mock Nexus client for evaluators that need it
    const mockNexusClient = {
      eventLog: { write: vi.fn().mockResolvedValue({ event_id: "e-1" }) },
      ace: { trajectories: {} },
      memory: {
        query: vi.fn().mockResolvedValue([]),
        store: vi.fn().mockResolvedValue({}),
      },
    } as never;

    const evaluators = [
      createChannelVisibilityEvaluator({ activeChannels: ["telegram"] }),
      createTriggerCheckEvaluator({ sources: ["nexus.events"] }),
      createReactionProcessorEvaluator({ handlers: {} }),
      createStuckRecoveryEvaluator({ staleThresholdMs: 60_000, action: "notify" }),
      createMemoryPromotionEvaluator(),
    ];

    middleware = new HeartbeatMiddleware({
      clock,
      intervalMs: 5000,
      evaluators,
      evaluatorTimeoutMs: 3000,
      nexusClient: mockNexusClient,
      onTick,
    });

    // Start a session
    await middleware.onSessionStart({ sessionId: "e2e-session", agentId: "e2e-agent" });

    // Run 3 heartbeat cycles
    for (let i = 0; i < 3; i++) {
      clock.advance(5000);
      await new Promise((r) => globalThis.setTimeout(r, 20));
    }

    expect(onTick).toHaveBeenCalledTimes(3);

    // Verify each tick result
    for (let i = 0; i < 3; i++) {
      const result = onTick.mock.calls[i]?.[0];
      expect(result.tickNumber).toBe(i + 1);
      expect(result.results.length).toBe(5);
      expect(result.overallPassed).toBe(true);
    }

    // Verify diagnostics
    const diagnostics = middleware.getDiagnostics();
    expect(diagnostics.length).toBe(3);

    // Verify status
    const status = middleware.status();
    expect(status.running).toBe(true);
    expect(status.tickNumber).toBe(3);
    expect(status.evaluatorCount).toBe(5);
  });

  it("should handle reactions across heartbeat cycles", async () => {
    const clock = createTestClock();
    const handler = vi.fn().mockResolvedValue(undefined);

    const evaluators = [
      createChannelVisibilityEvaluator({ activeChannels: ["slack"] }),
      createReactionProcessorEvaluator({ handlers: { "test-event": handler } }),
    ];

    middleware = new HeartbeatMiddleware({
      clock,
      intervalMs: 1000,
      evaluators,
    });

    middleware.start();

    // Enqueue reaction before first tick
    enqueueReaction("test-event", { data: "hello" });

    // First tick processes the reaction
    clock.advance(1000);
    await new Promise((r) => globalThis.setTimeout(r, 20));

    expect(handler).toHaveBeenCalledTimes(1);

    // Second tick — no reactions queued
    clock.advance(1000);
    await new Promise((r) => globalThis.setTimeout(r, 20));

    expect(handler).toHaveBeenCalledTimes(1); // Still 1
  });

  it("should verify tick performance (each tick < 5s)", async () => {
    const clock = createTestClock();
    const onTick = vi.fn();

    middleware = new HeartbeatMiddleware({
      clock,
      intervalMs: 1000,
      evaluators: [createChannelVisibilityEvaluator({ activeChannels: ["test"] })],
      onTick,
    });

    middleware.start();
    clock.advance(1000);
    await new Promise((r) => globalThis.setTimeout(r, 20));

    const result = onTick.mock.calls[0]?.[0];
    expect(result.totalLatencyMs).toBeLessThan(5000);
  });
});
