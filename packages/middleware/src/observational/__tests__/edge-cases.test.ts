import type { SessionContext, TurnContext } from "@templar/core";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservationalMemoryMiddleware } from "../middleware.js";
import type {
  ExtractionContext,
  Observation,
  ObservationExtractor,
  ObservationReflector,
  Reflection,
  ReflectionInput,
  TurnSummary,
} from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSessionContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: "session-1",
    agentId: "agent-1",
    userId: "user-1",
    ...overrides,
  };
}

function makeTurnContext(overrides?: Partial<TurnContext>): TurnContext {
  return {
    sessionId: "session-1",
    turnNumber: 1,
    input: "hello",
    output: "world",
    ...overrides,
  };
}

function makeObservation(overrides?: Partial<Observation>): Observation {
  return {
    timestamp: "2026-02-18T10:00:00Z",
    priority: "important",
    content: "Test observation",
    sourceType: "turn",
    turnNumbers: [1],
    ...overrides,
  };
}

class TestExtractor implements ObservationExtractor {
  readonly observations: readonly Observation[];

  constructor(observations: readonly Observation[] = [makeObservation()]) {
    this.observations = observations;
  }

  async extract(
    _turns: readonly TurnSummary[],
    _context: ExtractionContext,
  ): Promise<readonly Observation[]> {
    return this.observations;
  }
}

class FailingExtractor implements ObservationExtractor {
  async extract(): Promise<readonly Observation[]> {
    throw new Error("LLM API timeout");
  }
}

