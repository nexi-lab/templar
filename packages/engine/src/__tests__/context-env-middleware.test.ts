import type { SessionContext } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEnvMiddleware, createContextEnvMiddleware } from "../context-env-middleware.js";

// ---------------------------------------------------------------------------
// Helper: create a SessionContext with all fields
// ---------------------------------------------------------------------------

function fullSessionContext(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: "sess-001",
    agentId: "agent-001",
    userId: "user-001",
    channelType: "telegram",
    zoneId: "zone-alpha",
    nodeId: "node-001",
    ...overrides,
  };
}

describe("ContextEnvMiddleware", () => {
  // -----------------------------------------------------------------------
  // 1. Middleware identity
  // -----------------------------------------------------------------------

  it("has the correct name", () => {
    const mw = new ContextEnvMiddleware();
    expect(mw.name).toBe("templar-context-env");
  });

  // -----------------------------------------------------------------------
  // 2. buildRuntimeContext() — core utility
  // -----------------------------------------------------------------------

  describe("buildRuntimeContext()", () => {
    it("maps all 6 SessionContext fields to RuntimeContext", () => {
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext(fullSessionContext());

      expect(ctx.sessionId).toBe("sess-001");
      expect(ctx.agentId).toBe("agent-001");
      expect(ctx.userId).toBe("user-001");
      expect(ctx.channelType).toBe("telegram");
      expect(ctx.zoneId).toBe("zone-alpha");
      expect(ctx.nodeId).toBe("node-001");
    });

    it("handles minimal SessionContext (only sessionId)", () => {
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext({ sessionId: "sess-min" });

      expect(ctx.sessionId).toBe("sess-min");
      expect(ctx.agentId).toBeUndefined();
      expect(ctx.userId).toBeUndefined();
      expect(ctx.channelType).toBeUndefined();
      expect(ctx.zoneId).toBeUndefined();
      expect(ctx.nodeId).toBeUndefined();
    });

    it("passes through metadata", () => {
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext(fullSessionContext({ metadata: { role: "admin" } }));

      expect(ctx.metadata).toEqual({ role: "admin" });
    });
  });

  // -----------------------------------------------------------------------
  // 3. zoneId resolution chain
  // -----------------------------------------------------------------------

  describe("zoneId resolution", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("prefers config.zoneId over all others", () => {
      process.env.NEXUS_ZONE_ID = "env-zone";
      const mw = new ContextEnvMiddleware({ zoneId: "config-zone" });
      const ctx = mw.buildRuntimeContext(fullSessionContext({ zoneId: "session-zone" }));

      expect(ctx.zoneId).toBe("config-zone");
    });

    it("falls back to SessionContext.zoneId when config.zoneId is absent", () => {
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext(fullSessionContext({ zoneId: "session-zone" }));

      expect(ctx.zoneId).toBe("session-zone");
    });

    it("falls back to process.env.NEXUS_ZONE_ID when both config and session are absent", () => {
      process.env.NEXUS_ZONE_ID = "env-zone";
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext({ sessionId: "sess-no-zone" });

      expect(ctx.zoneId).toBe("env-zone");
    });

    it("uses custom env key when configured", () => {
      process.env.MY_ZONE = "custom-zone";
      const mw = new ContextEnvMiddleware({ zoneIdEnvKey: "MY_ZONE" });
      const ctx = mw.buildRuntimeContext({ sessionId: "sess-custom" });

      expect(ctx.zoneId).toBe("custom-zone");
    });

    it("returns undefined when no source has a zone ID", () => {
      delete process.env.NEXUS_ZONE_ID;
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext({ sessionId: "sess-no-zone" });

      expect(ctx.zoneId).toBeUndefined();
    });

    it("treats empty string env var as undefined", () => {
      process.env.NEXUS_ZONE_ID = "";
      const mw = new ContextEnvMiddleware();
      const ctx = mw.buildRuntimeContext({ sessionId: "sess-empty-zone" });

      expect(ctx.zoneId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 4. onSessionStart / onSessionEnd lifecycle
  // -----------------------------------------------------------------------

  describe("lifecycle", () => {
    it("stores context on session start", async () => {
      const mw = new ContextEnvMiddleware();
      expect(mw.getLastContext()).toBeUndefined();

      await mw.onSessionStart(fullSessionContext());
      expect(mw.getLastContext()).toBeDefined();
      expect(mw.getLastContext()?.sessionId).toBe("sess-001");
    });

    it("clears context on session end", async () => {
      const mw = new ContextEnvMiddleware();
      await mw.onSessionStart(fullSessionContext());
      expect(mw.getLastContext()).toBeDefined();

      await mw.onSessionEnd(fullSessionContext());
      expect(mw.getLastContext()).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 5. Factory function
  // -----------------------------------------------------------------------

  describe("createContextEnvMiddleware()", () => {
    it("creates middleware with default config", () => {
      const mw = createContextEnvMiddleware();
      expect(mw).toBeInstanceOf(ContextEnvMiddleware);
      expect(mw.name).toBe("templar-context-env");
    });

    it("creates middleware with custom config", () => {
      const mw = createContextEnvMiddleware({ zoneId: "my-zone" });
      const ctx = mw.buildRuntimeContext({ sessionId: "s1" });
      expect(ctx.zoneId).toBe("my-zone");
    });
  });

  // -----------------------------------------------------------------------
  // 6. Integration: auto-injection in createTemplar
  // -----------------------------------------------------------------------

  describe("auto-injection in createTemplar", () => {
    it("context env middleware is prepended to the middleware stack", async () => {
      // We import createTemplar and verify the middleware is in the stack
      const { _setDeepAgentsIntegrated } = await import("../create-templar.js");
      const { createTemplar } = await import("../index.js");

      _setDeepAgentsIntegrated(true);
      try {
        const result = createTemplar({ model: "gpt-4" }) as Record<string, unknown>;
        const middleware = result.middleware as Array<{ name?: string }>;

        // ContextEnvMiddleware should be the first middleware
        const first = middleware[0];
        expect(first).toBeDefined();
        expect(first?.name).toBe("templar-context-env");
      } finally {
        _setDeepAgentsIntegrated(false);
      }
    });

    it("context env middleware receives zoneId from config", async () => {
      const { _setDeepAgentsIntegrated } = await import("../create-templar.js");
      const { createTemplar } = await import("../index.js");

      _setDeepAgentsIntegrated(true);
      try {
        const result = createTemplar({ model: "gpt-4", zoneId: "test-zone" }) as Record<
          string,
          unknown
        >;
        const middleware = result.middleware as ContextEnvMiddleware[];
        const contextMw = middleware[0];
        if (!contextMw) throw new Error("Expected context middleware");

        // Build runtime context and verify zoneId is passed
        const ctx = contextMw.buildRuntimeContext({ sessionId: "s1" });
        expect(ctx.zoneId).toBe("test-zone");
      } finally {
        _setDeepAgentsIntegrated(false);
      }
    });
  });
});
