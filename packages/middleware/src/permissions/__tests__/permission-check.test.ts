import type { TurnContext } from "@templar/core";
import { PermissionDeniedError } from "@templar/errors";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusPermissionsMiddleware } from "../middleware.js";

describe("Permission checks", () => {
  let mock: MockNexusClient;

  beforeEach(() => {
    mock = createMockNexusClient();
    vi.restoreAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  function createTurnContext(toolName: string, sessionId = "sess-1"): TurnContext {
    return {
      sessionId,
      turnNumber: 1,
      metadata: { toolCall: { name: toolName } },
    };
  }

  // =========================================================================
  // Local overrides (toolPermissions)
  // =========================================================================

  describe("local overrides", () => {
    it("should allow explicitly allowed tool (no API call)", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "web-search": "allow" },
      });

      const ctx = createTurnContext("web-search");
      await mw.onBeforeTurn(ctx);

      expect(mock.mockPermissions.checkPermission).not.toHaveBeenCalled();
      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "web-search",
        action: "execute",
        granted: true,
      });
    });

    it("should deny explicitly denied tool (no API call)", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
        toolPermissions: { "admin-tool": "deny" },
      });

      const ctx = createTurnContext("admin-tool");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
      expect(mock.mockPermissions.checkPermission).not.toHaveBeenCalled();
    });

    it("should throw PermissionDeniedError with correct fields", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const ctx = createTurnContext("blocked-tool");
      try {
        await mw.onBeforeTurn(ctx);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionDeniedError);
        const permError = error as PermissionDeniedError;
        expect(permError.tool).toBe("blocked-tool");
        expect(permError.action).toBe("execute");
      }
    });
  });

  // =========================================================================
  // Default pattern
  // =========================================================================

  describe("default pattern", () => {
    it("should allow when defaultPattern is 'allow' and tool not listed", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
      });

      const ctx = createTurnContext("unlisted-tool");
      await mw.onBeforeTurn(ctx);

      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "unlisted-tool",
        action: "execute",
        granted: true,
      });
    });

    it("should deny when defaultPattern is 'deny' and tool not listed", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const ctx = createTurnContext("unlisted-tool");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
    });
  });

  // =========================================================================
  // HITL 'ask' pattern
  // =========================================================================

  describe("ask pattern", () => {
    it("should call onPermissionRequest and allow on approval", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
      });

      const ctx = createTurnContext("ask-tool");
      await mw.onBeforeTurn(ctx);

      expect(callback).toHaveBeenCalledWith("ask-tool", ctx);
      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "ask-tool",
        action: "execute",
        granted: true,
      });
    });

    it("should call onPermissionRequest and deny on rejection", async () => {
      const callback = vi.fn().mockResolvedValue("deny");
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
      });

      const ctx = createTurnContext("ask-tool");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
    });

    it("should deny when ask callback throws", async () => {
      const callback = vi.fn().mockRejectedValue(new Error("Callback crashed"));
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
      });

      const ctx = createTurnContext("ask-tool");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
    });

    it("should deny when ask pattern but no callback configured", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        // No onPermissionRequest — bypassing validation for this test
      });

      const ctx = createTurnContext("ask-tool");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
    });

    it("should use defaultPattern 'ask' for unlisted tools", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "ask",
        onPermissionRequest: callback,
      });

      const ctx = createTurnContext("any-tool");
      await mw.onBeforeTurn(ctx);

      expect(callback).toHaveBeenCalledWith("any-tool", ctx);
    });
  });

  // =========================================================================
  // No tool call
  // =========================================================================

  describe("no tool call in context", () => {
    it("should skip check when no toolCall in metadata", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const ctx: TurnContext = { sessionId: "sess-1", turnNumber: 1 };
      await mw.onBeforeTurn(ctx);

      expect(mock.mockPermissions.checkPermission).not.toHaveBeenCalled();
    });

    it("should skip check when metadata is undefined", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const ctx: TurnContext = { sessionId: "sess-1", turnNumber: 1 };
      await mw.onBeforeTurn(ctx);
      // Should not throw
    });

    it("should skip when toolCall has no name", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const ctx: TurnContext = {
        sessionId: "sess-1",
        turnNumber: 1,
        metadata: { toolCall: { input: "something" } },
      };
      await mw.onBeforeTurn(ctx);
      // Should not throw
    });
  });

  // =========================================================================
  // "check" pattern — ReBAC API
  // =========================================================================

  describe("check pattern (ReBAC API)", () => {
    it("should call ReBAC API and allow when allowed", async () => {
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
      });

      const ctx = createTurnContext("web-search");
      await mw.onBeforeTurn(ctx);

      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledWith({
        subject: "sess-1",
        action: "execute",
        resource: "web-search",
      });
      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "web-search",
        action: "execute",
        granted: true,
      });
    });

    it("should call ReBAC API and deny when denied", async () => {
      mock.mockPermissions.checkPermission.mockResolvedValue({
        allowed: false,
        reason: "No matching policy",
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
      });

      const ctx = createTurnContext("admin-tool");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(1);
    });

    it("should use per-tool 'check' override", async () => {
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "api-tool": "check" },
      });

      const ctx = createTurnContext("api-tool");
      await mw.onBeforeTurn(ctx);

      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Permission cache (via "check" pattern)
  // =========================================================================

  describe("permission cache", () => {
    it("should cache API results and avoid repeat calls", async () => {
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
      });

      await mw.onBeforeTurn(createTurnContext("web-search"));
      await mw.onBeforeTurn(createTurnContext("web-search"));

      // Only 1 API call — second hit cache
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(1);
    });

    it("should re-check API when cache expires", async () => {
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      let now = 1000;
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        cacheTTLMs: 100,
        clock: { now: () => now },
      });

      await mw.onBeforeTurn(createTurnContext("web-search"));
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(1);

      // Advance past TTL
      now = 1200;
      await mw.onBeforeTurn(createTurnContext("web-search"));
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(2);
    });

    it("should cache different tools independently", async () => {
      mock.mockPermissions.checkPermission.mockResolvedValue({ allowed: true });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
      });

      await mw.onBeforeTurn(createTurnContext("tool-a"));
      await mw.onBeforeTurn(createTurnContext("tool-b"));

      // Both tools checked via API
      expect(mock.mockPermissions.checkPermission).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // API failure + denyOnFailure
  // =========================================================================

  describe("degradation behavior", () => {
    it("should deny on API timeout when denyOnFailure is true", async () => {
      mock.mockPermissions.checkPermission.mockImplementation(() => new Promise(() => {}));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        checkTimeoutMs: 10,
        denyOnFailure: true,
      });

      const ctx = createTurnContext("web-search");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
    });

    it("should allow on API timeout when denyOnFailure is false", async () => {
      mock.mockPermissions.checkPermission.mockImplementation(() => new Promise(() => {}));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        checkTimeoutMs: 10,
        denyOnFailure: false,
      });

      const ctx = createTurnContext("web-search");
      await mw.onBeforeTurn(ctx);

      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "web-search",
        action: "execute",
        granted: true,
      });
    });

    it("should deny on API error when denyOnFailure is true", async () => {
      mock.mockPermissions.checkPermission.mockRejectedValue(new Error("API down"));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "check",
        denyOnFailure: true,
      });

      const ctx = createTurnContext("web-search");
      await expect(mw.onBeforeTurn(ctx)).rejects.toThrow(PermissionDeniedError);
    });

    it("should inject permissionCheck metadata on allow", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
      });

      const ctx = createTurnContext("any-tool");
      await mw.onBeforeTurn(ctx);

      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "any-tool",
        action: "execute",
        granted: true,
      });
    });
  });
});
