import { SESSION_EVENTS, SESSION_STATES, SESSION_TRANSITIONS } from "@templar/gateway-protocol";
import { describe, expect, it } from "vitest";
import { transition } from "../state-machine.js";

describe("state-machine: transition()", () => {
  // -------------------------------------------------------------------------
  // Exhaustive transition table — every (state, event) cell
  // -------------------------------------------------------------------------

  describe("CONNECTED state", () => {
    it("heartbeat → stays CONNECTED", () => {
      const result = transition("connected", "heartbeat");
      expect(result).toEqual({
        valid: true,
        state: "connected",
        previousState: "connected",
        event: "heartbeat",
      });
    });

    it("message → stays CONNECTED", () => {
      const result = transition("connected", "message");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("connected");
    });

    it("idle_timeout → IDLE", () => {
      const result = transition("connected", "idle_timeout");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("idle");
      expect(result.previousState).toBe("connected");
    });

    it("suspend_timeout → invalid (null)", () => {
      const result = transition("connected", "suspend_timeout");
      expect(result.valid).toBe(false);
      expect(result.state).toBe("connected"); // unchanged
    });

    it("disconnect → DISCONNECTED", () => {
      const result = transition("connected", "disconnect");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("disconnected");
    });

    it("reconnect → invalid (already connected)", () => {
      const result = transition("connected", "reconnect");
      expect(result.valid).toBe(false);
      expect(result.state).toBe("connected");
    });
  });

  describe("IDLE state", () => {
    it("heartbeat → CONNECTED", () => {
      const result = transition("idle", "heartbeat");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("connected");
      expect(result.previousState).toBe("idle");
    });

    it("message → CONNECTED", () => {
      const result = transition("idle", "message");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("connected");
    });

    it("idle_timeout → invalid (already idle)", () => {
      const result = transition("idle", "idle_timeout");
      expect(result.valid).toBe(false);
      expect(result.state).toBe("idle");
    });

    it("suspend_timeout → SUSPENDED", () => {
      const result = transition("idle", "suspend_timeout");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("suspended");
      expect(result.previousState).toBe("idle");
    });

    it("disconnect → DISCONNECTED", () => {
      const result = transition("idle", "disconnect");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("disconnected");
    });

    it("reconnect → invalid", () => {
      const result = transition("idle", "reconnect");
      expect(result.valid).toBe(false);
    });
  });

  describe("SUSPENDED state", () => {
    it("heartbeat → invalid", () => {
      const result = transition("suspended", "heartbeat");
      expect(result.valid).toBe(false);
      expect(result.state).toBe("suspended");
    });

    it("message → invalid", () => {
      const result = transition("suspended", "message");
      expect(result.valid).toBe(false);
    });

    it("idle_timeout → invalid", () => {
      const result = transition("suspended", "idle_timeout");
      expect(result.valid).toBe(false);
    });

    it("suspend_timeout → invalid", () => {
      const result = transition("suspended", "suspend_timeout");
      expect(result.valid).toBe(false);
    });

    it("disconnect → DISCONNECTED", () => {
      const result = transition("suspended", "disconnect");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("disconnected");
    });

    it("reconnect → CONNECTED", () => {
      const result = transition("suspended", "reconnect");
      expect(result.valid).toBe(true);
      expect(result.state).toBe("connected");
      expect(result.previousState).toBe("suspended");
    });
  });

  describe("DISCONNECTED state (terminal)", () => {
    it("heartbeat → invalid", () => {
      const result = transition("disconnected", "heartbeat");
      expect(result.valid).toBe(false);
      expect(result.state).toBe("disconnected");
    });

    it("message → invalid", () => {
      const result = transition("disconnected", "message");
      expect(result.valid).toBe(false);
    });

    it("idle_timeout → invalid", () => {
      const result = transition("disconnected", "idle_timeout");
      expect(result.valid).toBe(false);
    });

    it("suspend_timeout → invalid", () => {
      const result = transition("disconnected", "suspend_timeout");
      expect(result.valid).toBe(false);
    });

    it("disconnect → invalid (double disconnect)", () => {
      const result = transition("disconnected", "disconnect");
      expect(result.valid).toBe(false);
    });

    it("reconnect → invalid (terminal state)", () => {
      const result = transition("disconnected", "reconnect");
      expect(result.valid).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Meta: verify completeness
  // -------------------------------------------------------------------------

  describe("completeness check", () => {
    it("tests cover all 24 state-event combinations", () => {
      // 4 states × 6 events = 24 cells
      for (const state of SESSION_STATES) {
        for (const event of SESSION_EVENTS) {
          const result = transition(state, event);
          const expected = SESSION_TRANSITIONS[state][event];
          if (expected === null) {
            expect(result.valid).toBe(false);
            expect(result.state).toBe(state);
          } else {
            expect(result.valid).toBe(true);
            expect(result.state).toBe(expected);
          }
        }
      }
    });
  });
});
