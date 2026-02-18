import {
  SpawnChildLimitError,
  SpawnConcurrencyLimitError,
  SpawnDepthExceededError,
  SpawnGovernanceError,
} from "@templar/errors";
import { describe, expect, it } from "vitest";
import { DEFAULT_SPAWN_LIMITS, SpawnGuard } from "../spawn-guard.js";

describe("SpawnGuard", () => {
  // -------------------------------------------------------------------------
  // Defaults
  // -------------------------------------------------------------------------
  describe("defaults", () => {
    it("should use default maxSpawnDepth of 2", () => {
      const guard = new SpawnGuard();
      expect(guard.maxDepth).toBe(DEFAULT_SPAWN_LIMITS.maxSpawnDepth);
      expect(guard.maxDepth).toBe(2);
    });

    it("should use default maxChildrenPerAgent of 5", () => {
      const guard = new SpawnGuard();
      expect(guard.childLimit).toBe(DEFAULT_SPAWN_LIMITS.maxChildrenPerAgent);
      expect(guard.childLimit).toBe(5);
    });

    it("should use default maxConcurrent of 8", () => {
      const guard = new SpawnGuard();
      expect(guard.concurrencyLimit).toBe(DEFAULT_SPAWN_LIMITS.maxConcurrent);
      expect(guard.concurrencyLimit).toBe(8);
    });

    it("should start with empty state", () => {
      const guard = new SpawnGuard();
      const state = guard.getState();
      expect(state.activeConcurrent).toBe(0);
      expect(state.totalSpawns).toBe(0);
      expect(state.activeByParent.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // DEFAULT_SPAWN_LIMITS export
  // -------------------------------------------------------------------------
  describe("DEFAULT_SPAWN_LIMITS", () => {
    it("should have maxSpawnDepth of 2", () => {
      expect(DEFAULT_SPAWN_LIMITS.maxSpawnDepth).toBe(2);
    });

    it("should have maxChildrenPerAgent of 5", () => {
      expect(DEFAULT_SPAWN_LIMITS.maxChildrenPerAgent).toBe(5);
    });

    it("should have maxConcurrent of 8", () => {
      expect(DEFAULT_SPAWN_LIMITS.maxConcurrent).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // Depth checks
  // -------------------------------------------------------------------------
  describe("depth checks", () => {
    it("should allow spawn at depth 0 (root agent)", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 2 });
      expect(() => guard.checkSpawn("root", 1)).not.toThrow();
    });

    it("should allow spawn at depth exactly equal to maxSpawnDepth", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 2 });
      expect(() => guard.checkSpawn("parent", 2)).not.toThrow();
    });

    it("should allow spawn at depth one below maxSpawnDepth", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 3 });
      expect(() => guard.checkSpawn("parent", 2)).not.toThrow();
    });

    it("should throw SpawnDepthExceededError when depth > maxSpawnDepth", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 2 });
      expect(() => guard.checkSpawn("parent", 3)).toThrow(SpawnDepthExceededError);
    });

    it("should include correct depth info in SpawnDepthExceededError", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 1 });
      try {
        guard.checkSpawn("parent", 2);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnDepthExceededError);
        const e = error as SpawnDepthExceededError;
        expect(e.currentDepth).toBe(2);
        expect(e.maxSpawnDepth).toBe(1);
      }
    });

    it("should block all spawns when maxSpawnDepth is 0", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 0 });
      expect(() => guard.checkSpawn("root", 1)).toThrow(SpawnDepthExceededError);
    });

    it("SpawnDepthExceededError should be instanceof SpawnGovernanceError", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 0 });
      try {
        guard.checkSpawn("root", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnGovernanceError);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Per-parent child limit checks
  // -------------------------------------------------------------------------
  describe("per-parent child limit checks", () => {
    it("should allow first child for a parent", () => {
      const guard = new SpawnGuard({ maxChildrenPerAgent: 3, maxSpawnDepth: 5 });
      expect(() => guard.checkSpawn("parentA", 1)).not.toThrow();
    });

    it("should throw SpawnChildLimitError when children = maxChildrenPerAgent", () => {
      const guard = new SpawnGuard({
        maxChildrenPerAgent: 2,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });
      // Record 2 spawns for parentA
      guard.checkSpawn("parentA", 1);
      guard.recordSpawn("parentA");
      guard.checkSpawn("parentA", 1);
      guard.recordSpawn("parentA");

      // Third spawn for parentA should be blocked
      expect(() => guard.checkSpawn("parentA", 1)).toThrow(SpawnChildLimitError);
    });

    it("should include correct info in SpawnChildLimitError", () => {
      const guard = new SpawnGuard({
        maxChildrenPerAgent: 1,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });
      guard.checkSpawn("parentA", 1);
      guard.recordSpawn("parentA");

      try {
        guard.checkSpawn("parentA", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnChildLimitError);
        const e = error as SpawnChildLimitError;
        expect(e.parentAgentId).toBe("parentA");
        expect(e.activeChildren).toBe(1);
        expect(e.maxChildrenPerAgent).toBe(1);
      }
    });

    it("should allow parentB to spawn when parentA is at limit", () => {
      const guard = new SpawnGuard({
        maxChildrenPerAgent: 1,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });
      guard.checkSpawn("parentA", 1);
      guard.recordSpawn("parentA");

      // parentA blocked
      expect(() => guard.checkSpawn("parentA", 1)).toThrow(SpawnChildLimitError);

      // parentB should still be able to spawn
      expect(() => guard.checkSpawn("parentB", 1)).not.toThrow();
    });

    it("should block all parents when maxChildrenPerAgent is 0", () => {
      const guard = new SpawnGuard({
        maxChildrenPerAgent: 0,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });
      expect(() => guard.checkSpawn("parentA", 1)).toThrow(SpawnChildLimitError);
    });
  });

  // -------------------------------------------------------------------------
  // Global concurrency checks
  // -------------------------------------------------------------------------
  describe("global concurrency checks", () => {
    it("should allow spawns up to maxConcurrent", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 3,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      for (let i = 0; i < 3; i++) {
        guard.checkSpawn(`parent${i}`, 1);
        guard.recordSpawn(`parent${i}`);
      }
      expect(guard.getState().activeConcurrent).toBe(3);
    });

    it("should throw SpawnConcurrencyLimitError at maxConcurrent", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 2,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      guard.checkSpawn("p1", 1);
      guard.recordSpawn("p1");
      guard.checkSpawn("p2", 1);
      guard.recordSpawn("p2");

      expect(() => guard.checkSpawn("p3", 1)).toThrow(SpawnConcurrencyLimitError);
    });

    it("should include correct info in SpawnConcurrencyLimitError", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 1,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      guard.checkSpawn("p1", 1);
      guard.recordSpawn("p1");

      try {
        guard.checkSpawn("p2", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnConcurrencyLimitError);
        const e = error as SpawnConcurrencyLimitError;
        expect(e.activeConcurrent).toBe(1);
        expect(e.maxConcurrent).toBe(1);
      }
    });

    it("should allow new spawn after completion frees a slot", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 1,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      guard.checkSpawn("p1", 1);
      guard.recordSpawn("p1");

      // Blocked
      expect(() => guard.checkSpawn("p2", 1)).toThrow(SpawnConcurrencyLimitError);

      // Release
      guard.recordCompletion("p1");

      // Now allowed
      expect(() => guard.checkSpawn("p2", 1)).not.toThrow();
    });

    it("should block everything when maxConcurrent is 0", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 0,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      expect(() => guard.checkSpawn("p1", 1)).toThrow(SpawnConcurrencyLimitError);
    });
  });

  // -------------------------------------------------------------------------
  // State management
  // -------------------------------------------------------------------------
  describe("state management", () => {
    it("should track totalSpawns including completed", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      guard.recordSpawn("p1");
      guard.recordSpawn("p1");
      guard.recordCompletion("p1");
      expect(guard.getState().totalSpawns).toBe(2);
      expect(guard.getState().activeConcurrent).toBe(1);
    });

    it("should return immutable state snapshots (different references)", () => {
      const guard = new SpawnGuard();
      const before = guard.getState();
      guard.recordSpawn("p1");
      const after = guard.getState();
      expect(before).not.toBe(after);
      expect(before.activeConcurrent).toBe(0);
      expect(after.activeConcurrent).toBe(1);
    });

    it("should remove parent entry when all children complete", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      guard.recordSpawn("p1");
      guard.recordSpawn("p1");
      expect(guard.getState().activeByParent.get("p1")).toBe(2);

      guard.recordCompletion("p1");
      expect(guard.getState().activeByParent.get("p1")).toBe(1);

      guard.recordCompletion("p1");
      expect(guard.getState().activeByParent.has("p1")).toBe(false);
    });

    it("should no-op when completing an untracked parent", () => {
      const guard = new SpawnGuard();
      guard.recordCompletion("unknown");
      const state = guard.getState();
      expect(state.activeConcurrent).toBe(0);
      expect(state.totalSpawns).toBe(0);
      expect(state.activeByParent.size).toBe(0);
    });

    it("should not corrupt state when completing unknown parent with active spawns", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      guard.recordSpawn("p1");
      expect(guard.getState().activeConcurrent).toBe(1);

      // Complete an unknown parent — should not decrement activeConcurrent
      guard.recordCompletion("unknown");
      expect(guard.getState().activeConcurrent).toBe(1);
      expect(guard.getState().activeByParent.get("p1")).toBe(1);
    });

    it("should track multiple parents independently", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      guard.recordSpawn("p1");
      guard.recordSpawn("p1");
      guard.recordSpawn("p2");

      const state = guard.getState();
      expect(state.activeByParent.get("p1")).toBe(2);
      expect(state.activeByParent.get("p2")).toBe(1);
      expect(state.activeConcurrent).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  describe("reset()", () => {
    it("should return all counters to initial state", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      guard.recordSpawn("p1");
      guard.recordSpawn("p2");
      expect(guard.getState().activeConcurrent).toBe(2);

      guard.reset();

      const state = guard.getState();
      expect(state.activeConcurrent).toBe(0);
      expect(state.totalSpawns).toBe(0);
      expect(state.activeByParent.size).toBe(0);
    });

    it("should allow spawns after reset even if previously at limit", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 1,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      guard.checkSpawn("p1", 1);
      guard.recordSpawn("p1");
      expect(() => guard.checkSpawn("p2", 1)).toThrow(SpawnConcurrencyLimitError);

      guard.reset();
      expect(() => guard.checkSpawn("p2", 1)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Check ordering (depth first, then children, then concurrency)
  // -------------------------------------------------------------------------
  describe("check ordering", () => {
    it("should check depth before children limit", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 1,
        maxChildrenPerAgent: 0,
        maxConcurrent: 100,
      });
      // Both depth and child limit would fail — depth checked first
      expect(() => guard.checkSpawn("p1", 2)).toThrow(SpawnDepthExceededError);
    });

    it("should check children before concurrency", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 0,
        maxConcurrent: 0,
      });
      // Both children and concurrency would fail — children checked first
      expect(() => guard.checkSpawn("p1", 1)).toThrow(SpawnChildLimitError);
    });
  });

  // -------------------------------------------------------------------------
  // Atomic checkAndRecord
  // -------------------------------------------------------------------------
  describe("checkAndRecord()", () => {
    it("should atomically check and record a spawn", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      guard.checkAndRecord("p1", 1);
      const state = guard.getState();
      expect(state.activeConcurrent).toBe(1);
      expect(state.totalSpawns).toBe(1);
      expect(state.activeByParent.get("p1")).toBe(1);
    });

    it("should throw on limit violation without mutating state", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 1,
        maxChildrenPerAgent: 100,
        maxConcurrent: 100,
      });
      const stateBefore = guard.getState();

      expect(() => guard.checkAndRecord("p1", 2)).toThrow(SpawnDepthExceededError);

      // State should be unchanged
      const stateAfter = guard.getState();
      expect(stateAfter).toBe(stateBefore);
      expect(stateAfter.activeConcurrent).toBe(0);
      expect(stateAfter.totalSpawns).toBe(0);
    });

    it("should respect per-parent child limit atomically", () => {
      const guard = new SpawnGuard({
        maxChildrenPerAgent: 1,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });
      guard.checkAndRecord("p1", 1);

      expect(() => guard.checkAndRecord("p1", 1)).toThrow(SpawnChildLimitError);
      // Only 1 spawn should be recorded
      expect(guard.getState().activeConcurrent).toBe(1);
    });

    it("should respect concurrency limit atomically", () => {
      const guard = new SpawnGuard({
        maxConcurrent: 2,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      guard.checkAndRecord("p1", 1);
      guard.checkAndRecord("p2", 1);

      expect(() => guard.checkAndRecord("p3", 1)).toThrow(SpawnConcurrencyLimitError);
      expect(guard.getState().activeConcurrent).toBe(2);
    });

    it("should allow multiple atomic check-and-records", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 3,
        maxConcurrent: 10,
      });
      guard.checkAndRecord("p1", 1);
      guard.checkAndRecord("p1", 1);
      guard.checkAndRecord("p1", 1);

      expect(guard.getState().activeConcurrent).toBe(3);
      expect(guard.getState().activeByParent.get("p1")).toBe(3);
      expect(() => guard.checkAndRecord("p1", 1)).toThrow(SpawnChildLimitError);
    });
  });

  // -------------------------------------------------------------------------
  // Constructor validation
  // -------------------------------------------------------------------------
  describe("constructor validation", () => {
    it("should reject negative maxSpawnDepth", () => {
      expect(() => new SpawnGuard({ maxSpawnDepth: -1 })).toThrow(RangeError);
    });

    it("should reject NaN maxSpawnDepth", () => {
      expect(() => new SpawnGuard({ maxSpawnDepth: NaN })).toThrow(RangeError);
    });

    it("should reject Infinity maxSpawnDepth", () => {
      expect(() => new SpawnGuard({ maxSpawnDepth: Infinity })).toThrow(RangeError);
    });

    it("should reject non-integer maxSpawnDepth", () => {
      expect(() => new SpawnGuard({ maxSpawnDepth: 1.5 })).toThrow(RangeError);
    });

    it("should reject negative maxChildrenPerAgent", () => {
      expect(() => new SpawnGuard({ maxChildrenPerAgent: -1 })).toThrow(RangeError);
    });

    it("should reject NaN maxChildrenPerAgent", () => {
      expect(() => new SpawnGuard({ maxChildrenPerAgent: NaN })).toThrow(RangeError);
    });

    it("should reject Infinity maxChildrenPerAgent", () => {
      expect(() => new SpawnGuard({ maxChildrenPerAgent: Infinity })).toThrow(RangeError);
    });

    it("should reject non-integer maxChildrenPerAgent", () => {
      expect(() => new SpawnGuard({ maxChildrenPerAgent: 2.5 })).toThrow(RangeError);
    });

    it("should reject negative maxConcurrent", () => {
      expect(() => new SpawnGuard({ maxConcurrent: -1 })).toThrow(RangeError);
    });

    it("should reject NaN maxConcurrent", () => {
      expect(() => new SpawnGuard({ maxConcurrent: NaN })).toThrow(RangeError);
    });

    it("should reject Infinity maxConcurrent", () => {
      expect(() => new SpawnGuard({ maxConcurrent: Infinity })).toThrow(RangeError);
    });

    it("should reject non-integer maxConcurrent", () => {
      expect(() => new SpawnGuard({ maxConcurrent: 3.7 })).toThrow(RangeError);
    });

    it("should accept custom limits", () => {
      const guard = new SpawnGuard({
        maxSpawnDepth: 4,
        maxChildrenPerAgent: 10,
        maxConcurrent: 20,
      });
      expect(guard.maxDepth).toBe(4);
      expect(guard.childLimit).toBe(10);
      expect(guard.concurrencyLimit).toBe(20);
    });

    it("should accept maxSpawnDepth of 0 (no spawning allowed)", () => {
      const guard = new SpawnGuard({ maxSpawnDepth: 0 });
      expect(guard.maxDepth).toBe(0);
    });

    it("should accept maxChildrenPerAgent of 0 (no children allowed)", () => {
      const guard = new SpawnGuard({ maxChildrenPerAgent: 0 });
      expect(guard.childLimit).toBe(0);
    });

    it("should accept maxConcurrent of 0 (no concurrency)", () => {
      const guard = new SpawnGuard({ maxConcurrent: 0 });
      expect(guard.concurrencyLimit).toBe(0);
    });
  });
});