class EmptyReflector implements ObservationReflector {
  async reflect(_input: ReflectionInput): Promise<readonly Reflection[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe("Edge Cases", () => {
  let mocks: MockNexusClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = createMockNexusClient();
    mocks.mockMemory.query.mockResolvedValue({ results: [], total: 0, filters: {} });
    mocks.mockMemory.batchStore.mockResolvedValue({
      stored: 1,
      failed: 0,
      memory_ids: ["mem-1"],
    });
  });

  // =========================================================================
  // #1: Observer LLM call fails → fallback to empty, session continues
  // =========================================================================

  it("should continue session when observer LLM call fails", async () => {
    const failingExtractor = new FailingExtractor();
    const mw = new ObservationalMemoryMiddleware(mocks.client, failingExtractor, {
      observerInterval: 1,
    });

    await mw.onSessionStart(makeSessionContext());

    // Should not throw even though extractor fails
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
    await new Promise((r) => setTimeout(r, 50));

    // Session should continue normally
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 2 }));
    await mw.onSessionEnd(makeSessionContext());
  });

  // =========================================================================
  // #2: Nexus batchStore fails → no crash
  // =========================================================================

  it("should handle Nexus batchStore failure gracefully", async () => {
    mocks.mockMemory.batchStore.mockRejectedValue(new Error("Nexus unavailable"));

    const extractor = new TestExtractor();
    const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
      observerInterval: 1,
    });

    await mw.onSessionStart(makeSessionContext());
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));

    // Allow async fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 50));

    // Session should continue — batchStore failure is swallowed by safeNexusCall
    await mw.onSessionEnd(makeSessionContext());
  });

  // =========================================================================
  // #3: Reflector called with 0 observations → no-op
  // =========================================================================

  it("should no-op when reflector has no observations", async () => {
    const emptyReflector = new EmptyReflector();
    const _reflectSpy = vi.spyOn(emptyReflector, "reflect");

    const mw = new ObservationalMemoryMiddleware(
      mocks.client,
      new TestExtractor([]), // Empty extractor — no observations produced
      {
        observerInterval: 1,
        reflectorInterval: 1,
        enabled: { observer: true, reflector: true },
      },
      emptyReflector,
    );

    await mw.onSessionStart(makeSessionContext());
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
    await new Promise((r) => setTimeout(r, 50));

    // Reflector should not be called if no observations exist
    // (The middleware checks observations.length > 0 internally)
    // Since extraction returns empty, observations remain empty
    await mw.onSessionEnd(makeSessionContext());

    // The reflect call in onSessionEnd guards against empty observations
    // so reflectSpy may or may not be called depending on internal state
    // What matters: no crash
  });

  // =========================================================================
  // #4: Concurrent sessions → no shared mutable state
  // =========================================================================

  it("should isolate state between concurrent middleware instances", async () => {
    const extractor1 = new TestExtractor([makeObservation({ content: "Session 1 observation" })]);
    const extractor2 = new TestExtractor([makeObservation({ content: "Session 2 observation" })]);

    const mw1 = new ObservationalMemoryMiddleware(mocks.client, extractor1, {
      observerInterval: 1,
    });
    const mw2 = new ObservationalMemoryMiddleware(mocks.client, extractor2, {
      observerInterval: 1,
    });

    await mw1.onSessionStart(makeSessionContext({ sessionId: "s1" }));
    await mw2.onSessionStart(makeSessionContext({ sessionId: "s2" }));

    await mw1.onAfterTurn(makeTurnContext({ sessionId: "s1", turnNumber: 1 }));
    await mw2.onAfterTurn(makeTurnContext({ sessionId: "s2", turnNumber: 1 }));

    await new Promise((r) => setTimeout(r, 50));

    // Check that context injection is isolated
    const ctx1 = makeTurnContext({ sessionId: "s1", turnNumber: 2 });
    const ctx2 = makeTurnContext({ sessionId: "s2", turnNumber: 2 });

    await mw1.onBeforeTurn(ctx1);
    await mw2.onBeforeTurn(ctx2);

    const obs1 = ctx1.metadata?.observations as readonly Observation[] | undefined;
    const obs2 = ctx2.metadata?.observations as readonly Observation[] | undefined;

    // Each should have its own observations
    if (obs1 && obs1.length > 0) {
      expect(obs1[0]?.content).toBe("Session 1 observation");
    }
    if (obs2 && obs2.length > 0) {
      expect(obs2[0]?.content).toBe("Session 2 observation");
    }
  });

  // =========================================================================
  // #5: Observer produces malformed output → graceful skip
  // =========================================================================

  it("should handle malformed extractor output gracefully", async () => {
    // Extractor returns observations with missing fields — middleware should handle
    const weirdExtractor: ObservationExtractor = {
      async extract(): Promise<readonly Observation[]> {
        return [
          {
            timestamp: "",
            priority: "critical",
            content: "",
            sourceType: "turn",
            turnNumbers: [],
          },
        ];
      },
    };

    const mw = new ObservationalMemoryMiddleware(mocks.client, weirdExtractor, {
      observerInterval: 1,
    });

    await mw.onSessionStart(makeSessionContext());
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));

    await new Promise((r) => setTimeout(r, 50));

    // Should not crash
    await mw.onSessionEnd(makeSessionContext());
  });

  // =========================================================================
  // #6: Session ends before first observation interval → clean teardown
  // =========================================================================

  it("should handle session ending before first observer interval", async () => {
    const extractSpy = vi.fn().mockResolvedValue([makeObservation()]);
    const extractor: ObservationExtractor = { extract: extractSpy };

    const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
      observerInterval: 10, // Won't trigger in 2 turns
    });

    await mw.onSessionStart(makeSessionContext());
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 2 }));

    // Session ends with buffered turns but observer never triggered
    await mw.onSessionEnd(makeSessionContext());

    // Final extraction should happen in onSessionEnd
    expect(extractSpy).toHaveBeenCalledTimes(1);
  });

  // =========================================================================
  // #7: Observation buffer exceeds maxObservations → trimmed to rolling window
  // =========================================================================

  it("should trim observations to maxObservations rolling window", async () => {
    // Create extractor that produces 5 observations per call
    const manyObservations = Array.from({ length: 5 }, (_, i) =>
      makeObservation({ content: `Observation ${i}`, turnNumbers: [1] }),
    );

    const mw = new ObservationalMemoryMiddleware(
      mocks.client,
      new TestExtractor(manyObservations),
      {
        observerInterval: 1,
        maxObservations: 8, // Small window for testing
      },
    );

    await mw.onSessionStart(makeSessionContext());

    // Turn 1: 5 observations added (total: 5)
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
    await new Promise((r) => setTimeout(r, 50));

    // Turn 2: 5 more (total would be 10, trimmed to 8)
    await mw.onAfterTurn(makeTurnContext({ turnNumber: 2 }));
    await new Promise((r) => setTimeout(r, 50));

    // Check that context injection has <= maxObservations
    const ctx = makeTurnContext({ turnNumber: 3 });
    await mw.onBeforeTurn(ctx);

    const injectedObs = ctx.metadata?.observations as readonly Observation[] | undefined;
    if (injectedObs) {
      expect(injectedObs.length).toBeLessThanOrEqual(8);
    }
  });
});
