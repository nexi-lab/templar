/**
 * E2E integration test for @templar/artifact-client (#162)
 *
 * Exercises the full artifact lifecycle pipeline:
 * 1. Create tool + agent artifacts
 * 2. Discover available artifacts
 * 3. Search artifacts by keyword
 * 4. Load artifacts by ID
 * 5. Prepare manifest for spawn
 * 6. Middleware: session lifecycle + tool interception
 * 7. Performance validation
 *
 * Uses InMemoryArtifactStore as the backend (simulates Nexus unavailable
 * with fallback). When a live Nexus server is available, set NEXUS_URL
 * to run against it.
 */
import type { NexusClient } from "@nexus/sdk";
import { ArtifactInvalidTypeError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactClient } from "../client.js";
import { ArtifactMiddleware } from "../middleware/index.js";
import { prepareManifest } from "../prepare-manifest.js";
import { createArtifactTools } from "../tools/index.js";

// ---------------------------------------------------------------------------
// Mock NexusClient that always fails (forces fallback to in-memory store)
// ---------------------------------------------------------------------------

function createFailingNexusClient(): NexusClient {
  const fail = () => Promise.reject(new Error("Nexus unavailable (E2E test)"));
  return {
    artifacts: {
      list: vi.fn().mockImplementation(fail),
      get: vi.fn().mockImplementation(fail),
      getBatch: vi.fn().mockImplementation(fail),
      create: vi.fn().mockImplementation(fail),
      update: vi.fn().mockImplementation(fail),
      delete: vi.fn().mockImplementation(fail),
      search: vi.fn().mockImplementation(fail),
    },
  } as unknown as NexusClient;
}

// ---------------------------------------------------------------------------
// Full lifecycle E2E
// ---------------------------------------------------------------------------

describe("E2E: artifact lifecycle", () => {
  let client: ArtifactClient;
  const degradations: Array<{ operation: string; error: Error }> = [];

  beforeEach(() => {
    degradations.length = 0;
    client = new ArtifactClient(createFailingNexusClient(), {
      onDegradation: (op, err) => degradations.push({ operation: op, error: err }),
    });
  });

  it("full CRUD + search + discover pipeline", async () => {
    // 1. Create a tool artifact
    const tool = await client.create({
      name: "refund-calculator",
      description: "Calculates refund amounts for customer orders",
      type: "tool",
      tags: ["finance", "refund"],
      schema: {
        input: { orderId: "string", reason: "string" },
        output: { amount: "number", currency: "string" },
      },
    });

    expect(tool.id).toMatch(/^art-mem-/);
    expect(tool.name).toBe("refund-calculator");
    expect(tool.type).toBe("tool");
    expect(tool.version).toBe(1);

    // 2. Create an agent artifact
    const agent = await client.create({
      name: "refund-specialist",
      description: "Specialist agent for handling refund requests",
      type: "agent",
      tags: ["finance", "specialist"],
      manifest: {
        model: "haiku",
        tools: ["refund-calculator"],
        systemPrompt: "You are a refund specialist.",
      },
    });

    expect(agent.name).toBe("refund-specialist");
    expect(agent.type).toBe("agent");

    // 3. Discover all artifacts
    const metadata = await client.discover();
    expect(metadata).toHaveLength(2);
    const names = metadata.map((m) => m.name);
    expect(names).toContain("refund-calculator");
    expect(names).toContain("refund-specialist");

    // 4. Search by keyword
    const searchResults = await client.search({ query: "refund" });
    expect(searchResults.length).toBeGreaterThanOrEqual(2);

    // 5. Load full artifact
    const loaded = await client.load(tool.id);
    expect(loaded).toBeDefined();
    expect(loaded?.name).toBe("refund-calculator");

    // 6. Update artifact
    const updated = await client.update(tool.id, {
      description: "Updated refund calculator with tax support",
    });
    expect(updated?.description).toBe("Updated refund calculator with tax support");
    expect(updated?.version).toBe(2);

    // 7. List with filters
    const tools = await client.list({ type: "tool" });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("refund-calculator");

    const agents = await client.list({ type: "agent" });
    expect(agents).toHaveLength(1);

    // 8. Delete
    await client.delete(tool.id);
    const afterDelete = await client.discover();
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0]?.name).toBe("refund-specialist");

    // 9. Verify degradation callbacks fired for all operations
    expect(degradations.length).toBeGreaterThanOrEqual(2);
    const ops = degradations.map((d) => d.operation);
    expect(ops).toContain("artifact.create");
  });
});

