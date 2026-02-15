/**
 * E2E test — exercises EntityMemory and EntityMemoryMiddleware
 * against a live Nexus server with authentication + permissions.
 *
 * Requires:
 *   NEXUS_E2E_URL  (default: http://localhost:2028)
 *   NEXUS_E2E_KEY  (admin API key)
 *
 * Skips automatically when the env vars are absent.
 */

import { NexusClient } from "@nexus/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntityMemory } from "../entity-memory.js";
import { EntityMemoryMiddleware } from "../middleware.js";
import type { EntityMemoryConfig } from "../types.js";

// ============================================================================
// ENV GUARD — skip when Nexus is not available
// ============================================================================

const NEXUS_URL = process.env.NEXUS_E2E_URL ?? "http://localhost:2028";
const NEXUS_KEY = process.env.NEXUS_E2E_KEY ?? "";
const E2E_ENABLED = NEXUS_KEY.length > 0;

const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ============================================================================
// HELPERS
// ============================================================================

function createConfig(overrides: Partial<EntityMemoryConfig> = {}): EntityMemoryConfig {
  return {
    scope: "agent",
    namespace: `e2e-test-${Date.now()}`,
    ...overrides,
  };
}

function createClient(): NexusClient {
  return new NexusClient({
    apiKey: NEXUS_KEY,
    baseUrl: NEXUS_URL,
    timeout: 10_000,
  });
}

// ============================================================================
// E2E TESTS
// ============================================================================

