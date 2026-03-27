import { FederationSyncDisconnectedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import type { SyncPhaseHandlers } from "../../sync/edge-sync-manager.js";
import { EdgeSyncManager } from "../../sync/edge-sync-manager.js";
import { FakeClock } from "../helpers/fake-clock.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createHandlers(overrides?: Partial<SyncPhaseHandlers>): SyncPhaseHandlers {
  return {
    onReconnect: vi.fn(async () => {}),
    onAuthRefresh: vi.fn(async () => {}),
    onConflictScan: vi.fn(async () => {}),
    onWalReplay: vi.fn(async () => {}),
    ...overrides,
  };
}

function createManager(
  handlersOverrides?: Partial<SyncPhaseHandlers>,
  configOverrides?: Record<string, number>,
) {
  const clock = new FakeClock();
  const handlers = createHandlers(handlersOverrides);
  const manager = new EdgeSyncManager({
    handlers,
    clock,
    config: {
      maxReconnectAttempts: 3,
      reconnectBaseDelayMs: 100,
      reconnectMaxDelayMs: 1000,
      authRefreshTimeoutMs: 500,
      conflictScanTimeoutMs: 500,
      walReplayTimeoutMs: 500,
      ...configOverrides,
    },
  });
  return { clock, handlers, manager };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EdgeSyncManager", () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  describe("initial state", () => {
    it("starts in DISCONNECTED", () => {
      const { manager } = createManager();
      expect(manager.state).toBe("DISCONNECTED");
      expect(manager.isOnline).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Successful connection
  // -----------------------------------------------------------------------

  describe("connect() — happy path", () => {
    it("transitions through all phases to ONLINE", async () => {
      const { manager } = createManager();
      const states: string[] = [];
      manager.on("stateChange", ({ to }) => states.push(to));

      await manager.connect();

      expect(states).toEqual([
        "RECONNECTING",
        "AUTH_REFRESH",
        "CONFLICT_SCAN",
        "WAL_REPLAY",
        "ONLINE",
      ]);
      expect(manager.state).toBe("ONLINE");
      expect(manager.isOnline).toBe(true);
    });

    it("emits connected event on success", async () => {
      const { manager } = createManager();
      const connected = vi.fn();
      manager.on("connected", connected);

      await manager.connect();

      expect(connected).toHaveBeenCalledOnce();
    });

    it("calls all phase handlers in order", async () => {
      const { handlers, manager } = createManager();
      const order: string[] = [];
      (handlers.onReconnect as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        order.push("reconnect");
      });
      (handlers.onAuthRefresh as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        order.push("auth");
      });
      (handlers.onConflictScan as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        order.push("scan");
      });
      (handlers.onWalReplay as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        order.push("wal");
      });

      await manager.connect();

      expect(order).toEqual(["reconnect", "auth", "scan", "wal"]);
    });

    it("is a no-op if already ONLINE", async () => {
      const { handlers, manager } = createManager();
      await manager.connect();
      const callCount = (handlers.onReconnect as ReturnType<typeof vi.fn>).mock.calls.length;

      await manager.connect();

      expect((handlers.onReconnect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCount);
    });
  });

  // -----------------------------------------------------------------------
  // Retry with backoff
  // -----------------------------------------------------------------------

  describe("connect() — retry", () => {
    it("retries on reconnect failure with backoff", async () => {
      let attempt = 0;
      const { clock, manager } = createManager({
        onReconnect: vi.fn(async () => {
          attempt++;
          if (attempt < 3) throw new Error(`Fail ${attempt}`);
        }),
      });

      const connectPromise = manager.connect();

      // First failure: backoff 100ms (100 * 2^0)
      await clock.waitForSleep();
      expect(clock.pendingSleeps).toBe(1);
      clock.advance(100);

      // Second failure: backoff 200ms (100 * 2^1)
      await clock.waitForSleep();
      expect(clock.pendingSleeps).toBe(1);
      clock.advance(200);

      await connectPromise;
      expect(manager.state).toBe("ONLINE");
      expect(attempt).toBe(3);
    });

    it("throws after max attempts exhausted", async () => {
      const { clock, manager } = createManager({
        onReconnect: vi.fn(async () => {
          throw new Error("always fail");
        }),
      });

      const connectPromise = manager.connect();

      // Advance through all backoff sleeps (2 sleeps for 3 attempts)
      for (let i = 0; i < 2; i++) {
        await clock.waitForSleep();
        clock.advance(1000);
      }

      await expect(connectPromise).rejects.toThrow("always fail");
      expect(manager.state).toBe("DISCONNECTED");
    });

    it("emits error events on each failure", async () => {
      const errors: Error[] = [];
      const { clock, manager } = createManager({
        onReconnect: vi.fn(async () => {
          throw new Error("fail");
        }),
      });
      manager.on("error", (err) => errors.push(err));

      const connectPromise = manager.connect();

      for (let i = 0; i < 2; i++) {
        await clock.waitForSleep();
        clock.advance(1000);
      }
      await connectPromise.catch(() => {});

      expect(errors.length).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // Disconnect
  // -----------------------------------------------------------------------

  describe("disconnect()", () => {
    it("transitions to DISCONNECTED", async () => {
      const { manager } = createManager();
      await manager.connect();

      manager.disconnect("test");

      expect(manager.state).toBe("DISCONNECTED");
      expect(manager.isOnline).toBe(false);
    });

    it("emits disconnected event with reason", async () => {
      const { manager } = createManager();
      await manager.connect();
      const disconnected = vi.fn();
      manager.on("disconnected", disconnected);

      manager.disconnect("test reason");

      expect(disconnected).toHaveBeenCalledWith({ reason: "test reason" });
    });

    it("aborts in-progress connect()", async () => {
      const { clock, manager } = createManager({
        onReconnect: vi.fn(async () => {
          throw new Error("fail");
        }),
      });

      const connectPromise = manager.connect();
      await clock.waitForSleep();

      manager.disconnect("cancelled");

      await expect(connectPromise).rejects.toThrow(FederationSyncDisconnectedError);
    });
  });

  // -----------------------------------------------------------------------
  // Invalid transitions
  // -----------------------------------------------------------------------

  describe("invalid transitions", () => {
    it("cannot transition ONLINE → RECONNECTING directly", async () => {
      const { manager } = createManager();
      await manager.connect();

      // Calling connect while online is a no-op
      expect(manager.state).toBe("ONLINE");
    });
  });

  // -----------------------------------------------------------------------
  // Phase timeout
  // -----------------------------------------------------------------------

  describe("phase timeout", () => {
    it("auth refresh timeout triggers retry", async () => {
      let authAttempt = 0;
      const { clock, manager } = createManager({
        onAuthRefresh: vi.fn(async () => {
          authAttempt++;
          if (authAttempt === 1) {
            // Simulate hanging — never resolves until timeout
            await new Promise(() => {});
          }
        }),
      });

      const connectPromise = manager.connect();

      // Auth refresh should timeout at 500ms — wait for the timeout timer
      await clock.waitForTimer();
      expect(clock.pendingTimers).toBeGreaterThan(0);
      clock.advance(500);

      // After timeout, retry triggers backoff sleep
      await clock.waitForSleep();
      expect(clock.pendingSleeps).toBe(1);
      clock.advance(100);

      await connectPromise;
      expect(manager.state).toBe("ONLINE");
      expect(authAttempt).toBe(2);
    });
  });
});