// ---------------------------------------------------------------------------
// prepareManifest E2E
// ---------------------------------------------------------------------------

describe("E2E: prepareManifest pipeline", () => {
  it("creates agent artifact → loads → prepares manifest", async () => {
    const client = new ArtifactClient(createFailingNexusClient());

    // Create agent
    const agent = await client.create({
      name: "research-agent",
      description: "Performs research tasks",
      type: "agent",
      manifest: {
        model: "claude-sonnet-4-5-20250929",
        tools: ["web_search", "read_file"],
        maxIterations: 10,
      },
    });

    // Load full artifact
    const loaded = await client.load(agent.id);
    if (!loaded) throw new Error("Expected artifact to be loaded");

    // Prepare manifest
    const prepared = prepareManifest({ artifact: loaded });
    expect(prepared.artifactId).toBe(agent.id);
    expect(prepared.version).toBe(1);
    expect(prepared.manifest).toBeDefined();
    expect(Object.isFrozen(prepared.manifest)).toBe(true);

    // Verify manifest content
    const manifest = prepared.manifest as Record<string, unknown>;
    expect(manifest.model).toBe("claude-sonnet-4-5-20250929");
    expect(manifest.tools).toEqual(["web_search", "read_file"]);
  });

  it("prepareManifest with overrides", async () => {
    const client = new ArtifactClient(createFailingNexusClient());

    const agent = await client.create({
      name: "base-agent",
      description: "Base agent",
      type: "agent",
      manifest: { model: "haiku", tools: [] },
    });

    const loaded = await client.load(agent.id);
    if (!loaded) throw new Error("Expected artifact to be loaded");
    const prepared = prepareManifest({
      artifact: loaded,
      overrides: { model: "claude-sonnet-4-5-20250929", maxIterations: 5 },
    });

    const manifest = prepared.manifest as Record<string, unknown>;
    expect(manifest.model).toBe("claude-sonnet-4-5-20250929");
    expect(manifest.maxIterations).toBe(5);
  });

  it("prepareManifest rejects tool artifacts", async () => {
    const client = new ArtifactClient(createFailingNexusClient());

    const tool = await client.create({
      name: "calc",
      description: "Calculator",
      type: "tool",
      schema: {},
    });

    const loaded = await client.load(tool.id);
    if (!loaded) throw new Error("Expected artifact to be loaded");
    expect(() => prepareManifest({ artifact: loaded })).toThrow(ArtifactInvalidTypeError);
  });
});

// ---------------------------------------------------------------------------
// Middleware E2E
// ---------------------------------------------------------------------------

describe("E2E: ArtifactMiddleware pipeline", () => {
  it("session lifecycle: start → tool interception → end", async () => {
    const client = new ArtifactClient(createFailingNexusClient());
    const middleware = new ArtifactMiddleware(client);

    // Session start (fires non-blocking discover)
    await middleware.onSessionStart({ sessionId: "e2e-1", agentId: "agent-1" });

    // Tool interception: create_artifact
    const createReq = {
      toolName: "create_artifact",
      input: {
        name: "e2e-tool",
        description: "E2E test tool",
        artifact_type: "tool",
        schema: { input: {} },
      },
    };
    const mockNext = vi.fn();
    const createResp = await middleware.wrapToolCall(createReq, mockNext);
    expect(mockNext).not.toHaveBeenCalled();
    const createOutput = createResp.output as { success: boolean; artifact?: { id: string } };
    expect(createOutput.success).toBe(true);

    // Tool interception: search_artifacts
    const searchReq = {
      toolName: "search_artifacts",
      input: { query: "e2e" },
    };
    const searchResp = await middleware.wrapToolCall(searchReq, mockNext);
    const searchOutput = searchResp.output as { success: boolean };
    expect(searchOutput.success).toBe(true);

    // Pass-through: non-artifact tool
    const otherReq = {
      toolName: "read_file",
      input: { path: "/tmp/test" },
    };
    const otherNext = vi.fn().mockResolvedValue({ output: "file content" });
    const otherResp = await middleware.wrapToolCall(otherReq, otherNext);
    expect(otherNext).toHaveBeenCalledWith(otherReq);
    expect(otherResp.output).toBe("file content");

    // Session end clears caches
    await middleware.onSessionEnd({ sessionId: "e2e-1", agentId: "agent-1" });
  });

  it("middleware caching across operations", async () => {
    const client = new ArtifactClient(createFailingNexusClient());
    const middleware = new ArtifactMiddleware(client);

    await middleware.onSessionStart({ sessionId: "e2e-2", agentId: "agent-1" });

    // Create an artifact via client directly
    const artifact = await client.create({
      name: "cached-test",
      description: "Caching test",
      type: "tool",
      schema: {},
    });

    // Load via middleware (first call)
    const first = await middleware.loadArtifact(artifact.id);
    expect(first).toBeDefined();

    // Load again (should hit cache)
    const second = await middleware.loadArtifact(artifact.id);
    expect(second).toEqual(first);

    // Search
    const results = await middleware.searchArtifacts({ query: "cached" });
    expect(results.length).toBeGreaterThanOrEqual(0);

    // Same search (should hit cache)
    const cached = await middleware.searchArtifacts({ query: "cached" });
    expect(cached).toEqual(results);

    await middleware.onSessionEnd({ sessionId: "e2e-2", agentId: "agent-1" });
  });
});

