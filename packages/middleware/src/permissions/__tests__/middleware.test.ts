import type { SessionContext, TurnContext } from "@templar/core";
import { PermissionConfigurationError } from "@templar/errors";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNexusPermissionsMiddleware,
  NexusPermissionsMiddleware,
  validatePermissionsConfig,
} from "../index.js";

describe("NexusPermissionsMiddleware", () => {
  let mock: MockNexusClient;

  beforeEach(() => {
    mock = createMockNexusClient();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Constructor & factory
  // =========================================================================

  describe("constructor and factory", () => {
    it("should create middleware with correct name", () => {
      const mw = createNexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      expect(mw.name).toBe("nexus-permissions");
      expect(mw).toBeInstanceOf(NexusPermissionsMiddleware);
    });

    it("should accept valid config with all options", () => {
      const mw = createNexusPermissionsMiddleware(mock.client, {
        defaultPattern: "ask",
        toolPermissions: { "web-search": "allow", "admin-tool": "deny" },
        progressiveAllowlist: true,
        progressiveThreshold: 5,
        onPermissionRequest: vi.fn().mockResolvedValue("allow"),
        checkTimeoutMs: 5000,
        grantTimeoutMs: 10000,
        namespaceQueryTimeoutMs: 5000,
        denyOnFailure: false,
        cacheTTLMs: 60_000,
      });

      expect(mw.name).toBe("nexus-permissions");
    });
  });

  // =========================================================================
  // Config validation
  // =========================================================================

  describe("config validation", () => {
    it("should throw on 'ask' default without callback", () => {
      expect(() => validatePermissionsConfig({ defaultPattern: "ask" })).toThrow(
        PermissionConfigurationError,
      );
    });

    it("should throw on 'ask' tool without callback", () => {
      expect(() =>
        validatePermissionsConfig({
          defaultPattern: "allow",
          toolPermissions: { "web-search": "ask" },
        }),
      ).toThrow(PermissionConfigurationError);
    });

    it("should accept 'ask' with callback", () => {
      expect(() =>
        validatePermissionsConfig({
          defaultPattern: "ask",
          onPermissionRequest: vi.fn(),
        }),
      ).not.toThrow();
    });

    it("should throw on invalid progressiveThreshold", () => {
      expect(() =>
        validatePermissionsConfig({
          defaultPattern: "allow",
          progressiveThreshold: 0,
        }),
      ).toThrow(PermissionConfigurationError);
    });

    it("should throw on invalid checkTimeoutMs", () => {
      expect(() =>
        validatePermissionsConfig({
          defaultPattern: "allow",
          checkTimeoutMs: 0,
        }),
      ).toThrow(PermissionConfigurationError);
    });

    it("should throw on invalid grantTimeoutMs", () => {
      expect(() =>
        validatePermissionsConfig({
          defaultPattern: "allow",
          grantTimeoutMs: -1,
        }),
      ).toThrow(PermissionConfigurationError);
    });

    it("should throw on invalid namespaceQueryTimeoutMs", () => {
      expect(() =>
        validatePermissionsConfig({
          defaultPattern: "allow",
          namespaceQueryTimeoutMs: 0,
        }),
      ).toThrow(PermissionConfigurationError);
    });

    it("should include issues array in error", () => {
      try {
        validatePermissionsConfig({
          defaultPattern: "ask",
          checkTimeoutMs: 0,
        });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PermissionConfigurationError);
        const permError = error as PermissionConfigurationError;
        expect(permError.issues).toBeDefined();
        expect(permError.issues?.length).toBeGreaterThanOrEqual(2);
      }
    });
  });

  // =========================================================================
  // onSessionStart
  // =========================================================================

  describe("onSessionStart", () => {
    it("should query namespace tools and inject metadata", async () => {
      mock.mockPermissions.listNamespaceTools.mockResolvedValue({
        tools: ["web-search", "calculator"],
      });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const context: SessionContext = {
        sessionId: "sess-1",
        metadata: { namespace: "production" },
      };

      await mw.onSessionStart(context);

      expect(mock.mockPermissions.listNamespaceTools).toHaveBeenCalledWith({
        namespace: "production",
      });
      expect(context.metadata?.visibleTools).toEqual(["web-search", "calculator"]);
    });

    it("should pass agentId as subject to namespace query", async () => {
      mock.mockPermissions.listNamespaceTools.mockResolvedValue({ tools: [] });

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const context: SessionContext = {
        sessionId: "sess-1",
        agentId: "agent-001",
        metadata: { namespace: "production" },
      };

      await mw.onSessionStart(context);

      expect(mock.mockPermissions.listNamespaceTools).toHaveBeenCalledWith({
        namespace: "production",
        subject: "agent-001",
      });
    });

    it("should skip namespace query when no namespace in metadata", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
      });

      const context: SessionContext = { sessionId: "sess-1" };
      await mw.onSessionStart(context);

      expect(mock.mockPermissions.listNamespaceTools).not.toHaveBeenCalled();
      expect(context.metadata?.visibleTools).toEqual([]);
    });

    it("should handle namespace query timeout gracefully", async () => {
      mock.mockPermissions.listNamespaceTools.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "deny",
        namespaceQueryTimeoutMs: 10,
      });

      const context: SessionContext = {
        sessionId: "sess-1",
        metadata: { namespace: "production" },
      };

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      await mw.onSessionStart(context);

      // Should not throw, should have empty visible tools
      expect(context.metadata?.visibleTools).toEqual([]);
      warnSpy.mockRestore();
    });
  });

  // =========================================================================
  // onSessionEnd
  // =========================================================================

  describe("onSessionEnd", () => {
    it("should clear all state", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
      });

      const sessionContext: SessionContext = { sessionId: "sess-1" };
      await mw.onSessionStart(sessionContext);

      // Run a turn to populate cache
      const turnContext: TurnContext = {
        sessionId: "sess-1",
        turnNumber: 1,
        metadata: { toolCall: { name: "web-search" } },
      };
      await mw.onBeforeTurn(turnContext);

      await mw.onSessionEnd(sessionContext);

      // After end, metadata from a new session start should show empty tools
      const newSession: SessionContext = { sessionId: "sess-2" };
      await mw.onSessionStart(newSession);
      expect(newSession.metadata?.visibleTools).toEqual([]);
    });
  });

  // =========================================================================
  // onAfterTurn
  // =========================================================================

  describe("onAfterTurn", () => {
    it("should be a no-op", async () => {
      const mw = new NexusPermissionsMiddleware(mock.client, {
        defaultPattern: "allow",
      });

      const context: TurnContext = { sessionId: "sess-1", turnNumber: 1 };
      await expect(mw.onAfterTurn(context)).resolves.toBeUndefined();
    });
  });
});
