import type { TurnContext } from "@templar/core";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NexusPermissionsMiddleware } from "../middleware.js";

describe("Progressive allowlisting", () => {
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
  // Progressive disabled
  // =========================================================================

  describe("disabled", () => {
    it("should not count approvals when progressiveAllowlist is false", async () => {
      const callback = vi.fn().mockResolvedValue("allow");

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: false,
      });

      // Approve 5 times
      for (let i = 0; i < 5; i++) {
        const ctx = createTurnContext("ask-tool");
        await mw.onBeforeTurn(ctx);
      }

      expect(mock.mockPermissions.grantPermission).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Counter increments
  // =========================================================================

  describe("counter tracking", () => {
    it("should increment counter on HITL approval", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      mock.mockPermissions.grantPermission.mockResolvedValue({
        granted: true,
        permission_id: "perm-1",
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: true,
        progressiveThreshold: 3,
      });

      // First 2 approvals — below threshold
      for (let i = 0; i < 2; i++) {
        const ctx = createTurnContext("ask-tool");
        await mw.onBeforeTurn(ctx);
      }
      expect(mock.mockPermissions.grantPermission).not.toHaveBeenCalled();

      // 3rd approval — hits threshold
      const ctx = createTurnContext("ask-tool");
      await mw.onBeforeTurn(ctx);

      expect(mock.mockPermissions.grantPermission).toHaveBeenCalledTimes(1);
      expect(mock.mockPermissions.grantPermission).toHaveBeenCalledWith({
        subject: "sess-1",
        action: "execute",
        resource: "ask-tool",
      });
    });

    it("should not count denials", async () => {
      // First 2 calls approve, then deny, then approve
      const callback = vi
        .fn()
        .mockResolvedValueOnce("allow")
        .mockResolvedValueOnce("allow")
        .mockResolvedValueOnce("deny")
        .mockResolvedValueOnce("allow"); // This should be count 3

      mock.mockPermissions.grantPermission.mockResolvedValue({
        granted: true,
        permission_id: "perm-1",
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: true,
        progressiveThreshold: 3,
      });

      // Allow #1
      await mw.onBeforeTurn(createTurnContext("ask-tool"));
      // Allow #2
      await mw.onBeforeTurn(createTurnContext("ask-tool"));
      // Deny — should NOT increment
      try {
        await mw.onBeforeTurn(createTurnContext("ask-tool"));
      } catch {
        // Expected PermissionDeniedError
      }

      expect(mock.mockPermissions.grantPermission).not.toHaveBeenCalled();

      // Allow #3 — should reach threshold
      await mw.onBeforeTurn(createTurnContext("ask-tool"));
      expect(mock.mockPermissions.grantPermission).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Multiple tools tracked independently
  // =========================================================================

  describe("independent tool tracking", () => {
    it("should track counters per tool independently", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      mock.mockPermissions.grantPermission.mockResolvedValue({
        granted: true,
        permission_id: "perm-1",
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "tool-a": "ask", "tool-b": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: true,
        progressiveThreshold: 2,
      });

      // Approve tool-a twice — should grant
      await mw.onBeforeTurn(createTurnContext("tool-a"));
      await mw.onBeforeTurn(createTurnContext("tool-a"));
      expect(mock.mockPermissions.grantPermission).toHaveBeenCalledTimes(1);

      // Approve tool-b once — not yet
      await mw.onBeforeTurn(createTurnContext("tool-b"));
      expect(mock.mockPermissions.grantPermission).toHaveBeenCalledTimes(1);

      // Approve tool-b second time — now grant
      await mw.onBeforeTurn(createTurnContext("tool-b"));
      expect(mock.mockPermissions.grantPermission).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Grant failure graceful degradation
  // =========================================================================

  describe("grant failure", () => {
    it("should log and not throw when grant API fails", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      mock.mockPermissions.grantPermission.mockRejectedValue(new Error("Grant API down"));

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: true,
        progressiveThreshold: 1,
      });

      // Should not throw even though grant fails
      const ctx = createTurnContext("ask-tool");
      await mw.onBeforeTurn(ctx);

      expect(mock.mockPermissions.grantPermission).toHaveBeenCalled();
      // The tool call itself should still be allowed
      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "ask-tool",
        action: "execute",
        granted: true,
      });
    });

    it("should log when grant times out", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      mock.mockPermissions.grantPermission.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: true,
        progressiveThreshold: 1,
        grantTimeoutMs: 10,
      });

      const ctx = createTurnContext("ask-tool");
      await mw.onBeforeTurn(ctx);

      // Should still allow — grant is fire-and-forget
      expect(ctx.metadata?.permissionCheck).toEqual({
        resource: "ask-tool",
        action: "execute",
        granted: true,
      });
    });
  });

  // =========================================================================
  // After progressive grant, tool cached as allowed
  // =========================================================================

  describe("cache after grant", () => {
    it("should cache tool as allowed after successful grant", async () => {
      const callback = vi.fn().mockResolvedValue("allow");
      mock.mockPermissions.grantPermission.mockResolvedValue({
        granted: true,
        permission_id: "perm-1",
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        toolPermissions: { "ask-tool": "ask" },
        onPermissionRequest: callback,
        progressiveAllowlist: true,
        progressiveThreshold: 1,
      });

      // First call — triggers grant
      await mw.onBeforeTurn(createTurnContext("ask-tool"));
      expect(callback).toHaveBeenCalledTimes(1);

      // Subsequent calls still go through ask callback because the
      // tool's toolPermissions override is 'ask', not API-based.
      // The cache is for ReBAC API results, not local overrides.
      await mw.onBeforeTurn(createTurnContext("ask-tool"));
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });
});
