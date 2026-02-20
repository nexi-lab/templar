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
});
