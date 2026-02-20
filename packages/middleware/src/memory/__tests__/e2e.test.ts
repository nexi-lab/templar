/**
 * E2E test — exercises NexusMemoryMiddleware against a live Nexus
 * server with authentication + permissions.
 *
 * Requires:
 *   NEXUS_E2E_URL  (default: http://localhost:2028)
 *   NEXUS_E2E_KEY  (admin API key)
 *
 * Skips automatically when the env vars are absent.
 */

import { NexusClient } from "@nexus/sdk";
import type { SessionContext, TurnContext } from "@templar/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NexusMemoryMiddleware } from "../middleware.js";
import type {
  ExtractedFact,
  FactExtractionContext,
  FactExtractor,
  FactTurnSummary,
  NexusMemoryConfig,
} from "../types.js";

// ============================================================================
// ENV GUARD — skip when Nexus is not available
// ============================================================================

const NEXUS_URL = process.env.NEXUS_E2E_URL ?? "http://localhost:2028";
const NEXUS_KEY = process.env.NEXUS_E2E_KEY ?? "";
const E2E_ENABLED = NEXUS_KEY.length > 0;

const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ============================================================================
// Test helpers
// ============================================================================

/** Deterministic extractor returning canned facts for e2e */
class E2EFactExtractor implements FactExtractor {
  async extract(
    turns: readonly FactTurnSummary[],
    _context: FactExtractionContext,
  ): Promise<readonly ExtractedFact[]> {
    if (turns.length === 0) return [];
    return turns.map((t) => ({
      content: `E2E fact from turn ${t.turnNumber}: ${t.input.slice(0, 50)}`,
      category: "experience" as const,
      importance: 0.5,
      pathKey: `e2e:turn-${t.turnNumber}`,
    }));
  }
}

function createClient(): NexusClient {
  return new NexusClient({
    apiKey: NEXUS_KEY,
    baseUrl: NEXUS_URL,
    timeout: 10_000,
  });
}

function makeConfig(overrides: Partial<NexusMemoryConfig> = {}): NexusMemoryConfig {
  return {
    scope: "agent",
    namespace: `e2e-mem-${Date.now()}`,
    ...overrides,
  };
}

function makeSession(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: `e2e-session-${Date.now()}`,
    agentId: "e2e-agent",
    userId: "e2e-user",
    ...overrides,
  };
}

function makeTurn(overrides?: Partial<TurnContext>): TurnContext {
  return {
    sessionId: "e2e-session",
    turnNumber: 1,
    input: "What is the project status?",
    output: "The project is on track. We shipped feature X yesterday.",
    ...overrides,
  };
}

// ============================================================================
// E2E TESTS
// ============================================================================

