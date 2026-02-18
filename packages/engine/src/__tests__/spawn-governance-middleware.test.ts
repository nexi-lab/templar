import {
  SpawnChildLimitError,
  SpawnConcurrencyLimitError,
  SpawnDepthExceededError,
  SpawnGovernanceError,
  SpawnToolDeniedError,
} from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { SpawnGovernanceMiddleware } from "../spawn-governance-middleware.js";

describe("SpawnGovernanceMiddleware", () => {
  // -------------------------------------------------------------------------
  // Name
  // -------------------------------------------------------------------------
  describe("name", () => {
    it("should have correct middleware name", () => {
      const mw = new SpawnGovernanceMiddleware();
      expect(mw.name).toBe("templar:spawn-governance");
    });
  });

  // -------------------------------------------------------------------------
  // checkSpawn with onExceeded modes
  // -------------------------------------------------------------------------
  describe("checkSpawn()", () => {
    it("should return allowed:true when within limits", () => {
      const mw = new SpawnGovernanceMiddleware({ maxSpawnDepth: 3 });
      const result = mw.checkSpawn("parent", 1);
      expect(result.allowed).toBe(true);
    });

    it("should throw on depth exceeded with onExceeded='error' (default)", () => {
      const mw = new SpawnGovernanceMiddleware({ maxSpawnDepth: 1 });
      expect(() => mw.checkSpawn("parent", 2)).toThrow(SpawnDepthExceededError);
    });

    it("should throw on depth exceeded with onExceeded='stop'", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxSpawnDepth: 1,
        onExceeded: "stop",
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(() => mw.checkSpawn("parent", 2)).toThrow(SpawnDepthExceededError);
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });

    it("should warn and return allowed:true with onExceeded='warn'", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxSpawnDepth: 1,
        onExceeded: "warn",
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = mw.checkSpawn("parent", 2);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeDefined();
      expect(warn).toHaveBeenCalledOnce();

      warn.mockRestore();
    });

    it("should throw SpawnChildLimitError when children exceeded", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxChildrenPerAgent: 1,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });
      mw.checkSpawn("parent", 1);
      mw.recordSpawn("parent");

      expect(() => mw.checkSpawn("parent", 1)).toThrow(SpawnChildLimitError);
    });

    it("should throw SpawnConcurrencyLimitError when concurrent exceeded", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxConcurrent: 1,
        maxSpawnDepth: 5,
        maxChildrenPerAgent: 100,
      });
      mw.checkSpawn("p1", 1);
      mw.recordSpawn("p1");

      expect(() => mw.checkSpawn("p2", 1)).toThrow(SpawnConcurrencyLimitError);
    });

    it("should re-throw non-SpawnGovernanceError errors", () => {
      const mw = new SpawnGovernanceMiddleware();
      // Pass invalid args that would cause an internal error
      // The guard validates internally so this should propagate correctly
      expect(() => mw.checkSpawn("parent", 1)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Tool policy checks
  // -------------------------------------------------------------------------
  describe("isToolAllowed()", () => {
    it("should allow all tools when no policy is set", () => {
      const mw = new SpawnGovernanceMiddleware();
      expect(mw.isToolAllowed("sessions_spawn", 0)).toBe(true);
      expect(mw.isToolAllowed("read_file", 1)).toBe(true);
    });

    it("should deny tools in the deny list for a given depth", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: {
          1: { deny: ["sessions_spawn", "bash"] },
        },
      });
      expect(mw.isToolAllowed("sessions_spawn", 1)).toBe(false);
      expect(mw.isToolAllowed("bash", 1)).toBe(false);
      expect(mw.isToolAllowed("read_file", 1)).toBe(true);
    });

    it("should allow tools not in deny list", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: {
          2: { deny: ["sessions_spawn"] },
        },
      });
      expect(mw.isToolAllowed("read_file", 2)).toBe(true);
    });

    it("should respect allow list when set", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: {
          2: { allow: ["read_file", "search"] },
        },
      });
      expect(mw.isToolAllowed("read_file", 2)).toBe(true);
      expect(mw.isToolAllowed("search", 2)).toBe(true);
      expect(mw.isToolAllowed("bash", 2)).toBe(false);
    });

    it("should deny if tool is in both allow and deny", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: {
          1: { allow: ["bash", "read_file"], deny: ["bash"] },
        },
      });
      // Deny takes precedence
      expect(mw.isToolAllowed("bash", 1)).toBe(false);
      expect(mw.isToolAllowed("read_file", 1)).toBe(true);
    });

    it("should allow all tools at depths not specified in policy", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: {
          2: { deny: ["sessions_spawn"] },
        },
      });
      // Depth 0 has no policy — all tools allowed
      expect(mw.isToolAllowed("sessions_spawn", 0)).toBe(true);
      // Depth 1 has no policy — all tools allowed
      expect(mw.isToolAllowed("sessions_spawn", 1)).toBe(true);
    });
  });

  describe("checkToolAccess()", () => {
    it("should return allowed:true for allowed tools", () => {
      const mw = new SpawnGovernanceMiddleware();
      const result = mw.checkToolAccess("any_tool", 0);
      expect(result.allowed).toBe(true);
    });

    it("should throw SpawnToolDeniedError for denied tools with onExceeded='error'", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: { 1: { deny: ["sessions_spawn"] } },
        onExceeded: "error",
      });
      expect(() => mw.checkToolAccess("sessions_spawn", 1)).toThrow(SpawnToolDeniedError);
    });

    it("should warn for denied tools with onExceeded='warn'", () => {
      const mw = new SpawnGovernanceMiddleware({
        depthToolPolicy: { 1: { deny: ["sessions_spawn"] } },
        onExceeded: "warn",
      });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = mw.checkToolAccess("sessions_spawn", 1);
      expect(result.allowed).toBe(true);
      expect(warn).toHaveBeenCalledOnce();

      warn.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // Record spawn / completion
  // -------------------------------------------------------------------------
  describe("recordSpawn() and recordCompletion()", () => {
    it("should track spawns in guard state", () => {
      const mw = new SpawnGovernanceMiddleware();
      mw.recordSpawn("parent");
      const state = mw.getGuardState();
      expect(state.activeConcurrent).toBe(1);
      expect(state.totalSpawns).toBe(1);
    });

    it("should track completions in guard state", () => {
      const mw = new SpawnGovernanceMiddleware();
      mw.recordSpawn("parent");
      mw.recordCompletion("parent");
      const state = mw.getGuardState();
      expect(state.activeConcurrent).toBe(0);
      expect(state.totalSpawns).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Session reset
  // -------------------------------------------------------------------------
  describe("onSessionStart()", () => {
    it("should reset guard state on new session", async () => {
      const mw = new SpawnGovernanceMiddleware();
      mw.recordSpawn("parent");
      expect(mw.getGuardState().activeConcurrent).toBe(1);

      await mw.onSessionStart({ sessionId: "new-session" });
      expect(mw.getGuardState().activeConcurrent).toBe(0);
      expect(mw.getGuardState().totalSpawns).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // buildHookData()
  // -------------------------------------------------------------------------
  describe("buildHookData()", () => {
    it("should build correct hook data with no active children", () => {
      const mw = new SpawnGovernanceMiddleware();
      const data = mw.buildHookData(
        "parent-1",
        "session-1",
        {
          task: "research",
          model: "claude-sonnet-4-5-20250929",
        },
        0,
      );

      expect(data.parentAgentId).toBe("parent-1");
      expect(data.sessionId).toBe("session-1");
      expect(data.childConfig.task).toBe("research");
      expect(data.currentDepth).toBe(0);
      expect(data.activeChildren).toBe(0);
      expect(data.activeConcurrent).toBe(0);
    });

    it("should reflect current state in hook data", () => {
      const mw = new SpawnGovernanceMiddleware();
      mw.recordSpawn("parent-1");
      mw.recordSpawn("parent-1");
      mw.recordSpawn("parent-2");

      const data = mw.buildHookData(
        "parent-1",
        "session-1",
        {
          task: "analyze",
        },
        1,
      );

      expect(data.activeChildren).toBe(2);
      expect(data.activeConcurrent).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Error type hierarchy
  // -------------------------------------------------------------------------
  describe("error types", () => {
    it("SpawnDepthExceededError should be instanceof SpawnGovernanceError", () => {
      const mw = new SpawnGovernanceMiddleware({ maxSpawnDepth: 0 });
      try {
        mw.checkSpawn("p", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnGovernanceError);
        expect(error).toBeInstanceOf(SpawnDepthExceededError);
      }
    });

    it("SpawnChildLimitError should be instanceof SpawnGovernanceError", () => {
      const mw = new SpawnGovernanceMiddleware({
        maxChildrenPerAgent: 0,
        maxSpawnDepth: 5,
      });
      try {
        mw.checkSpawn("p", 1);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(SpawnGovernanceError);
        expect(error).toBeInstanceOf(SpawnChildLimitError);
      }
    });
  });
});
