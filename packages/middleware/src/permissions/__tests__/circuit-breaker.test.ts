import type { SessionContext, TurnContext } from "@templar/core";
import { PermissionDeniedError } from "@templar/errors";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusPermissionsMiddleware } from "../middleware.js";
import { CIRCUIT_BREAKER_DEFAULTS } from "../types.js";

/**
 * Circuit breaker tests use injectable clock for deterministic timing.
 *
 * Note: The circuit breaker is triggered by the checkWithReBACFallback path,
 * which is only reachable when the resolved pattern is not allow/deny/ask.
 * Since PermissionPattern is constrained to those three values, we test the
 * circuit breaker through the internal mechanism by exercising the API failure
 * paths that are reachable through the ask callback flow.
 *
 * The circuit breaker primarily protects the checkReBAC call path.
 * For unit testing, we verify the state machine behavior directly.
 */
describe("Circuit breaker", () => {
  let mock: MockNexusClient;
  let currentTime: number;

  beforeEach(() => {
    mock = createMockNexusClient();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    currentTime = 1000;
  });

  function createClock() {
    return { now: () => currentTime };
  }

  function createTurnContext(toolName: string, sessionId = "sess-1"): TurnContext {
    return {
      sessionId,
      turnNumber: 1,
      metadata: { toolCall: { name: toolName } },
    };
  }

  // =========================================================================
  // State machine basics
  // =========================================================================

  describe("state machine", () => {
    it("should start in closed state", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
        clock: createClock(),
      });

      // In closed state, allow pattern should work
      const ctx = createTurnContext("any-tool");
      await mw.onBeforeTurn(ctx);
      // Should not throw
    });

    it("should reset state on session start", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
        clock: createClock(),
      });

      const sessionCtx: SessionContext = { sessionId: "sess-1" };
      await mw.onSessionStart(sessionCtx);

      const turnCtx = createTurnContext("any-tool");
      await mw.onBeforeTurn(turnCtx);
      // Should work after reset
    });
  });

  // =========================================================================
  // Circuit breaker with ask pattern failures
  // =========================================================================

  describe("ask callback integration", () => {
    it("should handle sequential ask callback failures gracefully", async () => {
      // Simulate ask callback that throws multiple times
      let callCount = 0;
      const callback = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount <= 3) {
          throw new Error(`Failure ${callCount}`);
        }
        return "allow";
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        clock: createClock(),
      });

      // First 3 calls throw — middleware should deny gracefully
      for (let i = 0; i < 3; i++) {
        await expect(mw.onBeforeTurn(createTurnContext("ask-tool"))).rejects.toThrow(
          PermissionDeniedError,
        );
      }

      // 4th call succeeds
      const ctx = createTurnContext("ask-tool");
      await mw.onBeforeTurn(ctx);
      expect((ctx.metadata?.permissionCheck as Record<string, unknown>)?.granted).toBe(true);
    });
  });

  // =========================================================================
  // Circuit breaker with "check" pattern (ReBAC API)
  // =========================================================================

  describe("check pattern circuit breaker", () => {
    it("should open circuit after consecutive API failures", async () => {
      mock.mockPermissions.checkPermission.mockRejectedValue(new Error("API down"));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        denyOnFailure: true,
        clock: createClock(),
      });

      // Fail N times to open the circuit
      for (let i = 0; i < CIRCUIT_BREAKER_DEFAULTS.failureThreshold; i++) {
        try {
          await mw.onBeforeTurn(createTurnContext("tool-a"));
        } catch {
          // Expected PermissionDeniedError
        }
      }

      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(
        CIRCUIT_BREAKER_DEFAULTS.failureThreshold,
      );

      // Circuit is now open — next call should NOT hit API
      mock.mockPermissions.checkPermission.mockClear();
      try {
        await mw.onBeforeTurn(createTurnContext("tool-b"));
      } catch {
        // Expected
      }

      // API not called — circuit is open
      expect(mock.mockPermissions.checkPermission).not.toHaveBeenCalled();
    });

    it("should transition to half-open after cooldown", async () => {
      mock.mockPermissions.checkPermission.mockRejectedValue(new Error("API down"));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        denyOnFailure: true,
        clock: createClock(),
      });

      // Open the circuit
      for (let i = 0; i < CIRCUIT_BREAKER_DEFAULTS.failureThreshold; i++) {
        try {
          await mw.onBeforeTurn(createTurnContext("tool-a"));
        } catch {
          // Expected
        }
      }

      // Advance past cooldown
      currentTime += CIRCUIT_BREAKER_DEFAULTS.cooldownMs + 1;

      // Now API is available again
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      const ctx = createTurnContext("tool-a");
      await mw.onBeforeTurn(ctx);

      // API was called (probe in half-open state)
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalled();
      expect((ctx.metadata?.permissionCheck as Record<string, unknown>)?.granted).toBe(true);
    });

    it("should re-open circuit if probe fails in half-open", async () => {
      mock.mockPermissions.checkPermission.mockRejectedValue(new Error("API down"));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        denyOnFailure: true,
        clock: createClock(),
      });

      // Open the circuit
      for (let i = 0; i < CIRCUIT_BREAKER_DEFAULTS.failureThreshold; i++) {
        try {
          await mw.onBeforeTurn(createTurnContext("tool-a"));
        } catch {
          // Expected
        }
      }

      // Advance past cooldown to half-open
      currentTime += CIRCUIT_BREAKER_DEFAULTS.cooldownMs + 1;

      // Probe fails
      mock.mockPermissions.checkPermission.mockClear();
      try {
        await mw.onBeforeTurn(createTurnContext("tool-a"));
      } catch {
        // Expected — probe failed
      }

      // Another request should not call API (circuit re-opened)
      mock.mockPermissions.checkPermission.mockClear();
      try {
        await mw.onBeforeTurn(createTurnContext("tool-b"));
      } catch {
        // Expected
      }

      expect(mock.mockPermissions.checkPermission).not.toHaveBeenCalled();
    });

    it("should close circuit after successful probe", async () => {
      mock.mockPermissions.checkPermission.mockRejectedValue(new Error("API down"));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        denyOnFailure: true,
        clock: createClock(),
      });

      // Open the circuit
      for (let i = 0; i < CIRCUIT_BREAKER_DEFAULTS.failureThreshold; i++) {
        try {
          await mw.onBeforeTurn(createTurnContext("tool-a"));
        } catch {
          // Expected
        }
      }

      // Advance past cooldown
      currentTime += CIRCUIT_BREAKER_DEFAULTS.cooldownMs + 1;

      // Probe succeeds
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });
      await mw.onBeforeTurn(createTurnContext("tool-a"));

      // Circuit is now closed — subsequent calls should hit API
      mock.mockPermissions.checkPermission.mockClear();
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      await mw.onBeforeTurn(createTurnContext("tool-b"));
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Clock injection for deterministic tests
  // =========================================================================

  describe("injectable clock", () => {
    it("should use provided clock for timing", async () => {
      const clock = createClock();
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
        clock,
      });

      // Advance time
      currentTime = 2000;

      const ctx = createTurnContext("any-tool");
      await mw.onBeforeTurn(ctx);
      // Should work regardless of clock value for allow pattern
    });

    it("should use Date.now when no clock provided", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
      });

      const ctx = createTurnContext("any-tool");
      await mw.onBeforeTurn(ctx);
      // Should work with default clock
    });
  });

  // =========================================================================
  // State reset across sessions
  // =========================================================================

  describe("session boundary reset", () => {
    it("should reset circuit breaker on session end", async () => {
      const callback = vi.fn().mockRejectedValue(new Error("fail"));
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        clock: createClock(),
      });

      // Fail multiple times
      for (let i = 0; i < CIRCUIT_BREAKER_DEFAULTS.failureThreshold; i++) {
        try {
          await mw.onBeforeTurn(createTurnContext("ask-tool"));
        } catch {
          // Expected
        }
      }

      // End session — should reset state
      await mw.onSessionEnd({ sessionId: "sess-1" });

      // New session — fresh callback that succeeds
      callback.mockResolvedValue("allow");
      await mw.onSessionStart({ sessionId: "sess-2" });

      const ctx = createTurnContext("ask-tool", "sess-2");
      await mw.onBeforeTurn(ctx);

      expect((ctx.metadata?.permissionCheck as Record<string, unknown>)?.granted).toBe(true);
    });
  });

  // =========================================================================
  // Cooldown defaults
  // =========================================================================

  describe("defaults", () => {
    it("should have expected failure threshold", () => {
      expect(CIRCUIT_BREAKER_DEFAULTS.failureThreshold).toBe(3);
    });

    it("should have expected cooldown", () => {
      expect(CIRCUIT_BREAKER_DEFAULTS.cooldownMs).toBe(30_000);
    });
  });
});
