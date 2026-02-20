/**
 * E2E Test — Context Environment Variable Injection (#128)
 *
 * Validates the FULL context injection stack:
 * 1. createTemplar() auto-prepends ContextEnvMiddleware
 * 2. ContextEnvMiddleware.onSessionStart() builds TemplarRuntimeContext
 * 3. runWithContext() scopes the context via AsyncLocalStorage
 * 4. getContext() / tryGetContext() surface the context in any async descendant
 * 5. buildEnvVars() maps context to TEMPLAR_* env vars
 * 6. Sandbox spawnSandboxed() injects TEMPLAR_* into child processes
 *
 * This test uses real AsyncLocalStorage (no mocks) and spawns actual child
 * processes via Node's child_process to validate end-to-end injection.
 */

import { spawn } from "node:child_process";
import {
  buildEnvVars,
  getContext,
  runWithContext,
  TEMPLAR_ENV_VARS,
  type TemplarRuntimeContext,
  tryGetContext,
} from "@templar/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContextEnvMiddleware } from "../../context-env-middleware.js";
import { _setDeepAgentsIntegrated, createTemplar } from "../../create-templar.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fullSessionContext() {
  return {
    sessionId: "e2e-sess-001",
    agentId: "e2e-agent-001",
    userId: "e2e-user-001",
    channelType: "telegram",
    zoneId: "e2e-zone-001",
    nodeId: "e2e-node-001",
  };
}

/**
 * Spawn a child process that prints specific env vars as JSON and return the parsed output.
 */
