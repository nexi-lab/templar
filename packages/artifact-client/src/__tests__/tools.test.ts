import type { Artifact, ArtifactMetadata, ArtifactSearchResponse, NexusClient } from "@nexus/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactClient } from "../client.js";
import { type ArtifactToolSet, createArtifactTools } from "../tools/index.js";

// ---------------------------------------------------------------------------
// Mock NexusClient
// ---------------------------------------------------------------------------

function createMockNexusClient() {
  return {
    artifacts: {
      list: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
      get: vi.fn(),
      getBatch: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      search: vi.fn(),
    },
  } as unknown as NexusClient;
}

const TOOL_ARTIFACT: Artifact = {
  id: "art-1",
  name: "calculate_refund",
  description: "Calculates refund amount",
  type: "tool",
  tags: ["finance"],
  version: 1,
  status: "active",
  createdBy: "agent-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  schema: { input: { orderId: "string" }, output: { amount: "number" } },
};

const AGENT_ARTIFACT: Artifact = {
  id: "art-2",
  name: "refund-specialist",
  description: "Refund specialist agent",
  type: "agent",
  tags: ["finance", "specialist"],
  version: 1,
  status: "active",
  createdBy: "agent-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  manifest: { model: "haiku", tools: ["calculate_refund"] },
};

