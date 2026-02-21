import { afterEach, describe, expect, it, vi } from "vitest";
import { PACKAGE_NAME } from "../../constants.js";
import { HeartbeatMiddleware } from "../../middleware.js";
import type { Clock, HeartbeatEvaluator } from "../../types.js";

interface ScheduledTimer {
  fn: () => void;
  ms: number;
  id: number;
}

function createTestClock(): Clock & {
  advance(ms: number): void;
  pending: ScheduledTimer[];
  currentTime: number;
} {
  let time = 1000;
  let nextId = 1;
  const pending: ScheduledTimer[] = [];

  const clock: Clock & {
    advance(ms: number): void;
    pending: ScheduledTimer[];
    currentTime: number;
  } = {
    get currentTime() {
      return time;
    },
    now: () => time,
    setTimeout: (fn: () => void, ms: number) => {
      const id = nextId++;
      pending.push({ fn, ms, id });
      return id as unknown as ReturnType<typeof globalThis.setTimeout>;
    },
    clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => {
      const idx = pending.findIndex((t) => t.id === (id as unknown as number));
      if (idx !== -1) pending.splice(idx, 1);
    },
    advance: (ms: number) => {
      time += ms;
      // Fire any timers whose delay has elapsed
      const ready = pending.filter((t) => t.ms <= ms);
      for (const timer of ready) {
        const idx = pending.indexOf(timer);
        if (idx !== -1) pending.splice(idx, 1);
        timer.fn();
      }
    },
    pending,
  };

  return clock;
}

function createPassEvaluator(name: string): HeartbeatEvaluator {
  return {
    name,
    criticality: "optional",
    evaluate: vi.fn().mockResolvedValue({
      evaluator: name,
      kind: "check",
      passed: true,
      earlyExit: false,
      latencyMs: 1,
    }),
  };
}

describe("HeartbeatMiddleware", () => {
  let middleware: HeartbeatMiddleware;

  afterEach(async () => {
    try {
      await middleware?.stop();
    } catch {
      // ignore
    }
  });

  it("should have correct name", () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock });
    expect(middleware.name).toBe(PACKAGE_NAME);
  });

  it("should start and stop without errors", async () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock, intervalMs: 100 });

    middleware.start();
    expect(middleware.status().running).toBe(true);

    await middleware.stop();
    expect(middleware.status().running).toBe(false);
  });

  it("should be idempotent on multiple start() calls", () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock, intervalMs: 100 });

    middleware.start();
    middleware.start();
    middleware.start();

    // Should only have one pending timer
    expect(clock.pending.length).toBe(1);
    expect(middleware.status().running).toBe(true);
  });

  it("should execute tick after interval", async () => {
    const clock = createTestClock();
    const evaluator = createPassEvaluator("test");
    middleware = new HeartbeatMiddleware({
      clock,
      intervalMs: 100,
      evaluators: [evaluator],
    });

    middleware.start();
    expect(clock.pending.length).toBe(1);

    // Trigger the timer
    clock.advance(100);

    // Let microtasks run
    await new Promise((r) => globalThis.setTimeout(r, 10));

    expect(evaluator.evaluate).toHaveBeenCalledTimes(1);
    expect(middleware.status().tickNumber).toBe(1);
  });

  it("should update lastActivityTimestamp on onAfterTurn", async () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock });

    const before = middleware.status().lastActivityTimestamp;
    clock.advance(500);

    await middleware.onAfterTurn({ sessionId: "s-1", turnNumber: 1 });

    expect(middleware.status().lastActivityTimestamp).toBeGreaterThan(before);
  });

  it("should start on onSessionStart", async () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock, intervalMs: 100 });

    await middleware.onSessionStart({ sessionId: "s-1", agentId: "agent-1" });

    expect(middleware.status().running).toBe(true);
  });

  it("should stop on onSessionEnd", async () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock, intervalMs: 100 });

    await middleware.onSessionStart({ sessionId: "s-1" });
    await middleware.onSessionEnd({ sessionId: "s-1" });

    expect(middleware.status().running).toBe(false);
  });

  it("should store diagnostics in ring buffer", async () => {
    const clock = createTestClock();
    const evaluator = createPassEvaluator("diag-test");
    middleware = new HeartbeatMiddleware({
      clock,
      intervalMs: 100,
      evaluators: [evaluator],
      diagnosticsBufferSize: 5,
    });

    middleware.start();

    // Execute 3 ticks
    for (let i = 0; i < 3; i++) {
      clock.advance(100);
      await new Promise((r) => globalThis.setTimeout(r, 10));
    }

    const diagnostics = middleware.getDiagnostics();
    expect(diagnostics.length).toBe(3);
    expect(diagnostics[0]?.tickNumber).toBe(1);
    expect(diagnostics[2]?.tickNumber).toBe(3);
  });

  it("should invoke onTick callback", async () => {
    const clock = createTestClock();
    const onTick = vi.fn();
    middleware = new HeartbeatMiddleware({
      clock,
      intervalMs: 100,
      evaluators: [createPassEvaluator("cb-test")],
      onTick,
    });

    middleware.start();
    clock.advance(100);
    await new Promise((r) => globalThis.setTimeout(r, 10));

    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick.mock.calls[0]?.[0].tickNumber).toBe(1);
  });

  it("should handle stop() when not running", async () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock });

    // Should not throw
    await middleware.stop();
    expect(middleware.status().running).toBe(false);
  });

  it("should return healthy status with zero evaluators", () => {
    const clock = createTestClock();
    middleware = new HeartbeatMiddleware({ clock });

    const status = middleware.status();
    expect(status.health).toBe("healthy");
    expect(status.evaluatorCount).toBe(0);
  });
});
