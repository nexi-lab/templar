/**
 * Tests for artifact resolver integration in SpawnGovernanceMiddleware (#162)
 *
 * Verifies that the middleware can resolve agent artifacts from an external
 * Resolver<Meta, Full> (e.g., ArtifactClient) when sub-agent manifests
 * are not found locally.
 */
import type { Resolver } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { SpawnGovernanceMiddleware } from "../spawn-governance-middleware.js";

// ---------------------------------------------------------------------------
// Mock types — mirrors @nexus/sdk Artifact shape without coupling to it
// ---------------------------------------------------------------------------

interface MockMeta {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

interface MockFull {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly manifest?: Record<string, unknown>;
  readonly schema?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function createMockResolver(items: readonly MockFull[] = []): Resolver<MockMeta, MockFull> {
  return {
    name: "test-resolver",
    discover: vi.fn().mockResolvedValue(items.map(({ id, name, type }) => ({ id, name, type }))),
    load: vi.fn().mockImplementation(async (id: string) => items.find((item) => item.id === id)),
  };
}

const AGENT_ARTIFACT: MockFull = {
  id: "art-agent-1",
  name: "refund-specialist",
  type: "agent",
  manifest: { model: "haiku", tools: ["calculate_refund"] },
};

const TOOL_ARTIFACT: MockFull = {
  id: "art-tool-1",
  name: "calculator",
  type: "tool",
  schema: { input: { x: "number" } },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SpawnGovernanceMiddleware — artifact resolver", () => {
  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------

  describe("construction", () => {
    it("creates without resolver (backward compatible)", () => {
      const mw = new SpawnGovernanceMiddleware();
      expect(mw.hasResolver()).toBe(false);
    });

    it("creates with resolver", () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });
      expect(mw.hasResolver()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // discoverAgents
  // -------------------------------------------------------------------------

  describe("discoverAgents()", () => {
    it("returns empty array when no resolver is configured", async () => {
      const mw = new SpawnGovernanceMiddleware();
      const result = await mw.discoverAgents();
      expect(result).toEqual([]);
    });

    it("delegates to resolver.discover()", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT, TOOL_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      const result = await mw.discoverAgents();
      expect(result).toHaveLength(2);
      expect(resolver.discover).toHaveBeenCalledOnce();
    });

    it("returns metadata from resolver", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      const result = await mw.discoverAgents();
      expect(result).toEqual([{ id: "art-agent-1", name: "refund-specialist", type: "agent" }]);
    });
  });

  // -------------------------------------------------------------------------
  // resolveAgent
  // -------------------------------------------------------------------------

  describe("resolveAgent()", () => {
    it("returns undefined when no resolver is configured", async () => {
      const mw = new SpawnGovernanceMiddleware();
      const result = await mw.resolveAgent("art-agent-1");
      expect(result).toBeUndefined();
    });

    it("loads agent by ID from resolver", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      const result = await mw.resolveAgent("art-agent-1");
      expect(result).toEqual(AGENT_ARTIFACT);
      expect(resolver.load).toHaveBeenCalledWith("art-agent-1");
    });

    it("returns undefined for non-existent agent", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      const result = await mw.resolveAgent("non-existent");
      expect(result).toBeUndefined();
    });

    it("returns the full entity (not just metadata)", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      const result = (await mw.resolveAgent("art-agent-1")) as MockFull | undefined;
      expect(result?.manifest).toEqual({ model: "haiku", tools: ["calculate_refund"] });
    });
  });

  // -------------------------------------------------------------------------
  // resolveAndCheckSpawn — combines resolution + governance
  // -------------------------------------------------------------------------

  describe("resolveAndCheckSpawn()", () => {
    it("resolves agent and checks spawn governance in one call", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({
        artifactResolver: resolver,
        maxSpawnDepth: 3,
      });

      const result = await mw.resolveAndCheckSpawn("parent-1", 1, "art-agent-1");
      expect(result.allowed).toBe(true);
      expect(result.entity).toEqual(AGENT_ARTIFACT);
    });

    it("returns not-found when agent doesn't exist", async () => {
      const resolver = createMockResolver([]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      const result = await mw.resolveAndCheckSpawn("parent-1", 1, "missing");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("not found");
      expect(result.entity).toBeUndefined();
    });

    it("returns not-found when no resolver is configured", async () => {
      const mw = new SpawnGovernanceMiddleware();

      const result = await mw.resolveAndCheckSpawn("parent-1", 1, "art-agent-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("no artifact resolver");
    });

    it("enforces depth limit even when artifact is found", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({
        artifactResolver: resolver,
        maxSpawnDepth: 1,
      });

      // Depth 2 exceeds maxSpawnDepth=1
      await expect(mw.resolveAndCheckSpawn("parent-1", 2, "art-agent-1")).rejects.toThrow();
    });

    it("enforces child limit even when artifact is found", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({
        artifactResolver: resolver,
        maxChildrenPerAgent: 1,
        maxSpawnDepth: 5,
        maxConcurrent: 100,
      });

      mw.checkSpawn("parent-1", 1);
      mw.recordSpawn("parent-1");

      // Second child exceeds limit
      await expect(mw.resolveAndCheckSpawn("parent-1", 1, "art-agent-1")).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Session lifecycle clears resolver state
  // -------------------------------------------------------------------------

  describe("session lifecycle", () => {
    it("resolver is preserved across session resets", async () => {
      const resolver = createMockResolver([AGENT_ARTIFACT]);
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      await mw.onSessionStart({ sessionId: "session-1" });
      expect(mw.hasResolver()).toBe(true);

      // Resolver should still work after session reset
      const result = await mw.resolveAgent("art-agent-1");
      expect(result).toEqual(AGENT_ARTIFACT);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe("error handling", () => {
    it("propagates resolver errors from discoverAgents", async () => {
      const resolver = createMockResolver();
      vi.mocked(resolver.discover).mockRejectedValue(new Error("network"));
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      await expect(mw.discoverAgents()).rejects.toThrow("network");
    });

    it("propagates resolver errors from resolveAgent", async () => {
      const resolver = createMockResolver();
      vi.mocked(resolver.load).mockRejectedValue(new Error("timeout"));
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      await expect(mw.resolveAgent("art-1")).rejects.toThrow("timeout");
    });

    it("propagates resolver errors from resolveAndCheckSpawn", async () => {
      const resolver = createMockResolver();
      vi.mocked(resolver.load).mockRejectedValue(new Error("unavailable"));
      const mw = new SpawnGovernanceMiddleware({ artifactResolver: resolver });

      await expect(mw.resolveAndCheckSpawn("parent", 1, "art-1")).rejects.toThrow("unavailable");
    });
  });
});