const METADATA: ArtifactMetadata = {
  id: "art-1",
  name: "calculate_refund",
  description: "Calculates refund amount",
  type: "tool",
  tags: ["finance"],
  version: 1,
  status: "active",
  createdBy: "agent-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createArtifactTools", () => {
  let nexus: NexusClient;
  let client: ArtifactClient;
  let toolSet: ArtifactToolSet;

  beforeEach(() => {
    nexus = createMockNexusClient();
    client = new ArtifactClient(nexus, {
      searchTimeoutMs: 1_000,
      mutationTimeoutMs: 2_000,
    });
    toolSet = createArtifactTools(client);
  });

  // -------------------------------------------------------------------------
  // Tool definitions
  // -------------------------------------------------------------------------

  describe("tool definitions", () => {
    it("returns exactly 2 tools", () => {
      expect(toolSet.tools).toHaveLength(2);
    });

    it("includes create_artifact tool with correct schema", () => {
      const tool = toolSet.tools.find((t) => t.name === "create_artifact");
      expect(tool).toBeDefined();
      expect(tool?.description).toBeTruthy();
      expect(tool?.parameters).toBeDefined();

      const params = tool?.parameters as Record<string, unknown>;
      expect(params.type).toBe("object");

      const props = params.properties as Record<string, unknown>;
      expect(props.name).toBeDefined();
      expect(props.description).toBeDefined();
      expect(props.artifact_type).toBeDefined();
      expect(props.tags).toBeDefined();
      expect(props.schema).toBeDefined();
      expect(props.manifest).toBeDefined();

      const required = params.required as string[];
      expect(required).toContain("name");
      expect(required).toContain("description");
      expect(required).toContain("artifact_type");
    });

    it("includes search_artifacts tool with correct schema", () => {
      const tool = toolSet.tools.find((t) => t.name === "search_artifacts");
      expect(tool).toBeDefined();
      expect(tool?.description).toBeTruthy();
      expect(tool?.parameters).toBeDefined();

      const params = tool?.parameters as Record<string, unknown>;
      expect(params.type).toBe("object");

      const props = params.properties as Record<string, unknown>;
      expect(props.query).toBeDefined();
      expect(props.type).toBeDefined();
      expect(props.tags).toBeDefined();
      expect(props.limit).toBeDefined();

      const required = params.required as string[];
      expect(required).toContain("query");
    });

    it("tool definitions are immutable", () => {
      expect(Object.isFrozen(toolSet.tools)).toBe(true);
      for (const tool of toolSet.tools) {
        expect(Object.isFrozen(tool)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // create_artifact execution
  // -------------------------------------------------------------------------

  describe("create_artifact execution", () => {
    it("creates a tool artifact successfully", async () => {
      vi.mocked(nexus.artifacts.create).mockResolvedValue(TOOL_ARTIFACT);

      const result = await toolSet.execute("create_artifact", {
        name: "calculate_refund",
        description: "Calculates refund amount",
        artifact_type: "tool",
        tags: ["finance"],
        schema: { input: { orderId: "string" } },
      });

      expect(result).toEqual({
        success: true,
        artifact: {
          id: TOOL_ARTIFACT.id,
          name: TOOL_ARTIFACT.name,
          type: TOOL_ARTIFACT.type,
          version: TOOL_ARTIFACT.version,
        },
      });

      expect(nexus.artifacts.create).toHaveBeenCalledWith({
        name: "calculate_refund",
        description: "Calculates refund amount",
        type: "tool",
        tags: ["finance"],
        schema: { input: { orderId: "string" } },
      });
    });

    it("creates an agent artifact successfully", async () => {
      vi.mocked(nexus.artifacts.create).mockResolvedValue(AGENT_ARTIFACT);

      const result = await toolSet.execute("create_artifact", {
        name: "refund-specialist",
        description: "Refund specialist agent",
        artifact_type: "agent",
        manifest: { model: "haiku", tools: ["calculate_refund"] },
      });

      expect(result).toEqual({
        success: true,
        artifact: {
          id: AGENT_ARTIFACT.id,
          name: AGENT_ARTIFACT.name,
          type: AGENT_ARTIFACT.type,
          version: AGENT_ARTIFACT.version,
        },
      });
    });

    it("returns error for missing name", async () => {
      const result = await toolSet.execute("create_artifact", {
        description: "test",
        artifact_type: "tool",
        schema: {},
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("name"),
      });
    });

    it("returns error for missing description", async () => {
      const result = await toolSet.execute("create_artifact", {
        name: "test",
        artifact_type: "tool",
        schema: {},
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("description"),
      });
    });

    it("returns error for tool artifact without schema", async () => {
      const result = await toolSet.execute("create_artifact", {
        name: "test",
        description: "test",
        artifact_type: "tool",
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("schema"),
      });
    });

    it("returns error for agent artifact without manifest", async () => {
      const result = await toolSet.execute("create_artifact", {
        name: "test",
        description: "test",
        artifact_type: "agent",
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("manifest"),
      });
    });

    it("returns error for invalid artifact type", async () => {
      const result = await toolSet.execute("create_artifact", {
        name: "test",
        description: "test",
        artifact_type: "invalid",
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("type"),
      });
    });

    it("returns error when store is unavailable", async () => {
      vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      const tools = createArtifactTools(noFallback);

      const result = await tools.execute("create_artifact", {
        name: "test",
        description: "test",
        artifact_type: "tool",
        schema: {},
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("unavailable"),
      });
    });
  });

  // -------------------------------------------------------------------------
  // search_artifacts execution
  // -------------------------------------------------------------------------

  describe("search_artifacts execution", () => {
    it("searches artifacts successfully", async () => {
      const response: ArtifactSearchResponse = {
        results: [{ artifact: METADATA, score: 0.95 }],
      };
      vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

      const result = await toolSet.execute("search_artifacts", {
        query: "refund calculator",
      });

      expect(result).toEqual({
        success: true,
        results: [
          {
            id: METADATA.id,
            name: METADATA.name,
            description: METADATA.description,
            type: METADATA.type,
            tags: METADATA.tags,
            score: 0.95,
          },
        ],
      });
    });

    it("searches with type filter", async () => {
      const response: ArtifactSearchResponse = { results: [] };
      vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

      await toolSet.execute("search_artifacts", {
        query: "agent",
        type: "agent",
      });

      expect(nexus.artifacts.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "agent", type: "agent" }),
      );
    });

    it("searches with tags filter", async () => {
      const response: ArtifactSearchResponse = { results: [] };
      vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

      await toolSet.execute("search_artifacts", {
        query: "finance",
        tags: ["finance", "refund"],
      });

      expect(nexus.artifacts.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "finance", tags: ["finance", "refund"] }),
      );
    });

    it("searches with limit", async () => {
      const response: ArtifactSearchResponse = { results: [] };
      vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

      await toolSet.execute("search_artifacts", {
        query: "test",
        limit: 5,
      });

      expect(nexus.artifacts.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: "test", limit: 5 }),
      );
    });

    it("returns empty results array when no matches", async () => {
      const response: ArtifactSearchResponse = { results: [] };
      vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

      const result = await toolSet.execute("search_artifacts", {
        query: "nonexistent",
      });

      expect(result).toEqual({ success: true, results: [] });
    });

    it("returns error for missing query", async () => {
      const result = await toolSet.execute("search_artifacts", {});

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("query"),
      });
    });

    it("returns error for empty query string", async () => {
      const result = await toolSet.execute("search_artifacts", {
        query: "",
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("query"),
      });
    });

    it("returns error when search fails", async () => {
      vi.mocked(nexus.artifacts.search).mockRejectedValue(new Error("search backend down"));
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      const tools = createArtifactTools(noFallback);

      const result = await tools.execute("search_artifacts", {
        query: "test",
      });

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("search"),
      });
    });
  });

  // -------------------------------------------------------------------------
  // Unknown tool
  // -------------------------------------------------------------------------

  describe("unknown tool", () => {
    it("returns error for unrecognized tool name", async () => {
      const result = await toolSet.execute("unknown_tool", {});

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining("unknown_tool"),
      });
    });
  });
});
