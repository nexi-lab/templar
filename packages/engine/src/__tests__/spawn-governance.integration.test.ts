/**
 * Integration tests for spawn governance (#163)
 *
 * Tests the full pipeline: config -> SpawnGuard -> SpawnGovernanceMiddleware
 * -> error thrown -> error serialized correctly.
 *
 * Uses real SpawnGuard instances (no mocks) to verify the complete flow.
 */
import type { SpawnLimitsConfig } from "@templar/core";
import {
  type SpawnChildLimitError,
  SpawnConcurrencyLimitError,
  SpawnDepthExceededError,
  SpawnGovernanceError,
  SpawnToolDeniedError,
  TemplarError,
} from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { SpawnGovernanceMiddleware } from "../spawn-governance-middleware.js";
import { DEFAULT_SPAWN_LIMITS, SpawnGuard } from "../spawn-guard.js";

describe("Spawn Governance Integration", () => {
  // -------------------------------------------------------------------------
  // Full pipeline: config -> guard -> middleware -> error
  // -------------------------------------------------------------------------
  describe("full pipeline", () => {
    it("should enforce depth limit through middleware and produce correct error", () => {
      const config: SpawnLimitsConfig = { maxSpawnDepth: 1 };
      const mw = new SpawnGovernanceMiddleware(config);

      try {
        mw.checkSpawn("root", 2);
        expect.fail("Should have thrown");
      } catch (error) {
        // Verify error type hierarchy
        expect(error).toBeInstanceOf(SpawnDepthExceededError);
        expect(error).toBeInstanceOf(SpawnGovernanceError);
        expect(error).toBeInstanceOf(TemplarError);

        // Verify error properties
        const e = error as SpawnDepthExceededError;
        expect(e.currentDepth).toBe(2);
        expect(e.maxSpawnDepth).toBe(1);
        expect(e.code).toBe("ENGINE_SPAWN_DEPTH_EXCEEDED");
        expect(e.httpStatus).toBe(429);
        expect(e.domain).toBe("engine");

        // Verify serialization
        const json = e.toJSON();
        expect(json.code).toBe("ENGINE_SPAWN_DEPTH_EXCEEDED");
      }
    });

    it("should enforce child limit through middleware with state tracking", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxChildrenPerAgent: 2,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });

      // Spawn 2 children (should succeed)
      mw.checkSpawn("orchestrator", 1);
      mw.recordSpawn("orchestrator");
      mw.checkSpawn("orchestrator", 1);
      mw.recordSpawn("orchestrator");

      // Third child should fail
      try {
        mw.checkSpawn("orchestrator", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        const e = error as SpawnChildLimitError;
        expect(e.parentAgentId).toBe("orchestrator");
        expect(e.activeChildren).toBe(2);
        expect(e.maxChildrenPerAgent).toBe(2);
      }
    });

    it("should enforce concurrency limit across multiple parents", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxConcurrent: 3,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });

      // Spawn from 3 different parents
      mw.checkSpawn("p1", 1);
      mw.recordSpawn("p1");
      mw.checkSpawn("p2", 1);
      mw.recordSpawn("p2");
      mw.checkSpawn("p3", 1);
      mw.recordSpawn("p3");

      // Fourth should fail
      expect(() => mw.checkSpawn("p4", 1)).toThrow(SpawnConcurrencyLimitError);

      // Complete one, then retry
      mw.recordCompletion("p1");
      expect(() => mw.checkSpawn("p4", 1)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Depth-aware tool policy integration
  // -------------------------------------------------------------------------
  describe("depth-aware tool policy", () => {
    it("should block spawn tool at depth 2 with default deny policy", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: {
          0: {},
          1: {},
          2: { deny: ["sessions_spawn"] },
        },
      });

      expect(mw.isToolAllowed("sessions_spawn", 0)).toBe(true);
      expect(mw.isToolAllowed("sessions_spawn", 1)).toBe(true);
      expect(mw.isToolAllowed("sessions_spawn", 2)).toBe(false);
    });

    it("should throw SpawnToolDeniedError with correct metadata", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: { 1: { deny: ["bash"] } },
      });

      try {
        mw.checkToolAccess("bash", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnToolDeniedError);
        const e = error as SpawnToolDeniedError;
        expect(e.toolName).toBe("bash");
        expect(e.currentDepth).toBe(1);
        expect(e.code).toBe("ENGINE_SPAWN_TOOL_DENIED");
        expect(e.httpStatus).toBe(403);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Session lifecycle
  // -------------------------------------------------------------------------
  describe("session lifecycle", () => {
    it("should reset all governance state on session start", async () => {
      const mw = new SpawnGovernanceMiddleware({
        maxConcurrent: 2,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });

      // Build up state
      mw.recordSpawn("p1");
      mw.recordSpawn("p2");
      expect(mw.getGuardState().activeConcurrent).toBe(2);

      // New session
      await mw.onSessionStart({ sessionId: "session-2" });

      // State should be fresh
      const state = mw.getGuardState();
      expect(state.activeConcurrent).toBe(0);
      expect(state.totalSpawns).toBe(0);
      expect(state.activeByParent.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Hook data integration
  // -------------------------------------------------------------------------
  describe("hook data", () => {
    it("should build PreSubagentSpawn data reflecting current state", () => {
      const mw = new SpawnGovernanceMiddleware();
      mw.recordSpawn("orch-1");
      mw.recordSpawn("orch-1");

      const data = mw.buildHookData(
        "orch-1",
        "session-abc",
        { task: "research", model: "claude-sonnet-4-5-20250929", tools: ["read_file"] },
        1,
      );

      expect(data.parentAgentId).toBe("orch-1");
      expect(data.sessionId).toBe("session-abc");
      expect(data.childConfig.task).toBe("research");
      expect(data.childConfig.model).toBe("claude-sonnet-4-5-20250929");
      expect(data.childConfig.tools).toEqual(["read_file"]);
      expect(data.currentDepth).toBe(1);
      expect(data.activeChildren).toBe(2);
      expect(data.activeConcurrent).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Warn mode integration
  // -------------------------------------------------------------------------
  describe("warn mode", () => {
    it("should log warning but allow spawn when onExceeded='warn'", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxSpawnDepth: 1,
        onExceeded: "warn",
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Exceeds depth but should still return allowed
      const result = mw.checkSpawn("parent", 2);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain("depth");
      expect(warn).toHaveBeenCalled();

      warn.mockRestore();
    });

    it("should log warning for denied tool but allow it in warn mode", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: { 1: { deny: ["bash"] } },
        onExceeded: "warn",
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = mw.checkToolAccess("bash", 1);
      expect(result.allowed).toBe(true);
      expect(warn).toHaveBeenCalled();

      warn.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Guard + middleware consistency
  // -------------------------------------------------------------------------
  describe("guard-middleware consistency", () => {
    it("should use same defaults as DEFAULT_SPAWN_LIMITS", () => {
      const guard = new SpawnGuard();
      const mw = new SpawnGovernanceMiddleware();

      expect(guard.maxDepth).toBe(DEFAULT_SPAWN_LIMITS.maxSpawnDepth);
      expect(guard.childLimit).toBe(DEFAULT_SPAWN_LIMITS.maxChildrenPerAgent);
      expect(guard.concurrencyLimit).toBe(DEFAULT_SPAWN_LIMITS.maxConcurrent);

      // Middleware should behave consistently
      const mwState = mw.getGuardState();
      expect(mwState.activeConcurrent).toBe(0);
      expect(mwState.totalSpawns).toBe(0);
    });
  });
});
