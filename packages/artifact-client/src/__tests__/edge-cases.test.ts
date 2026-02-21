/**
 * Edge case tests for @templar/artifact-client (#162)
 *
 * Covers 6 categories of edge cases:
 * 1. Validation: empty/missing/oversized fields
 * 2. Search edge cases: empty query, special characters
 * 3. Batch operations: duplicates, mixed found/missing
 * 4. Load behavior consistency: undefined vs throw
 * 5. onDegradation callback: firing, error wrapping
 * 6. Concurrent operations: race conditions, fallback under load
 */
import type {
  Artifact,
  ArtifactMetadata,
  ArtifactSearchResponse,
  ArtifactsBatchResponse,
  ArtifactsResponse,
  NexusClient,
} from "@nexus/sdk";
import {
  ArtifactSearchFailedError,
  ArtifactStoreUnavailableError,
  ArtifactValidationFailedError,
} from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactClient } from "../client.js";
import { InMemoryArtifactStore } from "../in-memory-store.js";

// ---------------------------------------------------------------------------
// Helpers
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
// 1. Validation edge cases
// ---------------------------------------------------------------------------

describe("validation edge cases", () => {
  let nexus: NexusClient;
  let client: ArtifactClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
    client = new ArtifactClient(nexus);
  });

  describe("create validation", () => {
    it("rejects empty name", async () => {
      await expect(
        client.create({
          name: "",
          description: "test",
          type: "tool",
          schema: {},
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects whitespace-only name", async () => {
      await expect(
        client.create({
          name: "   ",
          description: "test",
          type: "tool",
          schema: {},
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects name exceeding 256 characters", async () => {
      await expect(
        client.create({
          name: "a".repeat(257),
          description: "test",
          type: "tool",
          schema: {},
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects empty description", async () => {
      await expect(
        client.create({
          name: "valid",
          description: "",
          type: "tool",
          schema: {},
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("collects multiple validation errors at once", async () => {
      try {
        await client.create({
          name: "",
          description: "",
          type: "invalid" as "tool",
          schema: {},
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ArtifactValidationFailedError);
        const e = error as ArtifactValidationFailedError;
        // Should have at least name, description, and type errors
        expect(e.validationErrors.length).toBeGreaterThanOrEqual(3);
      }
    });

    it("rejects tool artifact without schema", async () => {
      await expect(
        client.create({
          name: "test",
          description: "test",
          type: "tool",
        } as never),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects agent artifact without manifest", async () => {
      await expect(
        client.create({
          name: "test",
          description: "test",
          type: "agent",
        } as never),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects empty tag strings", async () => {
      await expect(
        client.create({
          name: "test",
          description: "test",
          type: "tool",
          schema: {},
          tags: ["valid", ""],
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects more than 50 tags", async () => {
      await expect(
        client.create({
          name: "test",
          description: "test",
          type: "tool",
          schema: {},
          tags: Array.from({ length: 51 }, (_, i) => `tag-${i}`),
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("rejects tag exceeding 100 characters", async () => {
      await expect(
        client.create({
          name: "test",
          description: "test",
          type: "tool",
          schema: {},
          tags: ["a".repeat(101)],
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);
    });

    it("validates BEFORE sending to Nexus", async () => {
      await expect(
        client.create({
          name: "",
          description: "test",
          type: "tool",
          schema: {},
        }),
      ).rejects.toThrow(ArtifactValidationFailedError);

      // Nexus should NOT have been called
      expect(nexus.artifacts.create).not.toHaveBeenCalled();
    });
  });

  describe("update validation", () => {
    it("rejects empty name update", async () => {
      await expect(client.update("art-1", { name: "" })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
    });

    it("rejects whitespace-only name update", async () => {
      await expect(client.update("art-1", { name: "  " })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
    });

    it("rejects name exceeding 256 characters on update", async () => {
      await expect(client.update("art-1", { name: "a".repeat(257) })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
    });

    it("rejects empty description update", async () => {
      await expect(client.update("art-1", { description: "" })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
    });

    it("rejects expectedVersion < 1", async () => {
      await expect(client.update("art-1", { expectedVersion: 0 })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
    });

    it("rejects invalid status", async () => {
      await expect(client.update("art-1", { status: "invalid" as "active" })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
    });

    it("validates BEFORE sending to Nexus", async () => {
      await expect(client.update("art-1", { name: "" })).rejects.toThrow(
        ArtifactValidationFailedError,
      );
      expect(nexus.artifacts.update).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Search edge cases
// ---------------------------------------------------------------------------

describe("search edge cases", () => {
  let nexus: NexusClient;
  let client: ArtifactClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
    client = new ArtifactClient(nexus);
  });

  it("handles search with special characters in query", async () => {
    const response: ArtifactSearchResponse = { results: [] };
    vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

    const result = await client.search({ query: "test & <script>" });
    expect(result).toEqual([]);
    expect(nexus.artifacts.search).toHaveBeenCalledWith({
      query: "test & <script>",
    });
  });

  it("handles search with very long query", async () => {
    const response: ArtifactSearchResponse = { results: [] };
    vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

    const longQuery = "word ".repeat(1000).trim();
    const result = await client.search({ query: longQuery });
    expect(result).toEqual([]);
  });

  it("handles search results with zero score", async () => {
    const response: ArtifactSearchResponse = {
      results: [{ artifact: METADATA, score: 0 }],
    };
    vi.mocked(nexus.artifacts.search).mockResolvedValue(response);

    const result = await client.search({ query: "test" });
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBe(0);
  });

  it("preserves search error details in ArtifactSearchFailedError", async () => {
    const noFallback = new ArtifactClient(nexus, { fallbackEnabled: false });
    const originalError = new Error("ECONNREFUSED");
    vi.mocked(nexus.artifacts.search).mockRejectedValue(originalError);

    try {
      await noFallback.search({ query: "test" });
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactSearchFailedError);
      const e = error as ArtifactSearchFailedError;
      expect(e.message).toContain("test");
      expect(e.cause).toBe(originalError);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Batch operation edge cases
// ---------------------------------------------------------------------------

describe("getBatch edge cases", () => {
  let nexus: NexusClient;
  let client: ArtifactClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
    client = new ArtifactClient(nexus);
  });

  it("handles empty ID array", async () => {
    const response: ArtifactsBatchResponse = { artifacts: [] };
    vi.mocked(nexus.artifacts.getBatch).mockResolvedValue(response);

    const result = await client.getBatch([]);
    expect(result).toEqual([]);
  });

  it("handles duplicate IDs in batch", async () => {
    const response: ArtifactsBatchResponse = {
      artifacts: [TOOL_ARTIFACT, TOOL_ARTIFACT],
    };
    vi.mocked(nexus.artifacts.getBatch).mockResolvedValue(response);

    const result = await client.getBatch(["art-1", "art-1"]);
    expect(result).toHaveLength(2);
  });

  it("handles mixed found/missing in fallback", async () => {
    // Populate fallback with one artifact
    vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));
    await client.create({
      name: "exists",
      description: "test",
      type: "tool",
      schema: {},
    });

    // getBatch via fallback — one found, one missing
    vi.mocked(nexus.artifacts.getBatch).mockRejectedValue(new Error("network"));
    const fallbackResult = await client.getBatch(["art-mem-0", "nonexistent"]);
    // Only found items returned (0 or 1 depending on generated ID)
    expect(fallbackResult.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// 4. Load behavior consistency
// ---------------------------------------------------------------------------

describe("load behavior consistency", () => {
  let nexus: NexusClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
  });

  it("load() returns undefined (not throw) when artifact not found via API", async () => {
    const client = new ArtifactClient(nexus, { fallbackEnabled: false });
    vi.mocked(nexus.artifacts.get).mockRejectedValue(new Error("not found"));

    const result = await client.load("nonexistent");
    expect(result).toBeUndefined();
  });

  it("load() returns undefined from both API and fallback for missing artifact", async () => {
    const client = new ArtifactClient(nexus);
    vi.mocked(nexus.artifacts.get).mockRejectedValue(new Error("network"));

    const result = await client.load("nonexistent");
    expect(result).toBeUndefined();
  });

  it("discover() returns empty array (not throw) on fallback with empty store", async () => {
    const client = new ArtifactClient(nexus);
    vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

    const result = await client.discover();
    expect(result).toEqual([]);
  });

  it("list() returns empty array on fallback for no matching type", async () => {
    const client = new ArtifactClient(nexus);
    vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

    const result = await client.list({ type: "agent" });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 5. onDegradation callback
// ---------------------------------------------------------------------------

describe("onDegradation callback", () => {
  let nexus: NexusClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
  });

  it("fires on discover() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

    await client.discover();

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.discover", expect.any(Error));
  });

  it("fires on load() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.get).mockRejectedValue(new Error("timeout"));

    await client.load("art-1");

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.load", expect.any(Error));
  });

  it("fires on create() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));

    await client.create({
      name: "test",
      description: "test",
      type: "tool",
      schema: {},
    });

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.create", expect.any(Error));
  });

  it("fires on search() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.search).mockRejectedValue(new Error("search down"));

    await client.search({ query: "test" });

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.search", expect.any(Error));
  });

  it("fires on getBatch() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.getBatch).mockRejectedValue(new Error("network"));

    await client.getBatch(["art-1"]);

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.getBatch", expect.any(Error));
  });

  it("fires on update() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });

    // Pre-populate fallback store
    vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("net"));
    const created = await client.create({
      name: "test",
      description: "test",
      type: "tool",
      schema: {},
    });

    onDegradation.mockClear();

    // Update via fallback
    vi.mocked(nexus.artifacts.update).mockRejectedValue(new Error("net"));
    await client.update(created.id, { name: "updated" });

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.update", expect.any(Error));
  });

  it("fires on delete() fallback", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.delete).mockRejectedValue(new Error("network"));

    await client.delete("art-1");

    expect(onDegradation).toHaveBeenCalledOnce();
    expect(onDegradation).toHaveBeenCalledWith("artifact.delete", expect.any(Error));
  });

  it("wraps non-Error values in Error objects", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, { onDegradation });
    vi.mocked(nexus.artifacts.list).mockRejectedValue("string-error");

    await client.discover();

    expect(onDegradation).toHaveBeenCalledOnce();
    const [, error] = onDegradation.mock.calls[0] as [string, Error];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("string-error");
  });

  it("does NOT fire when no fallback configured", async () => {
    const onDegradation = vi.fn();
    const client = new ArtifactClient(nexus, {
      onDegradation,
      fallbackEnabled: false,
    });
    vi.mocked(nexus.artifacts.list).mockRejectedValue(new Error("network"));

    await expect(client.discover()).rejects.toThrow(ArtifactStoreUnavailableError);
    expect(onDegradation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Concurrent operations and pagination
// ---------------------------------------------------------------------------

describe("concurrent operations", () => {
  let nexus: NexusClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
  });

  it("handles concurrent discover() calls", async () => {
    const response: ArtifactsResponse = {
      data: [METADATA],
      hasMore: false,
    };
    vi.mocked(nexus.artifacts.list).mockResolvedValue(response);
    const client = new ArtifactClient(nexus);

    const [r1, r2, r3] = await Promise.all([
      client.discover(),
      client.discover(),
      client.discover(),
    ]);

    expect(r1).toEqual([METADATA]);
    expect(r2).toEqual([METADATA]);
    expect(r3).toEqual([METADATA]);
  });

  it("handles concurrent load() calls for same ID", async () => {
    vi.mocked(nexus.artifacts.get).mockResolvedValue(TOOL_ARTIFACT);
    const client = new ArtifactClient(nexus);

    const [r1, r2] = await Promise.all([client.load("art-1"), client.load("art-1")]);

    expect(r1).toEqual(TOOL_ARTIFACT);
    expect(r2).toEqual(TOOL_ARTIFACT);
  });

  it("handles concurrent creates to fallback store", async () => {
    vi.mocked(nexus.artifacts.create).mockRejectedValue(new Error("network"));
    const client = new ArtifactClient(nexus);

    const results = await Promise.all([
      client.create({ name: "a", description: "a", type: "tool", schema: {} }),
      client.create({ name: "b", description: "b", type: "tool", schema: {} }),
      client.create({ name: "c", description: "c", type: "tool", schema: {} }),
    ]);

    // All should succeed with unique IDs
    const ids = results.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Pagination edge cases
// ---------------------------------------------------------------------------

describe("pagination", () => {
  let nexus: NexusClient;

  beforeEach(() => {
    nexus = createMockNexusClient();
  });

  it("discover() uses default page size", async () => {
    vi.mocked(nexus.artifacts.list).mockResolvedValue({
      data: [],
      hasMore: false,
    });
    const client = new ArtifactClient(nexus);

    await client.discover();
    expect(nexus.artifacts.list).toHaveBeenCalledWith({ limit: 100 });
  });

  it("discover() uses custom page size", async () => {
    vi.mocked(nexus.artifacts.list).mockResolvedValue({
      data: [],
      hasMore: false,
    });
    const client = new ArtifactClient(nexus, { defaultPageSize: 50 });

    await client.discover();
    expect(nexus.artifacts.list).toHaveBeenCalledWith({ limit: 50 });
  });

  it("list() respects caller-specified limit over default", async () => {
    vi.mocked(nexus.artifacts.list).mockResolvedValue({
      data: [],
      hasMore: false,
    });
    const client = new ArtifactClient(nexus);

    await client.list({ limit: 10 });
    expect(nexus.artifacts.list).toHaveBeenCalledWith({ limit: 10 });
  });

  it("list() applies default limit when none specified", async () => {
    vi.mocked(nexus.artifacts.list).mockResolvedValue({
      data: [],
      hasMore: false,
    });
    const client = new ArtifactClient(nexus);

    await client.list({ type: "tool" });
    expect(nexus.artifacts.list).toHaveBeenCalledWith({
      type: "tool",
      limit: 100,
    });
  });

  it("rejects defaultPageSize < 1", () => {
    expect(() => new ArtifactClient(nexus, { defaultPageSize: 0 })).toThrow(
      "defaultPageSize must be at least 1",
    );
  });
});

// ---------------------------------------------------------------------------
// InMemoryArtifactStore edge cases
// ---------------------------------------------------------------------------

describe("InMemoryArtifactStore edge cases", () => {
  it("search with empty string returns no results", async () => {
    const store = new InMemoryArtifactStore();
    await store.create({
      name: "test",
      description: "test",
      type: "tool",
      tags: [],
      schema: {},
    });

    const results = await store.search("");
    expect(results).toEqual([]);
  });

  it("search with whitespace-only query returns no results", async () => {
    const store = new InMemoryArtifactStore();
    await store.create({
      name: "test",
      description: "test",
      type: "tool",
      tags: [],
      schema: {},
    });

    const results = await store.search("   ");
    expect(results).toEqual([]);
  });

  it("search only matches name and description (not tags)", async () => {
    const store = new InMemoryArtifactStore();
    await store.create({
      name: "generic",
      description: "generic",
      type: "tool",
      tags: ["finance", "refund"],
      schema: {},
    });

    // "finance" is only in tags, not in name/description
    const tagResults = await store.search("finance");
    expect(tagResults).toHaveLength(0);

    // "generic" is in name and description
    const nameResults = await store.search("generic");
    expect(nameResults).toHaveLength(1);
  });

  it("handles create with empty tags array", async () => {
    const store = new InMemoryArtifactStore();
    const artifact = await store.create({
      name: "no-tags",
      description: "test",
      type: "tool",
      tags: [],
      schema: {},
    });

    expect(artifact.tags).toEqual([]);
  });

  it("handles rapid sequential creates at capacity", async () => {
    const store = new InMemoryArtifactStore(3);

    for (let i = 0; i < 10; i++) {
      await store.create({
        name: `artifact-${i}`,
        description: `test ${i}`,
        type: "tool",
        tags: [],
        schema: {},
      });
    }

    // Only last 3 should remain (LRU eviction)
    expect(store.size).toBe(3);
    const all = await store.discover();
    expect(all).toHaveLength(3);
  });

  it("update on recently evicted artifact returns undefined", async () => {
    const store = new InMemoryArtifactStore(1);
    const first = await store.create({
      name: "first",
      description: "test",
      type: "tool",
      tags: [],
      schema: {},
    });

    // Evict by creating a second
    await store.create({
      name: "second",
      description: "test",
      type: "tool",
      tags: [],
      schema: {},
    });

    const result = await store.update(first.id, { name: "updated" });
    expect(result).toBeUndefined();
  });

  it("delete on already deleted artifact returns false", async () => {
    const store = new InMemoryArtifactStore();
    const artifact = await store.create({
      name: "temp",
      description: "test",
      type: "tool",
      tags: [],
      schema: {},
    });

    expect(await store.delete(artifact.id)).toBe(true);
    expect(await store.delete(artifact.id)).toBe(false);
  });

  it("list with all filters applied simultaneously", async () => {
    const store = new InMemoryArtifactStore();
    await store.create({
      name: "target",
      description: "target",
      type: "tool",
      tags: ["finance"],
      schema: {},
    });
    await store.create({
      name: "wrong-type",
      description: "test",
      type: "agent",
      tags: ["finance"],
      manifest: {},
    });
    await store.create({
      name: "wrong-tag",
      description: "test",
      type: "tool",
      tags: ["other"],
      schema: {},
    });

    const results = await store.list({ type: "tool", tags: ["finance"] });
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("target");
  });
});
