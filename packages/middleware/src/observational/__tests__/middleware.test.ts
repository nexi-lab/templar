import type { SessionContext, TurnContext } from "@templar/core";
import { ObservationalConfigurationError } from "@templar/errors";
import { createMockNexusClient, type MockNexusClient } from "@templar/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObservationalMemoryMiddleware, validateObservationalConfig } from "../middleware.js";
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

function makeReflection(overrides?: Partial<Reflection>): Reflection {
  return {
    timestamp: "2026-02-18T10:00:00Z",
    insight: "Test insight",
    sourceObservationCount: 5,
    ...overrides,
  };
}

/** Test extractor that returns canned observations */
class TestObservationExtractor implements ObservationExtractor {
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

/** Test reflector that returns canned reflections */
class TestObservationReflector implements ObservationReflector {
  readonly reflections: readonly Reflection[];

  constructor(reflections: readonly Reflection[] = [makeReflection()]) {
    this.reflections = reflections;
  }

  async reflect(_input: ReflectionInput): Promise<readonly Reflection[]> {
    return this.reflections;
  }
}

function setupDefaultMocks(mocks: MockNexusClient): void {
  mocks.mockMemory.query.mockResolvedValue({
    results: [],
    total: 0,
    filters: {},
  });

  mocks.mockMemory.batchStore.mockResolvedValue({
    stored: 1,
    failed: 0,
    memory_ids: ["mem-1"],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ObservationalMemoryMiddleware", () => {
  let mocks: MockNexusClient;
  let extractor: TestObservationExtractor;
  let reflector: TestObservationReflector;

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks = createMockNexusClient();
    extractor = new TestObservationExtractor();
    reflector = new TestObservationReflector();
    setupDefaultMocks(mocks);
  });

  // =========================================================================
  // Constructor + Config
  // =========================================================================

  describe("constructor", () => {
    it("should create middleware with valid config", () => {
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        observerInterval: 5,
        maxObservations: 50,
      });

      expect(mw.name).toBe("observational-memory");
    });

    it("should create middleware with default config", () => {
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor);
      expect(mw.name).toBe("observational-memory");
    });