describeE2E("NexusMemory E2E (live Nexus)", () => {
  let client: NexusClient;
  const storedIds: string[] = [];

  beforeAll(() => {
    client = createClient();
  });

  afterAll(async () => {
    for (const id of storedIds) {
      try {
        await client.memory.delete(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  // =========================================================================
  // #1: Health check — Nexus server is reachable with auth
  // =========================================================================

  it("should connect to Nexus server with auth", async () => {
    const response = await fetch(`${NEXUS_URL}/health`, {
      headers: { Authorization: `Bearer ${NEXUS_KEY}` },
    });
    const data = (await response.json()) as { status: string; has_auth: boolean };
    expect(data.status).toBe("healthy");
    expect(data.has_auth).toBe(true);
  });

  // =========================================================================
  // #2: Full session lifecycle — start → turns → end
  // =========================================================================

  it("should run full session lifecycle: start → turns → end", async () => {
    const config = makeConfig({ autoSaveInterval: 1 });
    const extractor = new E2EFactExtractor();
    const mw = new NexusMemoryMiddleware(client, config, extractor);

    const session = makeSession();

    // Session start — loads from Nexus (empty initially)
    await mw.onSessionStart(session);

    // Turn 1
    const turn1 = makeTurn({ sessionId: session.sessionId, turnNumber: 1 });
    await mw.onBeforeTurn(turn1);
    await mw.onAfterTurn(turn1);

    // Allow async to settle
    await new Promise((r) => setTimeout(r, 200));

    // Turn 2
    const turn2 = makeTurn({
      sessionId: session.sessionId,
      turnNumber: 2,
      input: "Can you refactor the auth module?",
      output: "Sure, I'll restructure the auth module using the middleware pattern.",
    });
    await mw.onBeforeTurn(turn2);
    await mw.onAfterTurn(turn2);
    await new Promise((r) => setTimeout(r, 200));

    // Session end — final flush
    await mw.onSessionEnd(session);
  });

  // =========================================================================
  // #3: Fact storage and query verification
  // =========================================================================

  it("should store facts queryable from Nexus", async () => {
    const namespace = `e2e-fact-query-${Date.now()}`;
    const config = makeConfig({
      namespace,
      autoSaveInterval: 1,
    });
    const extractor = new E2EFactExtractor();
    const mw = new NexusMemoryMiddleware(client, config, extractor);

    const session = makeSession();
    await mw.onSessionStart(session);

    // Generate a fact
    await mw.onAfterTurn(
      makeTurn({
        sessionId: session.sessionId,
        turnNumber: 1,
        input: "Queryable fact test",
      }),
    );

    // Wait for store to complete
    await new Promise((r) => setTimeout(r, 500));

    await mw.onSessionEnd(session);
    await new Promise((r) => setTimeout(r, 500));

    // Query facts from Nexus
    const result = await client.memory.query({
      memory_type: "experience",
      namespace,
      limit: 10,
    });

    expect(result.results.length).toBeGreaterThan(0);

    // Track for cleanup
    for (const entry of result.results) {
      storedIds.push(entry.memory_id);
    }
  });

  // =========================================================================
  // #4: Dedup verification — same content not stored twice
  // =========================================================================

  it("should deduplicate identical content within a session", async () => {
    const namespace = `e2e-dedup-${Date.now()}`;
    const config = makeConfig({
      namespace,
      autoSaveInterval: 3,
      autoSave: { deduplication: true },
    });

    // Extractor that returns identical content for all turns
    const dupExtractor: FactExtractor = {
      async extract(turns: readonly FactTurnSummary[]): Promise<readonly ExtractedFact[]> {
        return turns.map(() => ({
          content: "Identical fact content for dedup test",
          category: "fact" as const,
          importance: 0.6,
        }));
      },
    };

    const mw = new NexusMemoryMiddleware(client, config, dupExtractor);
    const session = makeSession();
    await mw.onSessionStart(session);

    // 3 turns with identical extracted content
    for (let i = 1; i <= 3; i++) {
      await mw.onAfterTurn(
        makeTurn({
          sessionId: session.sessionId,
          turnNumber: i,
          input: `Dedup test turn ${i}`,
        }),
      );
    }

    await new Promise((r) => setTimeout(r, 500));
    await mw.onSessionEnd(session);
    await new Promise((r) => setTimeout(r, 500));

    // Query stored facts
    const result = await client.memory.query({
      memory_type: "fact",
      namespace,
      limit: 10,
    });

    // Should have only 1 unique fact (not 3)
    expect(result.results.length).toBe(1);

    for (const entry of result.results) {
      storedIds.push(entry.memory_id);
    }
  });

  // =========================================================================
  // #5: Performance — session start + per-turn latency
  // =========================================================================

  it("should meet performance targets (start < 500ms, per-turn < 50ms)", async () => {
    const config = makeConfig({ autoSaveInterval: 5 });
    const extractor = new E2EFactExtractor();
    const mw = new NexusMemoryMiddleware(client, config, extractor);

    const session = makeSession();

    // Measure session start latency
    const startTime = performance.now();
    await mw.onSessionStart(session);
    const sessionStartMs = performance.now() - startTime;

    expect(sessionStartMs).toBeLessThan(500);
    console.log(`[e2e] Session start: ${Math.round(sessionStartMs)}ms`);

    // Measure per-turn latency (onBeforeTurn + onAfterTurn, excluding async extraction)
    const turnTimes: number[] = [];
    for (let i = 1; i <= 5; i++) {
      const turnStart = performance.now();
      const ctx = makeTurn({ sessionId: session.sessionId, turnNumber: i });
      await mw.onBeforeTurn(ctx);
      await mw.onAfterTurn(ctx);
      turnTimes.push(performance.now() - turnStart);
    }

    const avgTurnMs = turnTimes.reduce((a, b) => a + b, 0) / turnTimes.length;
    expect(avgTurnMs).toBeLessThan(50);
    console.log(`[e2e] Avg per-turn: ${avgTurnMs.toFixed(2)}ms`);

    await mw.onSessionEnd(session);
  });

  // =========================================================================
  // #6: Session distillation stored correctly
  // =========================================================================

  it("should store session distillation on session end", async () => {
    const namespace = `e2e-distill-${Date.now()}`;
    const config = makeConfig({ namespace, autoSaveInterval: 10 });
    const extractor = new E2EFactExtractor();
    const mw = new NexusMemoryMiddleware(client, config, extractor);

    const session = makeSession();
    await mw.onSessionStart(session);

    // A few turns
    for (let i = 1; i <= 3; i++) {
      await mw.onAfterTurn(
        makeTurn({
          sessionId: session.sessionId,
          turnNumber: i,
          input: `Distillation test turn ${i}`,
        }),
      );
    }

    await mw.onSessionEnd(session);
    await new Promise((r) => setTimeout(r, 500));

    // Query for distillation
    const result = await client.memory.query({
      namespace,
      limit: 20,
    });

    // Should have facts + distillation
    expect(result.results.length).toBeGreaterThan(0);

    for (const entry of result.results) {
      storedIds.push(entry.memory_id);
    }
  });
});