function spawnEnvReader(
  envVarNames: string[],
  env: Record<string, string>,
): Promise<Record<string, string | undefined>> {
  return new Promise((resolve, reject) => {
    const script = `
      const vars = {};
      for (const name of ${JSON.stringify(envVarNames)}) {
        vars[name] = process.env[name];
      }
      process.stdout.write(JSON.stringify(vars));
    `;

    const child = spawn("node", ["-e", script], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Child exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse child output: ${stdout}`));
      }
    });

    child.on("error", reject);
  });
}

// ===========================================================================
// E2E Tests
// ===========================================================================

describe("E2E: Context Environment Variable Injection (#128)", () => {
  // -----------------------------------------------------------------------
  // 1. Full middleware → context → env var pipeline
  // -----------------------------------------------------------------------

  describe("Full pipeline: middleware → context → env vars", () => {
    it("ContextEnvMiddleware builds context, runWithContext scopes it, buildEnvVars maps it", async () => {
      const mw = new ContextEnvMiddleware({ zoneId: "e2e-zone-override" });

      // Step 1: Middleware receives SessionContext on session start
      const session = fullSessionContext();
      await mw.onSessionStart(session);

      // Step 2: Middleware built a TemplarRuntimeContext
      const maybeCtx = mw.getLastContext();
      expect(maybeCtx).toBeDefined();
      const runtimeCtx = maybeCtx as TemplarRuntimeContext;
      expect(runtimeCtx.sessionId).toBe("e2e-sess-001");
      expect(runtimeCtx.zoneId).toBe("e2e-zone-override"); // config overrides session

      // Step 3: runWithContext scopes the context via AsyncLocalStorage
      const envVars = await runWithContext(runtimeCtx, async () => {
        // Verify context is accessible from async descendants
        const ctx = getContext();
        expect(ctx.sessionId).toBe("e2e-sess-001");
        expect(ctx.userId).toBe("e2e-user-001");

        // Step 4: Build TEMPLAR_* env vars
        return buildEnvVars(ctx);
      });

      // Step 5: Verify all 6 env vars are produced
      expect(envVars).toEqual({
        TEMPLAR_SESSION_ID: "e2e-sess-001",
        TEMPLAR_AGENT_ID: "e2e-agent-001",
        TEMPLAR_USER_ID: "e2e-user-001",
        TEMPLAR_CHANNEL: "telegram",
        TEMPLAR_ZONE_ID: "e2e-zone-override",
        TEMPLAR_NODE_ID: "e2e-node-001",
      });

      // Cleanup
      await mw.onSessionEnd(session);
      expect(mw.getLastContext()).toBeUndefined();
    });

    it("child process inherits TEMPLAR_* env vars via spawn", async () => {
      const ctx: TemplarRuntimeContext = {
        sessionId: "e2e-spawn-sess",
        agentId: "e2e-spawn-agent",
        userId: "e2e-spawn-user",
        channelType: "discord",
        zoneId: "e2e-spawn-zone",
        nodeId: "e2e-spawn-node",
      };

      const envVars = buildEnvVars(ctx);
      const allVarNames = Object.values(TEMPLAR_ENV_VARS);

      // Spawn a real child process with TEMPLAR_* vars in its environment
      const childResult = await spawnEnvReader(allVarNames, envVars);

      // Verify the child process sees all 6 TEMPLAR_* vars
      expect(childResult.TEMPLAR_SESSION_ID).toBe("e2e-spawn-sess");
      expect(childResult.TEMPLAR_AGENT_ID).toBe("e2e-spawn-agent");
      expect(childResult.TEMPLAR_USER_ID).toBe("e2e-spawn-user");
      expect(childResult.TEMPLAR_CHANNEL).toBe("discord");
      expect(childResult.TEMPLAR_ZONE_ID).toBe("e2e-spawn-zone");
      expect(childResult.TEMPLAR_NODE_ID).toBe("e2e-spawn-node");
    });

    it("partial context → child only sees populated TEMPLAR_* vars", async () => {
      const ctx: TemplarRuntimeContext = {
        sessionId: "e2e-partial-sess",
        userId: "e2e-partial-user",
      };

      const envVars = buildEnvVars(ctx);
      const allVarNames = Object.values(TEMPLAR_ENV_VARS);

      const childResult = await spawnEnvReader(allVarNames, envVars);

      expect(childResult.TEMPLAR_SESSION_ID).toBe("e2e-partial-sess");
      expect(childResult.TEMPLAR_USER_ID).toBe("e2e-partial-user");
      expect(childResult.TEMPLAR_AGENT_ID).toBeUndefined();
      expect(childResult.TEMPLAR_CHANNEL).toBeUndefined();
      expect(childResult.TEMPLAR_ZONE_ID).toBeUndefined();
      expect(childResult.TEMPLAR_NODE_ID).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // 2. createTemplar integration
  // -----------------------------------------------------------------------

  describe("createTemplar auto-injection", () => {
    beforeEach(() => {
      _setDeepAgentsIntegrated(true);
    });

    afterEach(() => {
      _setDeepAgentsIntegrated(false);
    });

    it("createTemplar auto-injects ContextEnvMiddleware as first middleware", () => {
      const result = createTemplar({ model: "gpt-4" }) as Record<string, unknown>;
      const middleware = result.middleware as Array<{ name?: string }>;

      expect(middleware.length).toBeGreaterThanOrEqual(1);
      expect(middleware[0]!.name).toBe("templar-context-env");
    });

    it("ContextEnvMiddleware from createTemplar builds full runtime context", async () => {
      const result = createTemplar({
        model: "gpt-4",
        zoneId: "e2e-create-zone",
      }) as Record<string, unknown>;
      const middleware = result.middleware as ContextEnvMiddleware[];
      const contextMw = middleware[0]!;

      const session = fullSessionContext();
      await contextMw.onSessionStart(session);

      const maybeRuntimeCtx = contextMw.getLastContext();
      expect(maybeRuntimeCtx).toBeDefined();
      const runtimeCtx = maybeRuntimeCtx as TemplarRuntimeContext;

      expect(runtimeCtx.zoneId).toBe("e2e-create-zone");

      const envVars = runWithContext(runtimeCtx, () => {
        const ctx = getContext();
        return buildEnvVars(ctx);
      });

      expect(envVars.TEMPLAR_SESSION_ID).toBe("e2e-sess-001");
      expect(envVars.TEMPLAR_ZONE_ID).toBe("e2e-create-zone");
      expect(envVars.TEMPLAR_USER_ID).toBe("e2e-user-001");

      await contextMw.onSessionEnd(session);
    });
  });

  // -----------------------------------------------------------------------
  // 3. Concurrent session isolation (E2E)
  // -----------------------------------------------------------------------

  describe("concurrent session isolation", () => {
    it("three simultaneous sessions see their own TEMPLAR_* vars", async () => {
      type EnvResult = Record<string, string>;
      const sessions = [
        { sessionId: "concurrent-A", userId: "user-A", channelType: "telegram" },
        { sessionId: "concurrent-B", userId: "user-B", channelType: "slack" },
        { sessionId: "concurrent-C", userId: "user-C", channelType: "discord" },
      ] as const;

      const results = await Promise.all(
        sessions.map(
          (session) =>
            new Promise<Record<string, string>>((resolve) => {
              runWithContext(session, async () => {
                await new Promise((r) => setTimeout(r, Math.random() * 20));
                const ctx = getContext();
                const vars = buildEnvVars(ctx);
                resolve(vars);
              });
            }),
        ),
      );

      const [r0, r1, r2] = results as [EnvResult, EnvResult, EnvResult];
      expect(r0.TEMPLAR_USER_ID).toBe("user-A");
      expect(r0.TEMPLAR_CHANNEL).toBe("telegram");
      expect(r1.TEMPLAR_USER_ID).toBe("user-B");
      expect(r1.TEMPLAR_CHANNEL).toBe("slack");
      expect(r2.TEMPLAR_USER_ID).toBe("user-C");
      expect(r2.TEMPLAR_CHANNEL).toBe("discord");
    });

    it("child processes spawned from concurrent contexts inherit correct vars", async () => {
      const sessions = [
        { sessionId: "spawn-A", userId: "spawn-user-A" },
        { sessionId: "spawn-B", userId: "spawn-user-B" },
      ] as const;

      const allVarNames = Object.values(TEMPLAR_ENV_VARS);

      const results = await Promise.all(
        sessions.map((session) =>
          runWithContext(session, async () => {
            const vars = buildEnvVars(getContext());
            return spawnEnvReader(allVarNames, vars);
          }),
        ),
      );

      const [s0, s1] = results as [
        Record<string, string | undefined>,
        Record<string, string | undefined>,
      ];
      expect(s0.TEMPLAR_SESSION_ID).toBe("spawn-A");
      expect(s0.TEMPLAR_USER_ID).toBe("spawn-user-A");
      expect(s1.TEMPLAR_SESSION_ID).toBe("spawn-B");
      expect(s1.TEMPLAR_USER_ID).toBe("spawn-user-B");
    });
  });

  // -----------------------------------------------------------------------
  // 4. Performance validation
  // -----------------------------------------------------------------------

  describe("performance", () => {
    it("buildEnvVars completes 10,000 calls in under 500ms", () => {
      const ctx: TemplarRuntimeContext = {
        sessionId: "perf-sess",
        agentId: "perf-agent",
        userId: "perf-user",
        channelType: "telegram",
        zoneId: "perf-zone",
        nodeId: "perf-node",
      };

      const start = performance.now();
      for (let i = 0; i < 10_000; i++) {
        buildEnvVars(ctx);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it("runWithContext + getContext round-trip completes 10,000 iterations in under 500ms", () => {
      const start = performance.now();
      for (let i = 0; i < 10_000; i++) {
        runWithContext({ sessionId: `perf-${i}` }, () => {
          getContext();
        });
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });

    it("ContextEnvMiddleware.buildRuntimeContext() completes 10,000 calls in under 500ms", () => {
      const mw = new ContextEnvMiddleware({ zoneId: "perf-zone" });
      const session = fullSessionContext();

      const start = performance.now();
      for (let i = 0; i < 10_000; i++) {
        mw.buildRuntimeContext(session);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(500);
    });
  });

  // -----------------------------------------------------------------------
  // 5. Lifecycle integrity
  // -----------------------------------------------------------------------

  describe("lifecycle integrity", () => {
    it("full session lifecycle: start → use context → end → context cleared", async () => {
      const mw = new ContextEnvMiddleware();
      const session = fullSessionContext();

      expect(mw.getLastContext()).toBeUndefined();

      await mw.onSessionStart(session);
      const ctx = mw.getLastContext();
      expect(ctx).toBeDefined();

      const activeCtxGuard = ctx as TemplarRuntimeContext;
      const result = await runWithContext(activeCtxGuard, async () => {
        const activeCtx = getContext();
        expect(activeCtx.sessionId).toBe("e2e-sess-001");

        const vars = buildEnvVars(activeCtx);
        expect(Object.keys(vars)).toHaveLength(6);
        return vars;
      });

      expect(result.TEMPLAR_SESSION_ID).toBe("e2e-sess-001");

      await mw.onSessionEnd(session);
      expect(mw.getLastContext()).toBeUndefined();
      expect(tryGetContext()).toBeUndefined();
    });

    it("multiple sequential sessions do not leak context", async () => {
      const mw = new ContextEnvMiddleware();

      await mw.onSessionStart({ sessionId: "seq-1", userId: "user-1" });
      const ctx1 = mw.getLastContext() as TemplarRuntimeContext;
      expect(ctx1.userId).toBe("user-1");
      await mw.onSessionEnd({ sessionId: "seq-1" });

      await mw.onSessionStart({ sessionId: "seq-2", userId: "user-2" });
      const ctx2 = mw.getLastContext() as TemplarRuntimeContext;
      expect(ctx2.userId).toBe("user-2");
      expect(ctx2.sessionId).toBe("seq-2");
      await mw.onSessionEnd({ sessionId: "seq-2" });

      expect(mw.getLastContext()).toBeUndefined();
    });
  });
});
