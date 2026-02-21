import { describe, expect, it, vi } from "vitest";
import { InMemoryEventSource, PollingEventSource } from "../../reaction/event-source.js";
import type { NexusEvent } from "../../reaction/types.js";
import type { Clock } from "@templar/core";

function createTestEvent(type: string): NexusEvent {
  return { id: "evt-1", type, timestamp: Date.now(), payload: {} };
}

describe("InMemoryEventSource", () => {
  it("should deliver events to handler after start", () => {
    const source = new InMemoryEventSource();
    const handler = vi.fn();

    source.start(handler);
    source.emit(createTestEvent("test.event"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: "test.event" }));
  });

  it("should not deliver events before start", () => {
    const source = new InMemoryEventSource();
    const handler = vi.fn();

    source.emit(createTestEvent("test.event"));
    source.start(handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it("should stop delivering events after stop", async () => {
    const source = new InMemoryEventSource();
    const handler = vi.fn();

    source.start(handler);
    await source.stop();
    source.emit(createTestEvent("test.event"));

    expect(handler).not.toHaveBeenCalled();
  });

  it("should report started state", async () => {
    const source = new InMemoryEventSource();
    expect(source.isStarted()).toBe(false);

    source.start(vi.fn());
    expect(source.isStarted()).toBe(true);

    await source.stop();
    expect(source.isStarted()).toBe(false);
  });
});

describe("PollingEventSource", () => {
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

  it("should poll and deliver events on interval", async () => {
    const clock = createTestClock();
    const events = [createTestEvent("test.event")];
    const provider = vi.fn().mockResolvedValue(events);
    const handler = vi.fn();

    const source = new PollingEventSource({
      clock,
      intervalMs: 1000,
      provider,
    });

    source.start(handler);
    clock.advance(1001);

    // Wait for async poll to complete
    await new Promise((r) => globalThis.setTimeout(r, 20));

    expect(provider).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);

    await source.stop();
  });

  it("should continue polling after provider error", async () => {
    const clock = createTestClock();
    const provider = vi.fn()
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce([createTestEvent("recovered")]);
    const handler = vi.fn();

    const source = new PollingEventSource({
      clock,
      intervalMs: 1000,
      provider,
    });

    source.start(handler);

    // First poll — error
    clock.advance(1001);
    await new Promise((r) => globalThis.setTimeout(r, 20));
    expect(handler).not.toHaveBeenCalled();

    // Second poll — success
    clock.advance(1001);
    await new Promise((r) => globalThis.setTimeout(r, 20));
    expect(handler).toHaveBeenCalledTimes(1);

    await source.stop();
  });
});
