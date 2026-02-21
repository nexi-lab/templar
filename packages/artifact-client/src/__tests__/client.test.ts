import type {
  Artifact,
  ArtifactMetadata,
  ArtifactSearchResponse,
  ArtifactsBatchResponse,
  ArtifactsResponse,
  NexusClient,
} from "@nexus/sdk";
import {
  ArtifactNotFoundError,
  ArtifactSearchFailedError,
  ArtifactStoreUnavailableError,
  ArtifactVersionConflictError,
} from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactClient } from "../client.js";

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

const AGENT_ARTIFACT: Artifact = {
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
  manifest: { model: "gpt-4" },
};

const METADATA: ArtifactMetadata = {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ArtifactClient", () => {
  let nexus: NexusClient;
  let client: ArtifactClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
    client = new ArtifactClient(nexus, {
      searchTimeoutMs: 1_000,
      mutationTimeoutMs: 2_000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("has correct resolver name", () => {
      expect(client.name).toBe("nexus-artifact");
    });

    it("creates with default config", () => {
      const defaultClient = new ArtifactClient(nexus);
      expect(defaultClient.name).toBe("nexus-artifact");
    });

    it("disables fallback when configured", () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      expect(noFallback.name).toBe("nexus-artifact");
    });

    it("rejects negative searchTimeoutMs", () => {
      expect(() => new ArtifactClient(nexus, { searchTimeoutMs: -1 })).toThrow(
        "searchTimeoutMs must be positive",
      );
    });

    it("rejects zero mutationTimeoutMs", () => {
      expect(() => new ArtifactClient(nexus, { mutationTimeoutMs: 0 })).toThrow(
        "mutationTimeoutMs must be positive",
      );
    });

    it("rejects zero inMemoryCapacity", () => {
      expect(() => new ArtifactClient(nexus, { inMemoryCapacity: 0 })).toThrow(
        "inMemoryCapacity must be at least 1",
      );
    });
  });

  describe("discover", () => {
    it("returns metadata from Nexus API", async () => {
      const response: ArtifactsResponse = {
        data: [METADATA],
        hasMore: false,
      };
      vi.mocked(nexus.artifacts.list).mockResolvedValue(response);

      const result = await client.discover();
      expect(result).toEqual([METADATA]);
      expect(nexus.artifacts.list).toHaveBeenCalledOnce();
    });

    it("falls back to in-memory store on API failure", async () => {
      vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

      const result = await client.discover();
      // Fallback store is empty, so returns empty
      expect(result).toEqual([]);
    });

    it("throws when API fails and no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

      await expect(noFallback.discover()).rejects.toThrow(ArtifactStoreUnavailableError);
    });
  });

  describe("load", () => {
    it("loads artifact from Nexus API", async () => {
      vi.mocked(nexus.artifacts.get).mockResolvedValue(TOOL_ARTIFACT);

      const result = await client.load("art-1");
      expect(result).toEqual(TOOL_ARTIFACT);
      expect(nexus.artifacts.get).toHaveBeenCalledWith("art-1");
    });

    it("falls back to in-memory store on API failure", async () => {
      vi.mocked(nexus.artifacts.get).mockRejectedValue(new Error("network"));

      const result = await client.load("art-1");
      // Fallback store is empty
      expect(result).toBeUndefined();
    });

    it("returns undefined when API fails and no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.get).mockRejectedValue(new Error("network"));

      const result = await noFallback.load("art-1");
      expect(result).toBeUndefined();
    });
  });

  describe("create", () => {
    it("creates artifact via Nexus API", async () => {
      vi.mocked(nexus.artifacts.create).mockResolvedValue(TOOL_ARTIFACT);

      const result = await client.create({
        name: "calculator",
        description: "Calculates things",
        type: "tool",
        schema: { input: { x: "number" } },
      });

      expect(result).toEqual(TOOL_ARTIFACT);
    });

    it("falls back to in-memory store on API failure", async () => {
      vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));

      const result = await client.create({
        name: "calculator",
        description: "Calculates things",
        type: "tool",
        schema: { input: { x: "number" } },
      });

      expect(result.name).toBe("calculator");
      expect(result.id).toMatch(/^art-mem-/);
    });

    it("throws when API fails and no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));

      await expect(
        noFallback.create({
          name: "calc",
          description: "test",
          type: "tool",
          schema: {},
        }),
      ).rejects.toThrow(ArtifactStoreUnavailableError);
    });
  });

  describe("update", () => {
    it("updates artifact via Nexus API", async () => {
      const updated = { ...TOOL_ARTIFACT, name: "renamed", version: 2 };
      vi.mocked(nexus.artifacts.update).mockResolvedValue(updated);

      const result = await client.update("art-1", { name: "renamed" });
      expect(result.name).toBe("renamed");
      expect(nexus.artifacts.update).toHaveBeenCalledWith("art-1", { name: "renamed" });
    });

    it("falls back to in-memory store and throws ArtifactNotFoundError for missing artifact", async () => {
      vi.mocked(nexus.artifacts.update).mockRejectedValue(new Error("network"));

      await expect(client.update("nonexistent", { name: "x" })).rejects.toThrow(
        ArtifactNotFoundError,
      );
    });

    it("falls back to in-memory store and throws ArtifactVersionConflictError on mismatch", async () => {
      // Pre-populate fallback by creating via fallback (trigger API failure on create first)
      vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));
      const created = await client.create({
        name: "test",
        description: "test",
        type: "tool",
        schema: {},
      });

      // Now update with wrong version via fallback
      vi.mocked(nexus.artifacts.update).mockRejectedValue(new Error("network"));
      await expect(
        client.update(created.id, { name: "conflict", expectedVersion: 99 }),
      ).rejects.toThrow(ArtifactVersionConflictError);
    });

    it("throws ArtifactStoreUnavailableError when no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.update).mockRejectedValue(new Error("network"));

      await expect(noFallback.update("art-1", { name: "x" })).rejects.toThrow(
        ArtifactStoreUnavailableError,
      );
    });
  });

  describe("delete", () => {
    it("deletes artifact via Nexus API", async () => {
      vi.mocked(nexus.artifacts.delete).mockResolvedValue(undefined);

      await expect(client.delete("art-1")).resolves.toBeUndefined();
      expect(nexus.artifacts.delete).toHaveBeenCalledWith("art-1");
    });

    it("throws when API fails and no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.delete).mockRejectedValue(new Error("network"));

      await expect(noFallback.delete("art-1")).rejects.toThrow(ArtifactStoreUnavailableError);
    });
  });

  describe("list", () => {
    it("lists artifacts with filters from Nexus API", async () => {
      const response: ArtifactsResponse = {
        data: [METADATA],
        hasMore: false,
      };
      vi.mocked(nexus.artifacts.list).mockResolvedValue(response);

      const result = await client.list({ type: "tool" });
      expect(result).toEqual([METADATA]);
      expect(nexus.artifacts.list).toHaveBeenCalledWith({ type: "tool", limit: 100 });
    });

    it("falls back on failure", async () => {
      vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

      const result = await client.list();
      expect(result).toEqual([]);
    });
  });

  describe("search", () => {
    it("searches artifacts via Nexus API", async () => {
      const response: ArtifactSearchResponse = {
        results: [{ artifact: METADATA, score: 0.95 }],
      };
      vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

      const result = await client.search({ query: "calculator" });
      expect(result).toHaveLength(1);
      expect(result[0]?.score).toBe(0.95);
    });

    it("falls back to in-memory keyword search on failure", async () => {
      vi.mocked(nexus.artifacts.search).mockRejectedValue(new Error("network"));

      // Fallback store is empty, so no results
      const result = await client.search({ query: "test" });
      expect(result).toEqual([]);
    });

    it("throws ArtifactSearchFailedError when no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.search).mockRejectedValue(new Error("network"));

      await expect(noFallback.search({ query: "test" })).rejects.toThrow(ArtifactSearchFailedError);
    });
  });

  describe("getBatch", () => {
    it("loads batch from Nexus API", async () => {
      const response: ArtifactsBatchResponse = {
        artifacts: [TOOL_ARTIFACT, AGENT_ARTIFACT],
      };
      vi.mocked(nexus.artifacts.getBatch).mockResolvedValue(response);

      const result = await client.getBatch(["art-1", "art-2"]);
      expect(result).toHaveLength(2);
      expect(nexus.artifacts.getBatch).toHaveBeenCalledWith({ ids: ["art-1", "art-2"] });
    });

    it("falls back to sequential loads on API failure", async () => {
      vi.mocked(nexus.artifacts.getBatch).mockRejectedValue(new Error("network"));

      // Fallback store is empty
      const result = await client.getBatch(["art-1"]);
      expect(result).toEqual([]);
    });

    it("throws when API fails and no fallback", async () => {
      const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
      vi.mocked(nexus.artifacts.getBatch).mockRejectedValue(new Error("network"));

      await expect(noFallback.getBatch(["art-1"])).rejects.toThrow(ArtifactStoreUnavailableError);
    });
  });

  describe("timeout", () => {
    it("rejects when operation exceeds timeout", async () => {
      const slowClient = new ArtifactClient(nexus, {
        searchTimeoutMs: 50,
        fallbackEnabled: false,
      });

      vi.mocked(nexus.artifacts.list).mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ data: [], hasMore: false }), 200)),
      );

      await expect(slowClient.discover()).rejects.toThrow(ArtifactStoreUnavailableError);
    });

    it("falls back on timeout when fallback enabled", async () => {
      const timeoutClient = new ArtifactClient(nexus, { searchTimeoutMs: 50 });

      vi.mocked(nexus.artifacts.list).mockImplementation(
        () =>
          new Promise((resolve) => setTimeout(() => resolve({ data: [], hasMore: false }), 200)),
      );

      const result = await timeoutClient.discover();
      expect(result).toEqual([]);
    });
  });
});
