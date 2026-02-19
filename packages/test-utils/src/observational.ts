/**
 * Test helpers for ObservationalMemoryMiddleware.
 *
 * Provides deterministic extractors and reflectors that return canned data
 * for use in unit and integration tests.
 *
 * Types are defined inline to avoid a circular dependency between
 * @templar/test-utils and @templar/middleware.
 */

// ---------------------------------------------------------------------------
// Inline types (mirrors @templar/middleware/observational types)
// ---------------------------------------------------------------------------

/** Observation priority level */
type ObservationPriority = "critical" | "important" | "informational";

/** Single observation extracted from conversation turns */
interface Observation {
  readonly timestamp: string;
  readonly priority: ObservationPriority;
  readonly content: string;
  readonly sourceType: "turn" | "model_call" | "tool_call";
  readonly turnNumbers: readonly number[];
  readonly metadata?: Record<string, unknown>;
}

/** Summary of a single turn */
interface TurnSummary {
  readonly turnNumber: number;
  readonly input: string;
  readonly output: string;
  readonly toolCalls?: readonly { readonly name: string; readonly result: string }[];
  readonly timestamp: string;
}

/** Context provided to the observation extractor */
interface ExtractionContext {
  readonly sessionId: string;
  readonly agentId: string;
  readonly existingObservations: readonly Observation[];
}

/** Pluggable observation extractor interface */
interface ObservationExtractor {
  extract(
    turns: readonly TurnSummary[],
    context: ExtractionContext,
  ): Promise<readonly Observation[]>;
}

/** Input to the reflector */
interface ReflectionInput {
  readonly observations: readonly Observation[];
  readonly sessionId: string;
  readonly agentId: string;
}

/** A single reflection */
interface Reflection {
  readonly timestamp: string;
  readonly insight: string;
  readonly sourceObservationCount: number;
  readonly metadata?: Record<string, unknown>;
}

/** Reflector interface */
interface ObservationReflector {
  reflect(input: ReflectionInput): Promise<readonly Reflection[]>;
}

// ---------------------------------------------------------------------------
// Test implementations
// ---------------------------------------------------------------------------

/**
 * Test observation extractor that returns canned observations.
 *
 * @example
 * ```typescript
 * const extractor = new TestObservationExtractor([
 *   { timestamp: "...", priority: "critical", content: "User prefers TS", sourceType: "turn", turnNumbers: [1] },
 * ]);
 * const mw = new ObservationalMemoryMiddleware(client, extractor);
 * ```
 */
export class TestObservationExtractor implements ObservationExtractor {
  readonly observations: readonly Observation[];

  constructor(observations: readonly Observation[] = []) {
    this.observations = observations;
  }

  async extract(
    _turns: readonly TurnSummary[],
    _context: ExtractionContext,
  ): Promise<readonly Observation[]> {
    return this.observations;
  }
}

/**
 * Test observation reflector that returns canned reflections.
 *
 * @example
 * ```typescript
 * const reflector = new TestObservationReflector([
 *   { timestamp: "...", insight: "User prefers strict mode", sourceObservationCount: 5 },
 * ]);
 * const mw = new ObservationalMemoryMiddleware(client, extractor, config, reflector);
 * ```
 */
export class TestObservationReflector implements ObservationReflector {
  readonly reflections: readonly Reflection[];

  constructor(reflections: readonly Reflection[] = []) {
    this.reflections = reflections;
  }

  async reflect(_input: ReflectionInput): Promise<readonly Reflection[]> {
    return this.reflections;
  }
}
