import type {
  Artifact,
  ArtifactMetadata,
  ArtifactSearchResponse,
  ArtifactsResponse,
  NexusClient,
} from "@nexus/sdk";
import type { SessionContext, ToolRequest, ToolResponse } from "@templar/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactClient } from "../client.js";
import { ArtifactMiddleware } from "../middleware/index.js";

// ---------------------------------------------------------------------------
// Mock NexusClient
// ---------------------------------------------------------------------------

function createMockNexusClient() {
  return {
    artifacts: {
      list: vi.fn(),
      get: vi.fn(),
      getBatch: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      search: vi.fn(),
    },
  } as unknown as NexusClient;
}

const TOOL_METADATA: ArtifactMetadata = {
  id: "art-1",
  name: "calculator",
  description: "Calculates things",
  type: "tool",
  tags: ["math"],
  version: 1,
  status: "active",
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

const AGENT_METADATA: ArtifactMetadata = {
  id: "art-2",
  name: "assistant",
  description: "Helpful assistant",
  type: "agent",
  tags: ["chat"],
  version: 2,
  status: "active",
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
};

const TOOL_ARTIFACT: Artifact = {
  id: "art-1",
  name: "calculator",
  description: "Calculates things",
  type: "tool",
  tags: ["math"],
  version: 1,
  status: "active",
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  schema: { input: { x: "number" } },
};

function createSessionContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: "session-1",
    agentId: "agent-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ArtifactMiddleware", () => {
  let nexus: NexusClient;
  let client: ArtifactClient;
  let middleware: ArtifactMiddleware;

  beforeEach(() => {
    vi.restoreAllMocks();
    nexus = createMockNexusClient();
    client = new ArtifactClient(nexus, {
      searchTimeoutMs: 1_000,
      mutationTimeoutMs: 2_000,
    });
    middleware = new ArtifactMiddleware(client);
  });

  describe("name", () => {
    it("has correct middleware name", () => {
      expect(middleware.name).toBe("artifact");
    });
  });

  // -------------------------------------------------------------------------
  // Lazy pre-load at session start
  // -------------------------------------------------------------------------

  describe("onSessionStart", () => {
    it("fires discover() in background (non-blocking)", async () => {
      const listResponse: ArtifactsResponse = {
        data: [TOOL_METADATA, AGENT_METADATA],
        hasMore: false,
      };
      // Make list slow to verify non-blocking
      vi.mocked(nexus.artifacts.list).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(listResponse), 50)),
      );

      const ctx = createSessionContext();
      const start = Date.now();
      await middleware.onSessionStart(ctx);
      const elapsed = Date.now() - start;

      // Should return almost immediately (non-blocking)
      expect(elapsed).toBeLessThan(40);
      // list should have been called
      expect(nexus.artifacts.list).toHaveBeenCalledOnce();
    });

    it("does not throw if discover fails", async () => {
      vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

      const ctx = createSessionContext();
      await expect(middleware.onSessionStart(ctx)).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Session-scoped artifact cache
  // -------------------------------------------------------------------------

  describe("session-scoped caching", () => {
    it("caches loaded artifacts for the session", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({
        data: [TOOL_METADATA],
        hasMore: false,
      });
      vi.mocked(nexus.artifacts.get).mockResolvedValue(TOOL_ARTIFACT);

      await middleware.onSessionStart(createSessionContext());

      // First load hits Nexus
      const first = await middleware.loadArtifact("art-1");
      expect(first).toEqual(TOOL_ARTIFACT);
      expect(nexus.artifacts.get).toHaveBeenCalledTimes(1);

      // Second load hits cache
      const second = await middleware.loadArtifact("art-1");
      expect(second).toEqual(TOOL_ARTIFACT);
      expect(nexus.artifacts.get).toHaveBeenCalledTimes(1); // No additional call
    });

    it("clears cache on session end", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({
        data: [TOOL_METADATA],
        hasMore: false,
      });
      vi.mocked(nexus.artifacts.get).mockResolvedValue(TOOL_ARTIFACT);

      await middleware.onSessionStart(createSessionContext());
      await middleware.loadArtifact("art-1");

      await middleware.onSessionEnd(createSessionContext());

      // After session end, cache is cleared — next load hits Nexus again
      await middleware.loadArtifact("art-1");
      expect(nexus.artifacts.get).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Session-scoped search result cache
  // -------------------------------------------------------------------------

  describe("session-scoped search cache", () => {
    it("caches search results by query string", async () => {
      const searchResponse: ArtifactSearchResponse = {
        results: [{ artifact: TOOL_METADATA, score: 0.95 }],
      };
      vi.mocked(nexus.artifacts.list).mockResolvedValue({ data: [], hasMore: false });
      vi.mocked(nexus.artifacts.search).mockResolvedValue(searchResponse);

      await middleware.onSessionStart(createSessionContext());

      // First search hits Nexus
      const first = await middleware.searchArtifacts({ query: "calculator" });
      expect(first).toHaveLength(1);
      expect(nexus.artifacts.search).toHaveBeenCalledTimes(1);

      // Same query hits cache
      const second = await middleware.searchArtifacts({ query: "calculator" });
      expect(second).toHaveLength(1);
      expect(nexus.artifacts.search).toHaveBeenCalledTimes(1);
    });

    it("different queries hit Nexus separately", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({ data: [], hasMore: false });
      vi.mocked(nexus.artifacts.search).mockResolvedValue({ results: [] });

      await middleware.onSessionStart(createSessionContext());

      await middleware.searchArtifacts({ query: "calculator" });
      await middleware.searchArtifacts({ query: "assistant" });

      expect(nexus.artifacts.search).toHaveBeenCalledTimes(2);
    });

    it("clears search cache on session end", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({ data: [], hasMore: false });
      vi.mocked(nexus.artifacts.search).mockResolvedValue({ results: [] });

      await middleware.onSessionStart(createSessionContext());
      await middleware.searchArtifacts({ query: "calculator" });

      await middleware.onSessionEnd(createSessionContext());
      await middleware.onSessionStart(createSessionContext());
      await middleware.searchArtifacts({ query: "calculator" });

      expect(nexus.artifacts.search).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // Pre-loaded metadata access
  // -------------------------------------------------------------------------

  describe("getPreloadedMetadata", () => {
    it("returns pre-loaded metadata after lazy load completes", async () => {
      const listResponse: ArtifactsResponse = {
        data: [TOOL_METADATA, AGENT_METADATA],
        hasMore: false,
      };
      vi.mocked(nexus.artifacts.list).mockResolvedValue(listResponse);

      await middleware.onSessionStart(createSessionContext());
      // Wait for lazy load to complete
      const metadata = await middleware.getPreloadedMetadata();

      expect(metadata).toHaveLength(2);
      expect(metadata[0]?.id).toBe("art-1");
      expect(metadata[1]?.id).toBe("art-2");
    });

    it("returns empty array if pre-load fails", async () => {
      vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

      await middleware.onSessionStart(createSessionContext());
      const metadata = await middleware.getPreloadedMetadata();

      expect(metadata).toEqual([]);
    });

    it("returns empty array before session starts", async () => {
      const metadata = await middleware.getPreloadedMetadata();
      expect(metadata).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // wrapToolCall integration
  // -------------------------------------------------------------------------

  describe("wrapToolCall", () => {
    it("intercepts create_artifact tool calls", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({ data: [], hasMore: false });
      vi.mocked(nexus.artifacts.create).mockResolvedValue(TOOL_ARTIFACT);

      await middleware.onSessionStart(createSessionContext());

      const req: ToolRequest = {
        toolName: "create_artifact",
        input: {
          name: "calculator",
          description: "Calculates things",
          artifact_type: "tool",
          schema: { input: { x: "number" } },
        },
      };

      const mockNext = vi.fn<(req: ToolRequest) => Promise<ToolResponse>>();
      const response = await middleware.wrapToolCall(req, mockNext);

      // Should NOT call next — middleware handles it directly
      expect(mockNext).not.toHaveBeenCalled();
      const output = response.output as { success: boolean };
      expect(output.success).toBe(true);
    });

    it("intercepts search_artifacts tool calls", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({ data: [], hasMore: false });
      vi.mocked(nexus.artifacts.search).mockResolvedValue({ results: [] });

      await middleware.onSessionStart(createSessionContext());

      const req: ToolRequest = {
        toolName: "search_artifacts",
        input: { query: "calculator" },
      };

      const mockNext = vi.fn<(req: ToolRequest) => Promise<ToolResponse>>();
      const response = await middleware.wrapToolCall(req, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      const output = response.output as { success: boolean };
      expect(output.success).toBe(true);
    });

    it("passes through non-artifact tool calls to next", async () => {
      vi.mocked(nexus.artifacts.list).mockResolvedValue({ data: [], hasMore: false });

      await middleware.onSessionStart(createSessionContext());

      const req: ToolRequest = {
        toolName: "some_other_tool",
        input: { foo: "bar" },
      };

      const mockNext = vi.fn<(req: ToolRequest) => Promise<ToolResponse>>().mockResolvedValue({
        output: { result: "ok" },
      });

      const response = await middleware.wrapToolCall(req, mockNext);

      expect(mockNext).toHaveBeenCalledWith(req);
      expect(response.output).toEqual({ result: "ok" });
    });
  });
});