    it("should throw on invalid config", () => {
      expect(
        () =>
          new ObservationalMemoryMiddleware(mocks.client, extractor, {
            observerInterval: -1,
          }),
      ).toThrow(ObservationalConfigurationError);
    });
  });

  describe("validateObservationalConfig", () => {
    it("should accept empty config", () => {
      expect(() => validateObservationalConfig({})).not.toThrow();
    });

    it("should reject invalid observerInterval", () => {
      expect(() => validateObservationalConfig({ observerInterval: 0 })).toThrow(
        ObservationalConfigurationError,
      );
    });

    it("should reject invalid maxObservations", () => {
      expect(() => validateObservationalConfig({ maxObservations: 0 })).toThrow(
        ObservationalConfigurationError,
      );
      expect(() => validateObservationalConfig({ maxObservations: 20000 })).toThrow(
        ObservationalConfigurationError,
      );
    });

    it("should collect multiple validation errors", () => {
      try {
        validateObservationalConfig({
          observerInterval: -1,
          maxObserverCalls: -5,
        });
        expect.unreachable("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ObservationalConfigurationError);
        const err = e as ObservationalConfigurationError;
        expect(err.validationErrors).toHaveLength(2);
      }
    });
  });

  // =========================================================================
  // Session Lifecycle
  // =========================================================================

  describe("onSessionStart", () => {
    it("should load observations and reflections in parallel", async () => {
      mocks.mockMemory.query
        .mockResolvedValueOnce({
          results: [
            {
              memory_id: "obs-1",
              content: "Loaded observation",
              scope: "agent",
              state: "active",
              created_at: "2026-02-18T09:00:00Z",
              metadata: { priority: "critical", sourceType: "turn", turnNumbers: [1] },
            },
          ],
          total: 1,
          filters: {},
        })
        .mockResolvedValueOnce({
          results: [],
          total: 0,
          filters: {},
        });

      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        enabled: { observer: true, reflector: true },
      });

      await mw.onSessionStart(makeSessionContext());

      expect(mocks.mockMemory.query).toHaveBeenCalledTimes(2);
      expect(mocks.mockMemory.query).toHaveBeenCalledWith(
        expect.objectContaining({ memory_type: "observation" }),
      );
    });

    it("should fallback to empty on timeout", async () => {
      mocks.mockMemory.query.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ results: [], total: 0, filters: {} }), 10000),
          ),
      );

      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        sessionStartTimeoutMs: 10, // Very short timeout
      });

      // Should not throw — graceful degradation
      await mw.onSessionStart(makeSessionContext());
    });
  });

  describe("onBeforeTurn", () => {
    it("should inject observations into metadata", async () => {
      mocks.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "obs-1",
            content: "A past observation",
            scope: "agent",
            state: "active",
            created_at: "2026-02-18T09:00:00Z",
            metadata: { priority: "important", sourceType: "turn", turnNumbers: [1] },
          },
        ],
        total: 1,
        filters: {},
      });

      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor);
      await mw.onSessionStart(makeSessionContext());

      const ctx = makeTurnContext();
      await mw.onBeforeTurn(ctx);

      expect(ctx.metadata?.observations).toBeDefined();
      expect((ctx.metadata?.observations as readonly Observation[]).length).toBe(1);
    });

    it("should not inject when contextInjection is disabled", async () => {
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        enabled: { contextInjection: false },
      });

      await mw.onSessionStart(makeSessionContext());

      const ctx = makeTurnContext();
      await mw.onBeforeTurn(ctx);

      expect(ctx.metadata?.observations).toBeUndefined();
    });

    it("should not inject when observations are empty", async () => {
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor);
      await mw.onSessionStart(makeSessionContext());

      const ctx = makeTurnContext();
      await mw.onBeforeTurn(ctx);

      expect(ctx.metadata?.observations).toBeUndefined();
    });
  });

  describe("onAfterTurn", () => {
    it("should trigger observer at the configured interval", async () => {
      const extractSpy = vi.spyOn(extractor, "extract");
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        observerInterval: 2,
      });
      await mw.onSessionStart(makeSessionContext());

      // Turn 1: no extraction
      await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
      // Turn 2: should trigger (2 % 2 === 0)
      await mw.onAfterTurn(makeTurnContext({ turnNumber: 2 }));

      // Allow async fire-and-forget to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(extractSpy).toHaveBeenCalledTimes(1);
    });

    it("should respect maxObserverCalls cap", async () => {
      const extractSpy = vi.spyOn(extractor, "extract");
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        observerInterval: 1,
        maxObserverCalls: 2,
      });
      await mw.onSessionStart(makeSessionContext());

      // 5 turns with interval 1 and cap 2 → only 2 calls
      for (let i = 1; i <= 5; i++) {
        await mw.onAfterTurn(makeTurnContext({ turnNumber: i }));
      }

      await new Promise((r) => setTimeout(r, 50));

      expect(extractSpy).toHaveBeenCalledTimes(2);
    });

    it("should trigger reflector at the configured interval", async () => {
      const reflectSpy = vi.spyOn(reflector, "reflect");
      const mw = new ObservationalMemoryMiddleware(
        mocks.client,
        extractor,
        {
          observerInterval: 1,
          reflectorInterval: 3,
          enabled: { observer: true, reflector: true },
        },
        reflector,
      );
      await mw.onSessionStart(makeSessionContext());

      for (let i = 1; i <= 6; i++) {
        await mw.onAfterTurn(makeTurnContext({ turnNumber: i }));
      }

      await new Promise((r) => setTimeout(r, 100));

      // Reflector should be called at turn 3 and 6
      expect(reflectSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("onSessionEnd", () => {
    it("should flush remaining buffer", async () => {
      const extractSpy = vi.spyOn(extractor, "extract");
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        observerInterval: 100, // Very high — won't trigger during turns
      });
      await mw.onSessionStart(makeSessionContext());

      await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
      await mw.onAfterTurn(makeTurnContext({ turnNumber: 2 }));

      await mw.onSessionEnd(makeSessionContext());

      expect(extractSpy).toHaveBeenCalledTimes(1);
    });

    it("should trigger final reflection", async () => {
      const reflectSpy = vi.spyOn(reflector, "reflect");
      const mw = new ObservationalMemoryMiddleware(
        mocks.client,
        extractor,
        {
          observerInterval: 1,
          enabled: { observer: true, reflector: true },
        },
        reflector,
      );
      await mw.onSessionStart(makeSessionContext());

      await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
      await new Promise((r) => setTimeout(r, 50));

      await mw.onSessionEnd(makeSessionContext());

      expect(reflectSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Wrap Hooks
  // =========================================================================

  describe("wrapModelCall", () => {
    it("should inject observations into system prompt", async () => {
      // Preload an observation
      mocks.mockMemory.query.mockResolvedValue({
        results: [
          {
            memory_id: "obs-1",
            content: "User prefers TypeScript",
            scope: "agent",
            state: "active",
            created_at: "2026-02-18T09:00:00Z",
            metadata: { priority: "critical", sourceType: "turn", turnNumbers: [1] },
          },
        ],
        total: 1,
        filters: {},
      });

      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor);
      await mw.onSessionStart(makeSessionContext());

      const nextFn = vi.fn().mockResolvedValue({
        content: "response",
        model: "test-model",
      });

      await mw.wrapModelCall(
        {
          messages: [{ role: "user", content: "test" }],
          systemPrompt: "You are helpful",
        },
        nextFn,
      );

      const req = nextFn.mock.calls[0]?.[0];
      expect(req.systemPrompt).toContain("Conversation Observations");
      expect(req.systemPrompt).toContain("User prefers TypeScript");
    });

    it("should not modify prompt when no observations", async () => {
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor);
      await mw.onSessionStart(makeSessionContext());

      const nextFn = vi.fn().mockResolvedValue({ content: "ok" });

      await mw.wrapModelCall(
        { messages: [{ role: "user", content: "test" }], systemPrompt: "Original" },
        nextFn,
      );

      expect(nextFn.mock.calls[0]?.[0].systemPrompt).toBe("Original");
    });
  });

  describe("wrapToolCall", () => {
    it("should capture tool call results for observation extraction", async () => {
      const extractSpy = vi.spyOn(extractor, "extract");
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        observerInterval: 1,
      });
      await mw.onSessionStart(makeSessionContext());

      const nextFn = vi.fn().mockResolvedValue({ output: "file contents here" });

      await mw.wrapToolCall({ toolName: "read_file", input: "/src/index.ts" }, nextFn);
      await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));

      await new Promise((r) => setTimeout(r, 50));

      // Extractor should receive the turn summary with tool calls
      expect(extractSpy).toHaveBeenCalledTimes(1);
      const turns = extractSpy.mock.calls[0]?.[0] as readonly TurnSummary[];
      expect(turns[0]?.toolCalls).toBeDefined();
      expect(turns[0]?.toolCalls?.[0]?.name).toBe("read_file");
    });
  });

  // =========================================================================
  // Feature flags
  // =========================================================================

  describe("feature flags", () => {
    it("should no-op when all features are disabled", async () => {
      const extractSpy = vi.spyOn(extractor, "extract");
      const mw = new ObservationalMemoryMiddleware(mocks.client, extractor, {
        enabled: { observer: false, reflector: false, contextInjection: false },
      });

      await mw.onSessionStart(makeSessionContext());
      expect(mocks.mockMemory.query).not.toHaveBeenCalled();

      await mw.onAfterTurn(makeTurnContext({ turnNumber: 1 }));
      expect(extractSpy).not.toHaveBeenCalled();
    });
  });
});
