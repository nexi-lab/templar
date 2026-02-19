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
  // Session ID generation
  // -------------------------------------------------------------------------

  describe("session ID", () => {
    it("generates a UUID sessionId", () => {
      const session = manager.createSession("node-1");
      // UUID v4 format: 8-4-4-4-12 hex digits
      expect(session.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it("generates unique sessionIds across sessions", () => {
      const session1 = manager.createSession("node-1");
      manager.destroySession("node-1");
      const session2 = manager.createSession("node-1");
      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it("sessionId persists through state transitions", () => {
      const session = manager.createSession("node-1");
      const originalId = session.sessionId;
      manager.handleEvent("node-1", "idle_timeout");
      expect(manager.getSession("node-1")?.sessionId).toBe(originalId);
    });
  });

  // -------------------------------------------------------------------------
  // Identity context
  // -------------------------------------------------------------------------

  describe("identity context", () => {
    const testIdentity = {
      identity: { name: "Bot", avatar: "https://a.png" },
      channelType: "slack",
      agentId: "agent-1",
    };

    describe("createSession with identity", () => {
      it("creates session without identity context (backward compat)", () => {
        const session = manager.createSession("node-1");
        expect(session.identityContext).toBeUndefined();
      });

      it("creates session with identity context", () => {
        const session = manager.createSession("node-1", {
          identityContext: testIdentity,
        });
        expect(session.identityContext).toEqual(testIdentity);
      });

      it("deep-freezes the identity context including nested objects", () => {
        const session = manager.createSession("node-1", {
          identityContext: testIdentity,
        });
        expect(Object.isFrozen(session.identityContext)).toBe(true);
        expect(Object.isFrozen(session.identityContext?.identity)).toBe(true);
      });

      it("deep-clones identity to prevent external mutation", () => {
        const mutableIdentity = {
          identity: { name: "Bot" },
          channelType: "slack",
        };
        const session = manager.createSession("node-1", {
          identityContext: mutableIdentity,
        });
        // Mutate the original — session should not be affected
        mutableIdentity.identity.name = "Hacked";
        expect(session.identityContext?.identity?.name).toBe("Bot");
      });

      it("creates session with empty identity context", () => {
        const session = manager.createSession("node-1", {
          identityContext: {},
        });
        expect(session.identityContext).toEqual({});
      });

      it("creates session with identity only (no channelType/agentId)", () => {
        const session = manager.createSession("node-1", {
          identityContext: {
            identity: { name: "Minimal Bot" },
          },
        });
        expect(session.identityContext?.identity?.name).toBe("Minimal Bot");
        expect(session.identityContext?.channelType).toBeUndefined();
      });
    });

    describe("identity persists through state transitions", () => {
      it("identity survives CONNECTED → IDLE transition", () => {
        manager.createSession("node-1", { identityContext: testIdentity });
        vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
        const session = manager.getSession("node-1");
        expect(session?.state).toBe("idle");
        expect(session?.identityContext).toEqual(testIdentity);
      });

      it("identity survives full lifecycle: CONNECTED → IDLE → SUSPENDED → reconnect → CONNECTED", () => {
        manager.createSession("node-1", { identityContext: testIdentity });

        vi.advanceTimersByTime(DEFAULT_CONFIG.sessionTimeout);
        expect(manager.getSession("node-1")?.identityContext).toEqual(testIdentity);

        vi.advanceTimersByTime(DEFAULT_CONFIG.suspendTimeout);
        expect(manager.getSession("node-1")?.identityContext).toEqual(testIdentity);

        manager.handleEvent("node-1", "reconnect");
        expect(manager.getSession("node-1")?.state).toBe("connected");
        expect(manager.getSession("node-1")?.identityContext).toEqual(testIdentity);
      });

      it("identity survives heartbeat events", () => {
        manager.createSession("node-1", { identityContext: testIdentity });
        manager.handleEvent("node-1", "heartbeat");
        expect(manager.getSession("node-1")?.identityContext).toEqual(testIdentity);
      });

      it("identity survives message events", () => {
        manager.createSession("node-1", { identityContext: testIdentity });
        manager.handleEvent("node-1", "message");
        expect(manager.getSession("node-1")?.identityContext).toEqual(testIdentity);
      });
    });

    describe("updateIdentityContext()", () => {
      it("updates identity on existing session", () => {
        manager.createSession("node-1", { identityContext: testIdentity });
        const newIdentity = {
          identity: { name: "Updated Bot" },
          channelType: "discord",
          agentId: "agent-2",
        };
        const updated = manager.updateIdentityContext("node-1", newIdentity);
        expect(updated).toBeDefined();
        expect(updated?.identityContext).toEqual(newIdentity);
        expect(manager.getSession("node-1")?.identityContext).toEqual(newIdentity);
      });

      it("returns undefined when identity is unchanged", () => {
        manager.createSession("node-1", { identityContext: testIdentity });
        const result = manager.updateIdentityContext("node-1", testIdentity);
        expect(result).toBeUndefined();
      });

      it("throws for unknown nodeId", () => {
        expect(() => manager.updateIdentityContext("unknown", testIdentity)).toThrow(
          GatewayNodeNotFoundError,
        );
      });

      it("deep-freezes the new identity context including nested objects", () => {
        manager.createSession("node-1");
        const updated = manager.updateIdentityContext("node-1", testIdentity);
        expect(Object.isFrozen(updated?.identityContext)).toBe(true);
        expect(Object.isFrozen(updated?.identityContext?.identity)).toBe(true);
      });

      it("deep-clones to prevent external mutation", () => {
        manager.createSession("node-1");
        const mutableIdentity = {
          identity: { name: "Bot" },
          channelType: "slack",
        };
        manager.updateIdentityContext("node-1", mutableIdentity);
        mutableIdentity.identity.name = "Hacked";
        expect(manager.getSession("node-1")?.identityContext?.identity?.name).toBe("Bot");
      });

      it("can clear identity by setting to undefined", () => {
        manager.createSession("node-1", { identityContext: testIdentity });
        const updated = manager.updateIdentityContext("node-1", undefined);
        expect(updated).toBeDefined();
        expect(updated?.identityContext).toBeUndefined();
        expect(manager.getSession("node-1")?.identityContext).toBeUndefined();
      });

      it("preserves other session fields", () => {
        const session = manager.createSession("node-1", {
          identityContext: testIdentity,
        });
        const originalSessionId = session.sessionId;
        const newIdentity = { identity: { name: "New" }, channelType: "telegram" };
        const updated = manager.updateIdentityContext("node-1", newIdentity);
        expect(updated?.sessionId).toBe(originalSessionId);
        expect(updated?.nodeId).toBe("node-1");
        expect(updated?.state).toBe("connected");
      });

      it("can set identity on session created without identity", () => {
        manager.createSession("node-1");
        const updated = manager.updateIdentityContext("node-1", testIdentity);
        expect(updated?.identityContext).toEqual(testIdentity);
      });

      it("detects change even when identity values differ subtly", () => {
        manager.createSession("node-1", {
          identityContext: { identity: { name: "Bot" }, channelType: "slack" },
        });
        const result = manager.updateIdentityContext("node-1", {
          identity: { name: "Bot" },
          channelType: "discord",
        });
        expect(result).toBeDefined();
        expect(result?.identityContext?.channelType).toBe("discord");
      });
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
