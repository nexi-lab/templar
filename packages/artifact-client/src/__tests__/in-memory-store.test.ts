import { ArtifactVersionConflictError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { InMemoryArtifactStore } from "../in-memory-store.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createToolParams(name: string) {
  return {
    name,
    description: `Description for ${name}`,
    type: "tool" as const,
    tags: ["test"],
    schema: { input: { query: "string" } },
  };
}

function createAgentParams(name: string) {
  return {
    name,
    description: `Agent ${name}`,
    type: "agent" as const,
    tags: ["agent", "test"],
    manifest: { model: "gpt-4", tools: [] },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InMemoryArtifactStore", () => {
  describe("constructor", () => {
    it("creates a store with default capacity", () => {
      const store = new InMemoryArtifactStore();
      expect(store.size).toBe(0);
      expect(store.name).toBe("in-memory");
    });

    it("creates a store with custom capacity", () => {
      const store = new InMemoryArtifactStore(5);
      expect(store.size).toBe(0);
    });
  });

  describe("create", () => {
    it("creates a tool artifact with generated ID and version", async () => {
      const store = new InMemoryArtifactStore();
      const artifact = await store.create(createToolParams("calc"));

      expect(artifact.id).toMatch(/^art-mem-/);
      expect(artifact.name).toBe("calc");
      expect(artifact.type).toBe("tool");
      expect(artifact.version).toBe(1);
      expect(artifact.status).toBe("active");
      expect(artifact.createdBy).toBe("local");
      expect(artifact.createdAt).toBeTruthy();
      if (artifact.type === "tool") {
        expect(artifact.schema).toEqual({ input: { query: "string" } });
      }
    });

    it("creates an agent artifact", async () => {
      const store = new InMemoryArtifactStore();
      const artifact = await store.create(createAgentParams("assistant"));

      expect(artifact.type).toBe("agent");
      expect(artifact.name).toBe("assistant");
      if (artifact.type === "agent") {
        expect(artifact.manifest).toEqual({ model: "gpt-4", tools: [] });
      }
    });

    it("assigns unique IDs to each artifact", async () => {
      const store = new InMemoryArtifactStore();
      const a = await store.create(createToolParams("a"));
      const b = await store.create(createToolParams("b"));
      expect(a.id).not.toBe(b.id);
    });

    it("copies tags array to prevent external mutation", async () => {
      const tags = ["mutable"];
      const store = new InMemoryArtifactStore();
      const artifact = await store.create({
        ...createToolParams("test"),
        tags,
      });
      tags.push("sneaky");
      expect(artifact.tags).toEqual(["mutable"]);
    });
  });

  describe("load", () => {
    it("loads an existing artifact by ID", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("calc"));
      const loaded = await store.load(created.id);

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(created.id);
      expect(loaded?.name).toBe("calc");
    });

    it("returns undefined for non-existent ID", async () => {
      const store = new InMemoryArtifactStore();
      const result = await store.load("art-nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("discover", () => {
    it("returns all metadata ordered by most recent access", async () => {
      const store = new InMemoryArtifactStore();
      const a = await store.create(createToolParams("a"));
      await store.create(createToolParams("b"));
      // Access 'a' again to make it most recent
      await store.load(a.id);

      const metadata = await store.discover();
      expect(metadata).toHaveLength(2);
      expect(metadata[0].name).toBe("a");
      expect(metadata[1].name).toBe("b");
    });

    it("returns empty array for empty store", async () => {
      const store = new InMemoryArtifactStore();
      const metadata = await store.discover();
      expect(metadata).toEqual([]);
    });
  });

  describe("update", () => {
    it("updates artifact name and increments version", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("original"));
      const updated = await store.update(created.id, { name: "renamed" });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe("renamed");
      expect(updated?.version).toBe(2);
    });

    it("updates artifact status", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("test"));
      const updated = await store.update(created.id, { status: "deprecated" });

      expect(updated?.status).toBe("deprecated");
    });

    it("returns undefined for non-existent artifact", async () => {
      const store = new InMemoryArtifactStore();
      const result = await store.update("nonexistent", { name: "nope" });
      expect(result).toBeUndefined();
    });

    it("throws ArtifactVersionConflictError on version conflict", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("test"));
      await expect(
        store.update(created.id, {
          name: "conflict",
          expectedVersion: 99,
        }),
      ).rejects.toThrow(ArtifactVersionConflictError);
    });

    it("succeeds with correct expectedVersion", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("test"));
      const updated = await store.update(created.id, {
        name: "updated",
        expectedVersion: 1,
      });
      expect(updated?.name).toBe("updated");
      expect(updated?.version).toBe(2);
    });

    it("preserves schema on tool artifact update", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("test"));
      const updated = await store.update(created.id, { name: "renamed" });

      if (updated?.type === "tool") {
        expect(updated.schema).toEqual({ input: { query: "string" } });
      }
    });

    it("preserves manifest on agent artifact update", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createAgentParams("bot"));
      const updated = await store.update(created.id, { name: "renamed-bot" });

      if (updated?.type === "agent") {
        expect(updated.manifest).toEqual({ model: "gpt-4", tools: [] });
      }
    });
  });

  describe("delete", () => {
    it("deletes an existing artifact", async () => {
      const store = new InMemoryArtifactStore();
      const created = await store.create(createToolParams("temp"));
      expect(store.size).toBe(1);

      const deleted = await store.delete(created.id);
      expect(deleted).toBe(true);
      expect(store.size).toBe(0);
    });

    it("returns false for non-existent artifact", async () => {
      const store = new InMemoryArtifactStore();
      const deleted = await store.delete("nonexistent");
      expect(deleted).toBe(false);
    });
  });

  describe("list", () => {
    it("lists all artifacts without filters", async () => {
      const store = new InMemoryArtifactStore();
      await store.create(createToolParams("a"));
      await store.create(createAgentParams("b"));

      const results = await store.list();
      expect(results).toHaveLength(2);
    });

    it("filters by type", async () => {
      const store = new InMemoryArtifactStore();
      await store.create(createToolParams("tool-1"));
      await store.create(createAgentParams("agent-1"));

      const tools = await store.list({ type: "tool" });
      expect(tools).toHaveLength(1);
      expect(tools[0].type).toBe("tool");
    });

    it("filters by status", async () => {
      const store = new InMemoryArtifactStore();
      const artifact = await store.create(createToolParams("test"));
      await store.update(artifact.id, { status: "deprecated" });
      await store.create(createToolParams("active-one"));

      const active = await store.list({ status: "active" });
      expect(active).toHaveLength(1);
      expect(active[0].name).toBe("active-one");
    });

    it("filters by tags (all required)", async () => {
      const store = new InMemoryArtifactStore();
      await store.create({ ...createToolParams("a"), tags: ["finance", "refund"] });
      await store.create({ ...createToolParams("b"), tags: ["finance"] });

      const results = await store.list({ tags: ["finance", "refund"] });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("a");
    });
  });

  describe("search", () => {
    it("finds artifacts by keyword", async () => {
      const store = new InMemoryArtifactStore();
      await store.create({
        ...createToolParams("refund-calc"),
        description: "Calculates refund amounts",
      });
      await store.create(createToolParams("unrelated"));

      const results = await store.search("refund");
      expect(results).toHaveLength(1);
      expect(results[0].metadata.name).toBe("refund-calc");
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("returns empty for no match", async () => {
      const store = new InMemoryArtifactStore();
      await store.create(createToolParams("test"));

      const results = await store.search("nonexistent-term");
      expect(results).toHaveLength(0);
    });

    it("scores multi-word matches higher", async () => {
      const store = new InMemoryArtifactStore();
      await store.create({
        ...createToolParams("partial"),
        description: "Handles refund processing",
      });
      await store.create({
        ...createToolParams("full-match"),
        description: "Handles refund amount calculations for orders",
      });

      const results = await store.search("refund amount");
      expect(results.length).toBeGreaterThanOrEqual(1);
      // full-match should score higher (matches both terms)
      const fullMatch = results.find((r) => r.metadata.name === "full-match");
      const partial = results.find((r) => r.metadata.name === "partial");
      if (fullMatch && partial) {
        expect(fullMatch.score).toBeGreaterThan(partial.score);
      }
    });
  });

  describe("LRU eviction", () => {
    it("evicts least-recently-used when at capacity", async () => {
      const store = new InMemoryArtifactStore(2);
      const a = await store.create(createToolParams("a"));
      await store.create(createToolParams("b"));

      // Both should exist
      expect(store.size).toBe(2);

      // Creating a third should evict 'a' (oldest)
      await store.create(createToolParams("c"));
      expect(store.size).toBe(2);

      const loadedA = await store.load(a.id);
      expect(loadedA).toBeUndefined();
    });

    it("accessing refreshes LRU priority", async () => {
      const store = new InMemoryArtifactStore(2);
      const a = await store.create(createToolParams("a"));
      const b = await store.create(createToolParams("b"));

      // Access 'a' to refresh its LRU time
      await store.load(a.id);

      // Now 'b' is the oldest, creating 'c' should evict 'b'
      await store.create(createToolParams("c"));

      const loadedA = await store.load(a.id);
      const loadedB = await store.load(b.id);
      expect(loadedA).toBeDefined();
      expect(loadedB).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all entries", async () => {
      const store = new InMemoryArtifactStore();
      await store.create(createToolParams("a"));
      await store.create(createToolParams("b"));
      expect(store.size).toBe(2);

      store.clear();
      expect(store.size).toBe(0);
      expect(await store.discover()).toEqual([]);
    });
  });
});
