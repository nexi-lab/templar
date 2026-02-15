import { beforeEach, describe, expect, it, vi } from "vitest";
import { RestartTracker } from "../../process.js";

describe("RestartTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("allows restarts within limit", () => {
    const tracker = new RestartTracker(3, 300_000);
    expect(tracker.canRestart()).toBe(true);
    tracker.recordRestart();
    expect(tracker.canRestart()).toBe(true);
    tracker.recordRestart();
    expect(tracker.canRestart()).toBe(true);
    tracker.recordRestart();
    expect(tracker.canRestart()).toBe(false);
  });

  it("resets restart count", () => {
    const tracker = new RestartTracker(2, 300_000);
    tracker.recordRestart();
    tracker.recordRestart();
    expect(tracker.canRestart()).toBe(false);
    tracker.reset();
    expect(tracker.canRestart()).toBe(true);
  });

  it("prunes old timestamps outside window", () => {
    const tracker = new RestartTracker(2, 60_000);
    tracker.recordRestart();
    tracker.recordRestart();
    expect(tracker.canRestart()).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(61_000);
    expect(tracker.canRestart()).toBe(true);
  });

  it("calculates exponential backoff", () => {
    const tracker = new RestartTracker(5, 300_000);
    expect(tracker.getBackoffMs()).toBe(1000); // 2^0 * 1000

    tracker.recordRestart();
    expect(tracker.getBackoffMs()).toBe(2000); // 2^1 * 1000

    tracker.recordRestart();
    expect(tracker.getBackoffMs()).toBe(4000); // 2^2 * 1000

    tracker.recordRestart();
    expect(tracker.getBackoffMs()).toBe(8000); // 2^3 * 1000
  });

  it("caps backoff at 30 seconds", () => {
    const tracker = new RestartTracker(10, 300_000);
    for (let i = 0; i < 8; i++) {
      tracker.recordRestart();
    }
    // 2^8 * 1000 = 256000, capped at 30000
    expect(tracker.getBackoffMs()).toBeLessThanOrEqual(30_000);
  });

  it("handles zero maxRestarts", () => {
    const tracker = new RestartTracker(0, 300_000);
    expect(tracker.canRestart()).toBe(false);
  });
});
