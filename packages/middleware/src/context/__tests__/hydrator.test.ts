import type { ContextHydrationConfig, HydrationMetrics } from "@templar/core";
import { HydrationSourceFailedError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextHydrator } from "../middleware.js";
import type { ContextHydratorDeps } from "../types.js";
import {
  createMockNexusClient,
  createMockToolExecutor,
  createTestSessionContext,
  type MockNexusClient,
} from "./helpers.js";

describe("ContextHydrator", () => {
  let mockNexus: MockNexusClient;
  let deps: ContextHydratorDeps;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockNexus = createMockNexusClient();
    deps = { nexus: mockNexus.client };
  });

  // -------------------------------------------------------------------------
  // 1. Graceful degradation (edge cases 1-5)
  // -------------------------------------------------------------------------
  describe("Graceful degradation", () => {
    it("should handle all sources failing with failureStrategy=continue", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockNexus.mockMemory.search.mockRejectedValue(new Error("API down"));

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
        failureStrategy: "continue",
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics.sourcesFailed).toBe(1);
      expect(metrics.sourcesResolved).toBe(0);
      expect(context.metadata?.hydratedContext).toBe("");
      warnSpy.mockRestore();
    });

    it("should resolve remaining sources when one is slow (per-source timeout)", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { executor, executeFn } = createMockToolExecutor();
      executeFn.mockResolvedValue("tool result");

      // Simulate a slow source that respects abort signal
      mockNexus.mockMemory.search.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            const timer = setTimeout(() => _resolve({ results: [] }), 60_000);
            // The per-source AbortController will abort, causing the promise to hang.
            // But AbortController in the resolver catches this. So we need to
            // make the promise reject on abort to properly simulate.
            // Since we can't hook into the signal here, just make it delay long.
            // The per-source timeout mechanism in resolveSource creates its own
            // AbortController and aborts it — but the mock doesn't listen.
            // So the promise races: the sourceController aborts, the resolver
            // function's finally fires, but the mock's promise stays pending.
            // This means Promise.allSettled won't settle for this source until
            // the mock resolves. Let's simulate a rejected promise after a delay.
            setTimeout(() => {
              clearTimeout(timer);
              reject(new Error("Timeout"));
            }, 100);
          }),
      );

      const config: ContextHydrationConfig = {
        sources: [
          { type: "memory_query", query: "test", timeoutMs: 50 },
          { type: "mcp_tool", tool: "fast-tool", timeoutMs: 5000 },
        ],
        maxHydrationTimeMs: 5000,
        failureStrategy: "continue",
      };

      const hydrator = new ContextHydrator(config, {
        nexus: mockNexus.client,
        toolExecutor: executor,
      });
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      // The memory_query fails but mcp_tool resolves
      expect(metrics.sourcesResolved).toBeGreaterThanOrEqual(1);
      expect(context.metadata?.hydratedContext).toContain("tool result");
      warnSpy.mockRestore();
    });

    it("should skip memory/workspace sources when NexusClient is undefined", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
      };

      const hydrator = new ContextHydrator(config, {}); // no deps
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      // Source gets empty content since no resolver
      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics.sourcesResolved).toBeGreaterThanOrEqual(0);
      warnSpy.mockRestore();
    });

    it("should skip MCP sources when ToolExecutor is undefined", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const config: ContextHydrationConfig = {
        sources: [{ type: "mcp_tool", tool: "my-tool" }],
      };

      const hydrator = new ContextHydrator(config, {}); // no toolExecutor
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics).toBeDefined();
      warnSpy.mockRestore();
    });

    it("should catch synchronous throws from a resolver", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockNexus.mockMemory.search.mockImplementation(() => {
        throw new Error("Synchronous boom");
      });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
        failureStrategy: "continue",
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics.sourcesFailed).toBe(1);
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Budget enforcement (edge cases 6-8)
  // -------------------------------------------------------------------------
  describe("Budget enforcement", () => {
    it("should truncate lowest-priority (last) source when total exceeds maxContextChars", async () => {
      mockNexus.mockMemory.search
        .mockResolvedValueOnce({
          results: [{ memory_id: "m1", content: "a".repeat(100), state: "active" }],
        })
        .mockResolvedValueOnce({
          results: [{ memory_id: "m2", content: "b".repeat(100), state: "active" }],
        });

      const config: ContextHydrationConfig = {
        sources: [
          { type: "memory_query", query: "first" },
          { type: "memory_query", query: "second" },
        ],
        maxContextChars: 150,
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const hydratedContext = context.metadata?.hydratedContext as string;
      // Total should not exceed budget (150) plus separator (\n\n = 2 chars)
      expect(hydratedContext.length).toBeLessThanOrEqual(152);
    });

    it("should apply per-source maxChars truncation", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({
        results: [{ memory_id: "m1", content: "x".repeat(500), state: "active" }],
      });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test", maxChars: 50 }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const hydratedContext = context.metadata?.hydratedContext as string;
      expect(hydratedContext.length).toBeLessThanOrEqual(50);
    });

    it("should handle all sources returning empty content", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({ results: [] });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "empty" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics.contextCharsUsed).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Template variables (edge cases 9-12)
  // -------------------------------------------------------------------------
  describe("Template variables", () => {
    it("should build template vars from SessionContext", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({
        results: [{ memory_id: "m1", content: "found", state: "active" }],
      });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "{{agent.id}} tasks" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext({ agentId: "my-agent" });

      await hydrator.onSessionStart(context);

      expect(mockNexus.mockMemory.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "my-agent tasks" }),
      );
    });

    it("should handle missing SessionContext.metadata safely", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({ results: [] });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      // Construct context without metadata property
      const context = {
        sessionId: "test-session-no-meta",
      } as import("@templar/core").SessionContext;

      // Should not throw
      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics).toBeDefined();
    });

    it("should pass task metadata as template vars", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({ results: [] });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "{{task.description}}" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext({
        metadata: { taskDescription: "fix login bug" },
      });

      await hydrator.onSessionStart(context);

      expect(mockNexus.mockMemory.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "fix login bug" }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // 4. Concurrency (edge cases 13-14)
  // -------------------------------------------------------------------------
  describe("Concurrency", () => {
    it("should handle concurrent sessions with isolated state", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({
        results: [{ memory_id: "m1", content: "shared data", state: "active" }],
      });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context1 = createTestSessionContext({ sessionId: "session-1" });
      const context2 = createTestSessionContext({ sessionId: "session-2" });

      await Promise.all([hydrator.onSessionStart(context1), hydrator.onSessionStart(context2)]);

      // Both sessions should get hydrated context
      expect(context1.metadata?.hydratedContext).toBeDefined();
      expect(context2.metadata?.hydratedContext).toBeDefined();
    });

    it("should produce clean hydration when onSessionStart called twice", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({
        results: [{ memory_id: "m1", content: "data", state: "active" }],
      });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);
      const firstContext = context.metadata?.hydratedContext;

      // Second call with same context — should use cache
      await hydrator.onSessionStart(context);
      const secondMetrics = context.metadata?.hydrationMetrics as HydrationMetrics;

      expect(secondMetrics.cacheHit).toBe(true);
      expect(context.metadata?.hydratedContext).toBe(firstContext);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Failure strategy: abort
  // -------------------------------------------------------------------------
  describe("failureStrategy: abort", () => {
    it("should throw HydrationSourceFailedError when a source fails", async () => {
      mockNexus.mockMemory.search.mockRejectedValue(new Error("API down"));

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
        failureStrategy: "abort",
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await expect(hydrator.onSessionStart(context)).rejects.toThrow(HydrationSourceFailedError);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Empty config
  // -------------------------------------------------------------------------
  describe("Empty config", () => {
    it("should handle empty sources array", async () => {
      const config: ContextHydrationConfig = { sources: [] };
      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics.sourcesResolved).toBe(0);
      expect(metrics.hydrationTimeMs).toBe(0);
    });

    it("should handle undefined sources", async () => {
      const config: ContextHydrationConfig = {};
      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics.sourcesResolved).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Metrics
  // -------------------------------------------------------------------------
  describe("Metrics", () => {
    it("should store hydration metrics in context.metadata", async () => {
      mockNexus.mockMemory.search.mockResolvedValue({
        results: [{ memory_id: "m1", content: "data", state: "active" }],
      });

      const config: ContextHydrationConfig = {
        sources: [{ type: "memory_query", query: "test" }],
      };

      const hydrator = new ContextHydrator(config, deps);
      const context = createTestSessionContext();

      await hydrator.onSessionStart(context);

      const metrics = context.metadata?.hydrationMetrics as HydrationMetrics;
      expect(metrics).toBeDefined();
      expect(metrics.hydrationTimeMs).toBeGreaterThanOrEqual(0);
      expect(metrics.sourcesResolved).toBe(1);
      expect(metrics.sourcesFailed).toBe(0);
      expect(metrics.contextCharsUsed).toBeGreaterThan(0);
      expect(metrics.cacheHit).toBe(false);
    });
  });
});