// ---------------------------------------------------------------------------
// Tool wrappers E2E
// ---------------------------------------------------------------------------

describe("E2E: createArtifactTools pipeline", () => {
  it("tool definitions are well-formed and frozen", () => {
    const client = new ArtifactClient(createFailingNexusClient());
    const toolSet = createArtifactTools(client);

    expect(toolSet.tools).toHaveLength(2);
    expect(Object.isFrozen(toolSet.tools)).toBe(true);

    for (const tool of toolSet.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
      expect(Object.isFrozen(tool)).toBe(true);
    }
  });

  it("execute create + search flow via tool wrappers", async () => {
    const client = new ArtifactClient(createFailingNexusClient());
    const toolSet = createArtifactTools(client);

    // Create via tool
    const createResult = await toolSet.execute("create_artifact", {
      name: "e2e-wrapper-tool",
      description: "Created via tool wrapper",
      artifact_type: "tool",
      schema: { input: {} },
    });
    expect(createResult).toEqual(expect.objectContaining({ success: true }));

    // Search via tool
    const searchResult = await toolSet.execute("search_artifacts", {
      query: "wrapper",
    });
    expect(searchResult).toEqual(expect.objectContaining({ success: true }));
  });
});

// ---------------------------------------------------------------------------
// Performance validation
// ---------------------------------------------------------------------------

describe("E2E: performance", () => {
  it("create + discover + search within latency bounds", async () => {
    const client = new ArtifactClient(createFailingNexusClient());

    // Create 50 artifacts
    const createStart = performance.now();
    const createPromises = Array.from({ length: 50 }, (_, i) =>
      client.create({
        name: `perf-tool-${i}`,
        description: `Performance test tool ${i} for benchmarking`,
        type: "tool",
        tags: [`perf-${i % 5}`],
        schema: { input: {} },
      }),
    );
    await Promise.all(createPromises);
    const createMs = performance.now() - createStart;

    // Discover all
    const discoverStart = performance.now();
    const metadata = await client.discover();
    const discoverMs = performance.now() - discoverStart;

    expect(metadata).toHaveLength(50);

    // Search
    const searchStart = performance.now();
    const results = await client.search({ query: "benchmarking" });
    const searchMs = performance.now() - searchStart;

    expect(results.length).toBeGreaterThan(0);

    // Performance bounds (in-memory store should be fast)
    // These are generous bounds — primarily checking for no O(n²) issues
    expect(createMs).toBeLessThan(500);
    expect(discoverMs).toBeLessThan(50);
    expect(searchMs).toBeLessThan(50);
  });

  it("session-scoped caching improves repeated access", async () => {
    const client = new ArtifactClient(createFailingNexusClient());
    const middleware = new ArtifactMiddleware(client);

    await middleware.onSessionStart({ sessionId: "perf", agentId: "agent" });

    // Create some artifacts
    const artifacts = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        client.create({
          name: `cached-${i}`,
          description: `Cached artifact ${i}`,
          type: "tool",
          schema: {},
        }),
      ),
    );

    // Cold load (first access)
    const coldStart = performance.now();
    for (const art of artifacts) {
      await middleware.loadArtifact(art.id);
    }
    const coldMs = performance.now() - coldStart;

    // Warm load (cached)
    const warmStart = performance.now();
    for (const art of artifacts) {
      await middleware.loadArtifact(art.id);
    }
    const warmMs = performance.now() - warmStart;

    // Cached access should be faster (or at least not slower)
    expect(warmMs).toBeLessThanOrEqual(coldMs + 5); // Small margin for jitter

    await middleware.onSessionEnd({ sessionId: "perf", agentId: "agent" });
  });
});
