import type { Clock } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { InMemoryEventSource } from "../../reaction/event-source.js";
import { ReactionMiddleware } from "../../reaction/middleware.js";
import type { NexusEvent } from "../../reaction/types.js";

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
      // Fire any pending timers
      const toFire = pending.filter((p) => p.fireAt <= time);
      for (const timer of toFire) {
        const idx = pending.indexOf(timer);
        if (idx >= 0) pending.splice(idx, 1);
        timer.fn();
      }
    },
  };
}

function createTestEvent(type: string, payload: Record<string, unknown> = {}): NexusEvent {
  return { id: `evt-${Date.now()}`, type, timestamp: Date.now(), payload };
}

describe("ReactionMiddleware", () => {
  it("should match events and fire reactions", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();
    const clock = createTestClock();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.file.*", probability: 1.0, cooldown: "0s", action: "review" }],
      onReaction,
      eventSource,
      clock,
      rng: () => 0.5, // Always below probability=1.0
    });

    await middleware.onSessionStart({ sessionId: "test" });

    eventSource.emit(createTestEvent("nexus.file.created"));

    // Wait for async handler
    await new Promise((r) => globalThis.setTimeout(r, 10));

    expect(onReaction).toHaveBeenCalledTimes(1);
    expect(middleware.getReactionCount()).toBe(1);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should not fire when probability gate blocks", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();
    const clock = createTestClock();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.file.*", probability: 0.5, cooldown: "0s", action: "review" }],
      onReaction,
      eventSource,
      clock,
      rng: () => 0.8, // Above probability=0.5 → blocked
    });

    await middleware.onSessionStart({ sessionId: "test" });
    eventSource.emit(createTestEvent("nexus.file.created"));

    await new Promise((r) => globalThis.setTimeout(r, 10));

    expect(onReaction).not.toHaveBeenCalled();
    expect(middleware.getReactionCount()).toBe(0);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should enforce cooldown", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();
    const clock = createTestClock();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.file.*", probability: 1.0, cooldown: "10m", action: "review" }],
      onReaction,
      eventSource,
      clock,
      rng: () => 0.5,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    // First event — should fire
    eventSource.emit(createTestEvent("nexus.file.created"));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).toHaveBeenCalledTimes(1);

    // Second event immediately — should be blocked by cooldown
    eventSource.emit(createTestEvent("nexus.file.created"));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).toHaveBeenCalledTimes(1);

    // Advance past cooldown (10 minutes)
    clock.advance(600_001);

    // Third event — should fire again
    eventSource.emit(createTestEvent("nexus.file.created"));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).toHaveBeenCalledTimes(2);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should not fire for non-matching events", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.file.*", probability: 1.0, cooldown: "0s", action: "review" }],
      onReaction,
      eventSource,
      rng: () => 0.5,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    eventSource.emit(createTestEvent("nexus.agent.mentioned"));

    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).not.toHaveBeenCalled();

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should apply match filters", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();

    const middleware = new ReactionMiddleware({
      patterns: [
        {
          event: "nexus.agent.mentioned",
          match: { channel: "slack" },
          probability: 1.0,
          cooldown: "0s",
          action: "respond",
        },
      ],
      onReaction,
      eventSource,
      rng: () => 0.5,
    });

    await middleware.onSessionStart({ sessionId: "test" });

    // Event with matching filter
    eventSource.emit(createTestEvent("nexus.agent.mentioned", { channel: "slack" }));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).toHaveBeenCalledTimes(1);

    // Event with non-matching filter
    eventSource.emit(createTestEvent("nexus.agent.mentioned", { channel: "discord" }));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).toHaveBeenCalledTimes(1);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should gracefully handle onReaction errors", async () => {
    const onReaction = vi.fn().mockRejectedValue(new Error("handler error"));
    const eventSource = new InMemoryEventSource();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.file.*", probability: 1.0, cooldown: "0s", action: "review" }],
      onReaction,
      eventSource,
      rng: () => 0.5,
    });

    await middleware.onSessionStart({ sessionId: "test" });
    eventSource.emit(createTestEvent("nexus.file.created"));

    await new Promise((r) => globalThis.setTimeout(r, 10));

    // Should not crash — error is swallowed
    expect(onReaction).toHaveBeenCalledTimes(1);
    expect(middleware.getReactionCount()).toBe(1);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should fire for probability boundary 1.0", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.*", probability: 1.0, cooldown: "0s", action: "test" }],
      onReaction,
      eventSource,
      rng: () => 0.999, // Just under 1.0
    });

    await middleware.onSessionStart({ sessionId: "test" });
    eventSource.emit(createTestEvent("nexus.test"));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).toHaveBeenCalledTimes(1);

    await middleware.onSessionEnd({ sessionId: "test" });
  });

  it("should never fire for probability 0", async () => {
    const onReaction = vi.fn().mockResolvedValue(undefined);
    const eventSource = new InMemoryEventSource();

    const middleware = new ReactionMiddleware({
      patterns: [{ event: "nexus.*", probability: 0, cooldown: "0s", action: "test" }],
      onReaction,
      eventSource,
      rng: () => 0.0, // Lowest possible, but 0 >= 0 is true → blocked
    });

    await middleware.onSessionStart({ sessionId: "test" });
    eventSource.emit(createTestEvent("nexus.test"));
    await new Promise((r) => globalThis.setTimeout(r, 10));
    expect(onReaction).not.toHaveBeenCalled();

    await middleware.onSessionEnd({ sessionId: "test" });
  });
});
