/**
 * E2E test — exercises ObservationalMemoryMiddleware against a live Nexus
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
import { ObservationalMemoryMiddleware } from "../middleware.js";
import type {
  ExtractionContext,
  Observation,
  ObservationalMemoryConfig,
  ObservationExtractor,
  ObservationReflector,
  Reflection,
  ReflectionInput,
  TurnSummary,
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

/** Deterministic extractor returning canned observations for e2e */
class E2EExtractor implements ObservationExtractor {
  async extract(
    turns: readonly TurnSummary[],
    _context: ExtractionContext,
  ): Promise<readonly Observation[]> {
    if (turns.length === 0) return [];
    const ts = new Date().toISOString();
    return turns.map((t) => ({
      timestamp: ts,
      priority: "important" as const,
      content: `E2E observation from turn ${t.turnNumber}: ${t.input.slice(0, 50)}`,
      sourceType: "turn" as const,
      turnNumbers: [t.turnNumber],
    }));
  }
}

/** Deterministic reflector returning canned reflections for e2e */
class E2EReflector implements ObservationReflector {
  async reflect(input: ReflectionInput): Promise<readonly Reflection[]> {
    if (input.observations.length === 0) return [];
    return [
      {
        timestamp: new Date().toISOString(),
        insight: `Synthesized ${input.observations.length} observations into a reflection`,
        sourceObservationCount: input.observations.length,
      },
    ];
  }
}

function createClient(): NexusClient {
  return new NexusClient({
    apiKey: NEXUS_KEY,
    baseUrl: NEXUS_URL,
    timeout: 10_000,
  });
}

function makeConfig(overrides: Partial<ObservationalMemoryConfig> = {}): ObservationalMemoryConfig {
  return {
    namespace: `e2e-obs-${Date.now()}`,
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

describeE2E("ObservationalMemory E2E (live Nexus)", () => {
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
    const config = makeConfig({
      observerInterval: 1,
      enabled: { observer: true, reflector: true },
    });
    const extractor = new E2EExtractor();
    const reflector = new E2EReflector();
    const mw = new ObservationalMemoryMiddleware(client, extractor, config, reflector);

    const session = makeSession();

    // Session start — loads from Nexus (empty initially)
    await mw.onSessionStart(session);

    // Turn 1
    const turn1 = makeTurn({ sessionId: session.sessionId, turnNumber: 1 });
    await mw.onBeforeTurn(turn1);
    await mw.onAfterTurn(turn1);

    // Allow async fire-and-forget to settle
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

    // Context injection should include observations after extraction
    const turn3 = makeTurn({ sessionId: session.sessionId, turnNumber: 3 });
    await mw.onBeforeTurn(turn3);

    // Observations should be injected into metadata
    const obs = turn3.metadata?.observations as readonly Observation[] | undefined;
    expect(obs).toBeDefined();
    if (obs) {
      expect(obs.length).toBeGreaterThan(0);
    }

    // Session end — final flush
    await mw.onSessionEnd(session);
  });

  // =========================================================================
  // #3: Observation storage and query verification
  // =========================================================================

  it("should store observations queryable from Nexus", async () => {
    const namespace = `e2e-obs-query-${Date.now()}`;
    const config = makeConfig({
      namespace,
      observerInterval: 1,
    });
    const extractor = new E2EExtractor();
    const mw = new ObservationalMemoryMiddleware(client, extractor, config);

    const session = makeSession();
    await mw.onSessionStart(session);

    // Generate an observation
    await mw.onAfterTurn(
      makeTurn({
        sessionId: session.sessionId,
        turnNumber: 1,
        input: "Queryable observation test",
      }),
    );

    // Wait for async store to complete
    await new Promise((r) => setTimeout(r, 500));

    await mw.onSessionEnd(session);
    await new Promise((r) => setTimeout(r, 500));

    // Query observations from Nexus
    const result = await client.memory.query({
      memory_type: "observation",
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
  // #4: Reflections stored and retrievable
  // =========================================================================

  it("should store reflections queryable from Nexus", async () => {
    const namespace = `e2e-ref-query-${Date.now()}`;
    const config = makeConfig({
      namespace,
      observerInterval: 1,
      reflectorInterval: 2,
      enabled: { observer: true, reflector: true },
    });
    const extractor = new E2EExtractor();
    const reflector = new E2EReflector();
    const mw = new ObservationalMemoryMiddleware(client, extractor, config, reflector);

    const session = makeSession();
    await mw.onSessionStart(session);

    // Generate observations across multiple turns
    for (let i = 1; i <= 3; i++) {
      await mw.onAfterTurn(
        makeTurn({
          sessionId: session.sessionId,
          turnNumber: i,
          input: `Reflection test turn ${i}`,
        }),
      );
      await new Promise((r) => setTimeout(r, 100));
    }

    // Session end triggers final reflection
    await mw.onSessionEnd(session);
    await new Promise((r) => setTimeout(r, 500));

    // Query reflections from Nexus
    const result = await client.memory.query({
      memory_type: "reflection",
      namespace,
      limit: 10,
    });

    expect(result.results.length).toBeGreaterThan(0);

    for (const entry of result.results) {
      storedIds.push(entry.memory_id);
    }
  });

  // =========================================================================
  // #5: Performance — session start + per-turn latency
  // =========================================================================

  it("should meet performance targets (start < 500ms, per-turn < 50ms)", async () => {
    const config = makeConfig({ observerInterval: 5 });
    const extractor = new E2EExtractor();
    const mw = new ObservationalMemoryMiddleware(client, extractor, config);

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
});
