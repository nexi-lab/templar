import { describe, expect, it } from "vitest";
import { ConnectionTracker } from "../server/connection-tracker.js";

describe("ConnectionTracker", () => {
  it("acquires a connection slot when under limit", () => {
    const tracker = new ConnectionTracker(10);
    expect(tracker.acquire()).toBe(true);
    expect(tracker.activeCount).toBe(1);
  });

  it("rejects when at capacity", () => {
    const tracker = new ConnectionTracker(2);
    expect(tracker.acquire()).toBe(true);
    expect(tracker.acquire()).toBe(true);
    expect(tracker.acquire()).toBe(false);
    expect(tracker.activeCount).toBe(2);
  });

  it("allows acquisition after release", () => {
    const tracker = new ConnectionTracker(1);
    expect(tracker.acquire()).toBe(true);
    expect(tracker.acquire()).toBe(false);
    tracker.release();
    expect(tracker.activeCount).toBe(0);
    expect(tracker.acquire()).toBe(true);
  });

  it("does not go below zero on extra release", () => {
    const tracker = new ConnectionTracker(10);
    tracker.release();
    tracker.release();
    expect(tracker.activeCount).toBe(0);
  });

  it("tracks multiple connections correctly", () => {
    const tracker = new ConnectionTracker(5);
    for (let i = 0; i < 5; i++) {
      expect(tracker.acquire()).toBe(true);
    }
    expect(tracker.activeCount).toBe(5);
    expect(tracker.acquire()).toBe(false);

    tracker.release();
    tracker.release();
    expect(tracker.activeCount).toBe(3);
    expect(tracker.acquire()).toBe(true);
    expect(tracker.activeCount).toBe(4);
  });

  it("reports maxConnections", () => {
    const tracker = new ConnectionTracker(42);
    expect(tracker.maxConnections).toBe(42);
  });
});