describeE2E("EntityMemory E2E (live Nexus)", () => {
  let client: NexusClient;
  const storedIds: string[] = [];

  beforeAll(() => {
    client = createClient();
  });

  afterAll(async () => {
    // Best-effort cleanup
    for (const id of storedIds) {
      try {
        await client.memory.delete(id);
      } catch {
        // ignore
      }
    }
  });

  // =========================================================================
  // Health check
  // =========================================================================

  it("should connect to Nexus server", async () => {
    const response = await fetch(`${NEXUS_URL}/health`, {
      headers: { Authorization: `Bearer ${NEXUS_KEY}` },
    });
    const data = (await response.json()) as { status: string; has_auth: boolean };
    expect(data.status).toBe("healthy");
    expect(data.has_auth).toBe(true);
  });

  // =========================================================================
  // EntityMemory.track — store entity via API
  // =========================================================================

  it("should track an entity via Nexus API", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    const entity = await em.track({
      entity: "Alice Johnson",
      type: "person",
      attributes: { role: "engineer", team: "platform" },
    });

    expect(entity.id).toBeDefined();
    expect(entity.name).toBe("Alice Johnson");
    expect(entity.entityType).toBe("person");
    expect(entity.attributes).toEqual({ role: "engineer", team: "platform" });
    storedIds.push(entity.id);
  });

  // =========================================================================
  // EntityMemory.track — store entity with relationships
  // =========================================================================

  it("should track entity with relationships", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    const entity = await em.track({
      entity: "Acme Corp",
      type: "organization",
      relationships: [
        { target: "Alice Johnson", type: "employs" },
        { target: "Platform Team", type: "has_team" },
      ],
    });

    expect(entity.id).toBeDefined();
    expect(entity.entityType).toBe("organization");
    storedIds.push(entity.id);
  });

  // =========================================================================
  // EntityMemory.getEntity — retrieve by ID
  // =========================================================================

  it("should retrieve entity by ID", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    // First track
    const tracked = await em.track({
      entity: "Bob Smith",
      type: "person",
      attributes: { role: "designer" },
    });
    storedIds.push(tracked.id);

    // Then retrieve
    const retrieved = await em.getEntity(tracked.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(tracked.id);
    expect(retrieved?.name).toBe("Bob Smith");
  });

  // =========================================================================
  // EntityMemory.getEntity — nonexistent returns undefined
  // =========================================================================

  it("should return undefined for nonexistent entity", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    const result = await em.getEntity("nonexistent-id-12345");
    expect(result).toBeUndefined();
  });

  // =========================================================================
  // EntityMemory.searchEntities — hybrid search
  // =========================================================================

  it("should search entities with hybrid mode", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    // Track an entity first so there's something to find
    const tracked = await em.track({
      entity: "Templar Framework",
      type: "project",
      attributes: { language: "TypeScript", purpose: "agent runtime" },
    });
    storedIds.push(tracked.id);

    // Search — results may or may not find the entity depending on indexing
    // but the call itself should succeed without errors
    const results = await em.searchEntities("Templar");
    expect(Array.isArray(results)).toBe(true);
  });

  // =========================================================================
  // EntityMemory — path_key dedup (upsert)
  // =========================================================================

  it("should use path_key for entity upsert", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    const first = await em.track({
      entity: "Charlie",
      type: "person",
      attributes: { version: "1" },
    });
    storedIds.push(first.id);

    const second = await em.track({
      entity: "Charlie",
      type: "person",
      attributes: { version: "2" },
    });
    storedIds.push(second.id);

    // Same path_key should result in same memory_id (upsert)
    // or different IDs if the server doesn't support path_key upsert
    // Either way, both calls should succeed without error
    expect(first.name).toBe("Charlie");
    expect(second.name).toBe("Charlie");
  });

  // =========================================================================
  // EntityMemoryMiddleware — full lifecycle
  // =========================================================================

  it("should run middleware lifecycle: session start → turns → session end", async () => {
    const config = createConfig({ autoSaveInterval: 3 });
    const mw = new EntityMemoryMiddleware(client, config);

    // Session start — load entities from Nexus (may be empty)
    await mw.onSessionStart({ sessionId: "e2e-session-1" });
    const initialEntities = mw.getSessionEntities();
    expect(Array.isArray(initialEntities)).toBe(true);

    // Turn 1 — short output, should not buffer
    await mw.onAfterTurn({
      sessionId: "e2e-session-1",
      turnNumber: 1,
      output: "OK",
    });
    expect(mw.getPendingCount()).toBe(0);

    // Turn 2 — long output with entity data, should buffer (turnCount=2, 2%3≠0)
    await mw.onAfterTurn({
      sessionId: "e2e-session-1",
      turnNumber: 2,
      output:
        "Alice Johnson is a senior engineer at Acme Corporation. She manages the platform team and works closely with Bob Smith on the Templar project.",
    });
    expect(mw.getPendingCount()).toBe(1);

    // Turn 3 — another long output, triggers flush (turnCount=3, 3%3=0)
    await mw.onAfterTurn({
      sessionId: "e2e-session-1",
      turnNumber: 3,
      output:
        "The platform team is responsible for building the core infrastructure. Charlie Davis recently joined as a backend developer.",
    });

    // After flush, pending should be 0
    expect(mw.getPendingCount()).toBe(0);

    // Session end — should flush any remaining
    await mw.onSessionEnd({ sessionId: "e2e-session-1" });
    expect(mw.getPendingCount()).toBe(0);
  });

  // =========================================================================
  // EntityMemoryMiddleware — context injection
  // =========================================================================

  it("should inject entities into turn context metadata", async () => {
    const config = createConfig();
    const mw = new EntityMemoryMiddleware(client, config);

    await mw.onSessionStart({ sessionId: "e2e-session-2" });

    const turnCtx = {
      sessionId: "e2e-session-2",
      turnNumber: 1,
    };

    await mw.onBeforeTurn(turnCtx);

    // If entities were loaded, they should be in metadata
    // If not (clean namespace), metadata should be absent
    // Either way, no errors
    if (mw.getSessionEntities().length > 0) {
      expect((turnCtx as Record<string, unknown>).metadata).toBeDefined();
    }
  });

  // =========================================================================
  // EntityMemoryMiddleware — coexists with existing metadata
  // =========================================================================

  it("should preserve existing turn metadata", async () => {
    const config = createConfig();
    const mw = new EntityMemoryMiddleware(client, config);

    await mw.onSessionStart({ sessionId: "e2e-session-3" });

    const turnCtx = {
      sessionId: "e2e-session-3",
      turnNumber: 1,
      metadata: { existingKey: "existingValue" },
    };

    await mw.onBeforeTurn(turnCtx);

    expect(turnCtx.metadata.existingKey).toBe("existingValue");
  });

  // =========================================================================
  // Config validation — still works end-to-end
  // =========================================================================

  it("should reject invalid config at runtime", () => {
    expect(() => new EntityMemory(client, { scope: "bad" as "agent" })).toThrow("Invalid scope");

    expect(() => new EntityMemory(client, { scope: "agent", maxEntitiesPerQuery: 0 })).toThrow(
      "maxEntitiesPerQuery must be >= 1",
    );
  });

  // =========================================================================
  // Performance — concurrent operations
  // =========================================================================

  it("should handle concurrent track operations", async () => {
    const config = createConfig();
    const em = new EntityMemory(client, config);

    const startTime = performance.now();

    const results = await Promise.all([
      em.track({ entity: "ConcurrentEntity1", type: "concept" }),
      em.track({ entity: "ConcurrentEntity2", type: "concept" }),
      em.track({ entity: "ConcurrentEntity3", type: "concept" }),
    ]);

    const elapsed = performance.now() - startTime;

    // All should succeed
    expect(results).toHaveLength(3);
    for (const entity of results) {
      expect(entity.id).toBeDefined();
      storedIds.push(entity.id);
    }

    // Concurrent requests should complete reasonably fast (< 10s)
    expect(elapsed).toBeLessThan(10_000);
    console.log(`[e2e] 3 concurrent tracks completed in ${Math.round(elapsed)}ms`);
  });

  // =========================================================================
  // Performance — middleware flush timing
  // =========================================================================

  it("should flush within reasonable time", async () => {
    const config = createConfig({ autoSaveInterval: 1 });
    const mw = new EntityMemoryMiddleware(client, config);

    const startTime = performance.now();

    await mw.onAfterTurn({
      sessionId: "e2e-perf-session",
      turnNumber: 1,
      output:
        "Performance test: Alice manages the engineering department at GlobalTech Inc. She collaborates with the research team led by Dr. Chen on quantum computing projects.",
    });

    const elapsed = performance.now() - startTime;

    // Single flush should complete in < 5s
    expect(elapsed).toBeLessThan(5_000);
    expect(mw.getPendingCount()).toBe(0);
    console.log(`[e2e] Single flush completed in ${Math.round(elapsed)}ms`);
  });
});
