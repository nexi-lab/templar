import { GatewayNodeAlreadyRegisteredError, GatewayNodeNotFoundError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager, type SessionManagerConfig } from "../session-manager.js";

const DEFAULT_CONFIG: SessionManagerConfig = {
  sessionTimeout: 60_000,
  suspendTimeout: 300_000,
};

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SessionManager(DEFAULT_CONFIG);
  });

  afterEach(() => {
    manager.dispose();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Session creation
  // -------------------------------------------------------------------------

  describe("createSession()", () => {
    it("creates a session in CONNECTED state", () => {
      const session = manager.createSession("node-1");
      expect(session.nodeId).toBe("node-1");
      expect(session.state).toBe("connected");
      expect(session.reconnectCount).toBe(0);
    });

    it("throws on duplicate nodeId", () => {
      manager.createSession("node-1");
      expect(() => manager.createSession("node-1")).toThrow(GatewayNodeAlreadyRegisteredError);
    });

    it("sets connectedAt and lastActivityAt to now", () => {
      vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
      const session = manager.createSession("node-1");
      expect(session.connectedAt).toBe(Date.now());
      expect(session.lastActivityAt).toBe(Date.now());
    });
  });

  // -------------------------------------------------------------------------
  // Session retrieval
  // -------------------------------------------------------------------------

  describe("getSession()", () => {
    it("returns the session for a known node", () => {
      manager.createSession("node-1");
      const session = manager.getSession("node-1");
      expect(session).toBeDefined();
      expect(session?.nodeId).toBe("node-1");
    });

    it("returns undefined for unknown node", () => {
      expect(manager.getSession("unknown")).toBeUndefined();
    });
  });

  describe("getAllSessions()", () => {
    it("returns all sessions", () => {
      manager.createSession("node-1");
      manager.createSession("node-2");
      expect(manager.getAllSessions()).toHaveLength(2);
    });

    it("returns empty array when no sessions", () => {
      expect(manager.getAllSessions()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Event handling
  // -------------------------------------------------------------------------

  describe("handleEvent()", () => {
    it("throws for unknown nodeId", () => {
      expect(() => manager.handleEvent("unknown", "heartbeat")).toThrow(GatewayNodeNotFoundError);
    });

    it("applies valid transition", () => {
      manager.createSession("node-1");
      const result = manager.handleEvent("node-1", "idle_timeout");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("idle");
    });

    it("returns invalid result for bad transition", () => {
      manager.createSession("node-1");
      const result = manager.handleEvent("node-1", "reconnect"); // CONNECTED + reconnect = invalid
      expect(result.valid).toBe(false);
      expect(result.state).toBe("connected");
    });

    it("updates session state after valid transition", () => {
      manager.createSession("node-1");
      manager.handleEvent("node-1", "idle_timeout");
      const session = manager.getSession("node-1");
      expect(session?.state).toBe("idle");
    });

    it("does not update session state after invalid transition", () => {
      manager.createSession("node-1");
      manager.handleEvent("node-1", "reconnect");
      const session = manager.getSession("node-1");
      expect(session?.state).toBe("connected");
    });

    it("increments reconnectCount on reconnect", () => {
      manager.createSession("node-1");
      // Move to suspended first
      manager.handleEvent("node-1", "idle_timeout");
      manager.handleEvent("node-1", "suspend_timeout");
      expect(manager.getSession("node-1")?.reconnectCount).toBe(0);
      // Reconnect
      manager.handleEvent("node-1", "reconnect");
      expect(manager.getSession("node-1")?.reconnectCount).toBe(1);
    });

    it("cleans up session on disconnect", () => {
      manager.createSession("node-1");
      manager.handleEvent("node-1", "disconnect");
      expect(manager.getSession("node-1")).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Timer-driven transitions
  // -------------------------------------------------------------------------

  describe("timer-driven transitions", () => {
    it("CONNECTED → IDLE after sessionTimeout", () => {
      manager.createSession("node-1");
      expect(manager.getSession("node-1")?.state).toBe("connected");

      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      expect(manager.getSession("node-1")?.state).toBe("idle");
    });

    it("IDLE → SUSPENDED after suspendTimeout", () => {
      manager.createSession("node-1");
      // Advance to idle
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      expect(manager.getSession("node-1")?.state).toBe("idle");

      // Advance to suspended
      vi.advanceTimersByTime(DEFAULT_CONFIG.suspendTimeout);
      expect(manager.getSession("node-1")?.state).toBe("suspended");
    });

    it("heartbeat resets idle timer", () => {
      manager.createSession("node-1");

      // Advance halfway through idle timeout
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout / 2);
      // Send heartbeat (resets timer)
      manager.handleEvent("node-1", "heartbeat");

      // Advance another half — would have expired without heartbeat
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout / 2);
      expect(manager.getSession("node-1")?.state).toBe("connected");

      // Full timeout from last heartbeat — now it transitions
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout / 2);
      expect(manager.getSession("node-1")?.state).toBe("idle");
    });

    it("message resets idle timer", () => {
      manager.createSession("node-1");

      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout - 1);
      manager.handleEvent("node-1", "message");

      vi.advanceTimersByTime(1);
      // Timer was reset, so still connected
      expect(manager.getSession("node-1")?.state).toBe("connected");
    });

    it("full lifecycle: CONNECTED → IDLE → SUSPENDED → (cleanup)", () => {
      manager.createSession("node-1");

      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      expect(manager.getSession("node-1")?.state).toBe("idle");

      vi.advanceTimersByTime(DEFAULT_CONFIG.suspendTimeout);
      expect(manager.getSession("node-1")?.state).toBe("suspended");

      // Suspended state has no auto-timer to disconnected
      // It must be explicitly disconnected or reconnected
    });

    it("activity during IDLE returns to CONNECTED and resets idle timer", () => {
      manager.createSession("node-1");

      // Go idle
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      expect(manager.getSession("node-1")?.state).toBe("idle");

      // Send message — should go back to connected
      manager.handleEvent("node-1", "message");
      expect(manager.getSession("node-1")?.state).toBe("connected");

      // Idle timer should be reset
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout - 1);
      expect(manager.getSession("node-1")?.state).toBe("connected");

      vi.advanceTimersByTime(1);
      expect(manager.getSession("node-1")?.state).toBe("idle");
    });

    it("reconnect during SUSPENDED resumes CONNECTED", () => {
      manager.createSession("node-1");

      // Go to suspended
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      vi.advanceTimersByTime(DEFAULT_CONFIG.suspendTimeout);
      expect(manager.getSession("node-1")?.state).toBe("suspended");

      // Reconnect
      manager.handleEvent("node-1", "reconnect");
      expect(manager.getSession("node-1")?.state).toBe("connected");
      expect(manager.getSession("node-1")?.reconnectCount).toBe(1);

      // Idle timer should be running again
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      expect(manager.getSession("node-1")?.state).toBe("idle");
    });
  });

  // -------------------------------------------------------------------------
  // Transition event handlers
  // -------------------------------------------------------------------------

  describe("onTransition()", () => {
    it("fires handler on valid transition", () => {
      const handler = vi.fn();
      manager.onTransition(handler);
      manager.createSession("node-1");

      manager.handleEvent("node-1", "idle_timeout");
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        "node-1",
        expect.objectContaining({ valid: true, state: "idle" }),
        expect.objectContaining({ state: "idle" }),
      );
    });

    it("fires handler on invalid transition too (for observability)", () => {
      const handler = vi.fn();
      manager.onTransition(handler);
      manager.createSession("node-1");

      manager.handleEvent("node-1", "reconnect"); // invalid in CONNECTED
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        "node-1",
        expect.objectContaining({ valid: false }),
        expect.objectContaining({ state: "connected" }),
      );
    });

    it("fires multiple handlers", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.onTransition(handler1);
      manager.onTransition(handler2);
      manager.createSession("node-1");

      manager.handleEvent("node-1", "idle_timeout");
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // destroySession
  // -------------------------------------------------------------------------

  describe("destroySession()", () => {
    it("removes the session", () => {
      manager.createSession("node-1");
      manager.destroySession("node-1");
      expect(manager.getSession("node-1")).toBeUndefined();
    });

    it("throws for unknown node", () => {
      expect(() => manager.destroySession("unknown")).toThrow(GatewayNodeNotFoundError);
    });

    it("cleans up timers", () => {
      manager.createSession("node-1");
      manager.destroySession("node-1");
      // Advancing time should not cause errors
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout * 2);
      // No session should exist
      expect(manager.getAllSessions()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe("dispose()", () => {
    it("clears all sessions", () => {
      manager.createSession("node-1");
      manager.createSession("node-2");
      manager.dispose();
      expect(manager.getAllSessions()).toHaveLength(0);
    });

    it("clears all timers", () => {
      manager.createSession("node-1");
      manager.dispose();
      // Advancing time should not cause errors
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout * 2);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("edge cases", () => {
    it("double disconnect is handled (first disconnects, second throws not found)", () => {
      manager.createSession("node-1");
      manager.handleEvent("node-1", "disconnect");
      // Session is cleaned up after disconnect
      expect(() => manager.handleEvent("node-1", "disconnect")).toThrow(GatewayNodeNotFoundError);
    });

    it("idle timeout at exact boundary with simultaneous message", () => {
      manager.createSession("node-1");

      // Advance to exactly the timeout
      vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
      // Session should be idle now
      expect(manager.getSession("node-1")?.state).toBe("idle");

      // Message arrives — should go back to connected
      manager.handleEvent("node-1", "message");
      expect(manager.getSession("node-1")?.state).toBe("connected");
    });
  });
});
