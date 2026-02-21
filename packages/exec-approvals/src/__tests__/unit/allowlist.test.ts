import { describe, expect, it } from "vitest";
import { AllowlistStore } from "../../allowlist.js";

describe("AllowlistStore", () => {
  it("should start empty", () => {
    const store = new AllowlistStore(500);
    expect(store.size).toBe(0);
    expect(store.isDirty()).toBe(false);
  });

  it("should record approvals", () => {
    const store = new AllowlistStore(500);
    const entry = store.recordApproval("git commit", 5);
    expect(entry.pattern).toBe("git commit");
    expect(entry.approvalCount).toBe(1);
    expect(entry.autoPromoted).toBe(false);
    expect(store.has("git commit")).toBe(true);
    expect(store.isDirty()).toBe(true);
  });

  it("should increment approval count", () => {
    const store = new AllowlistStore(500);
    store.recordApproval("git commit", 5);
    store.recordApproval("git commit", 5);
    store.recordApproval("git commit", 5);
    const entry = store.get("git commit");
    expect(entry?.approvalCount).toBe(3);
    expect(entry?.autoPromoted).toBe(false);
  });

  it("should auto-promote at threshold", () => {
    const store = new AllowlistStore(500);
    for (let i = 0; i < 5; i++) {
      store.recordApproval("git commit", 5);
    }
    const entry = store.get("git commit");
    expect(entry?.approvalCount).toBe(5);
    expect(entry?.autoPromoted).toBe(true);
  });

  it("should auto-promote beyond threshold", () => {
    const store = new AllowlistStore(500);
    for (let i = 0; i < 7; i++) {
      store.recordApproval("git commit", 5);
    }
    const entry = store.get("git commit");
    expect(entry?.approvalCount).toBe(7);
    expect(entry?.autoPromoted).toBe(true);
  });

  it("should respect maxPatterns cap", () => {
    const store = new AllowlistStore(3);
    store.recordApproval("cmd-1", 5);
    store.recordApproval("cmd-2", 5);
    store.recordApproval("cmd-3", 5);
    expect(store.size).toBe(3);

    // Adding a 4th should evict the oldest
    store.recordApproval("cmd-4", 5);
    expect(store.size).toBe(3);
    expect(store.has("cmd-4")).toBe(true);
  });

  it("should track dirty flag", () => {
    const store = new AllowlistStore(500);
    expect(store.isDirty()).toBe(false);
    store.recordApproval("test", 5);
    expect(store.isDirty()).toBe(true);
    store.markClean();
    expect(store.isDirty()).toBe(false);
  });

  it("should serialize to array", () => {
    const store = new AllowlistStore(500);
    store.recordApproval("cmd-a", 5);
    store.recordApproval("cmd-b", 5);
    const arr = store.toArray();
    expect(arr).toHaveLength(2);
    expect(arr.map((e) => e.pattern)).toContain("cmd-a");
    expect(arr.map((e) => e.pattern)).toContain("cmd-b");
  });

  it("should load from array", () => {
    const store = new AllowlistStore(500);
    store.loadFrom([
      { pattern: "cmd-a", approvalCount: 3, autoPromoted: false, lastApprovedAt: 1000 },
      { pattern: "cmd-b", approvalCount: 5, autoPromoted: true, lastApprovedAt: 2000 },
    ]);
    expect(store.size).toBe(2);
    expect(store.get("cmd-a")?.approvalCount).toBe(3);
    expect(store.get("cmd-b")?.autoPromoted).toBe(true);
    expect(store.isDirty()).toBe(false);
  });

  it("should auto-promote with threshold of 1", () => {
    const store = new AllowlistStore(500);
    const entry = store.recordApproval("quick-cmd", 1);
    expect(entry.autoPromoted).toBe(true);
    expect(entry.approvalCount).toBe(1);
  });

  // --- Edge case tests ---

  describe("eviction edge cases", () => {
    it("should handle eviction with identical timestamps", () => {
      const store = new AllowlistStore(2);
      // Use Date.now mock to control timestamps
      const now = Date.now();
      const origDateNow = Date.now;
      Date.now = () => now;

      store.recordApproval("cmd-a", 5);
      store.recordApproval("cmd-b", 5);

      Date.now = () => now + 1;
      store.recordApproval("cmd-c", 5);

      // Should still have exactly 2 entries
      expect(store.size).toBe(2);
      expect(store.has("cmd-c")).toBe(true);

      Date.now = origDateNow;
    });

    it("should handle multiple consecutive evictions at cap", () => {
      const store = new AllowlistStore(2);
      store.recordApproval("cmd-1", 5);
      store.recordApproval("cmd-2", 5);
      store.recordApproval("cmd-3", 5);
      store.recordApproval("cmd-4", 5);
      store.recordApproval("cmd-5", 5);

      expect(store.size).toBe(2);
      expect(store.has("cmd-4")).toBe(true);
      expect(store.has("cmd-5")).toBe(true);
    });

    it("should handle eviction after loadFrom with stale timestamps", () => {
      const store = new AllowlistStore(2);

      // Load entries with old timestamps
      store.loadFrom([
        { pattern: "old-1", approvalCount: 10, autoPromoted: true, lastApprovedAt: 100 },
        { pattern: "old-2", approvalCount: 10, autoPromoted: true, lastApprovedAt: 200 },
      ]);

      // New entry should evict the oldest (old-1 at timestamp 100)
      store.recordApproval("new-1", 5);

      expect(store.size).toBe(2);
      expect(store.has("old-1")).toBe(false);
      expect(store.has("old-2")).toBe(true);
      expect(store.has("new-1")).toBe(true);
    });
  });

  describe("toDirtyEntries", () => {
    it("should return only modified entries", () => {
      const store = new AllowlistStore(500);

      // Load some clean entries
      store.loadFrom([
        { pattern: "clean-1", approvalCount: 3, autoPromoted: false, lastApprovedAt: 1000 },
        { pattern: "clean-2", approvalCount: 5, autoPromoted: true, lastApprovedAt: 2000 },
      ]);

      // Modify one and add a new one
      store.recordApproval("clean-1", 5);
      store.recordApproval("new-1", 5);

      const dirty = store.toDirtyEntries();
      expect(dirty).toHaveLength(2);

      const patterns = dirty.map((e) => e.pattern);
      expect(patterns).toContain("clean-1");
      expect(patterns).toContain("new-1");
      expect(patterns).not.toContain("clean-2");
    });

    it("should return empty array when nothing is dirty", () => {
      const store = new AllowlistStore(500);
      store.loadFrom([
        { pattern: "cmd-a", approvalCount: 3, autoPromoted: false, lastApprovedAt: 1000 },
      ]);

      expect(store.toDirtyEntries()).toHaveLength(0);
    });

    it("should clear dirty entries on markClean", () => {
      const store = new AllowlistStore(500);
      store.recordApproval("cmd-a", 5);
      expect(store.toDirtyEntries()).toHaveLength(1);

      store.markClean();
      expect(store.toDirtyEntries()).toHaveLength(0);
    });
  });
});
