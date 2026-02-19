/**
 * Types for ObservationalMemoryMiddleware (#154)
 *
 * Observational memory uses two background processes:
 * - Observer: extracts key observations from conversation turns
 * - Reflector: synthesizes observations into higher-level insights
 */

// ---------------------------------------------------------------------------
// Observation data types
// ---------------------------------------------------------------------------

/** Observation priority level (Mastra-inspired) */
export type ObservationPriority = "critical" | "important" | "informational";

/** Single observation extracted from conversation turns */
export interface Observation {
  /** When the observation was created (ISO-8601) */
  readonly timestamp: string;
  /** Priority level */
  readonly priority: ObservationPriority;
  /** Dense observation note */
  readonly content: string;
  /** Source of the observation */
  readonly sourceType: "turn" | "model_call" | "tool_call";
  /** Which turns this observation covers */
  readonly turnNumbers: readonly number[];
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/** Summary of a single turn, provided to the extractor */
export interface TurnSummary {
  /** Sequential turn number */
  readonly turnNumber: number;
  /** Turn input (user message) */
  readonly input: string;
  /** Turn output (agent response) */
  readonly output: string;
  /** Tool calls made during this turn */
  readonly toolCalls?: readonly { readonly name: string; readonly result: string }[];
  /** When this turn occurred (ISO-8601) */
  readonly timestamp: string;
}

/** Context provided to the observation extractor */
export interface ExtractionContext {
  /** Current session ID */
  readonly sessionId: string;
  /** Agent identifier */
  readonly agentId: string;
  /** Existing observations from this session (for continuity) */
  readonly existingObservations: readonly Observation[];
}

// ---------------------------------------------------------------------------
// Extractor interface (pluggable, follows EntityExtractor pattern)
// ---------------------------------------------------------------------------

/** Pluggable observation extractor interface */
export interface ObservationExtractor {
  /** Extract observations from a batch of turn summaries */
  extract(
    turns: readonly TurnSummary[],
    context: ExtractionContext,
  ): Promise<readonly Observation[]>;
}

// ---------------------------------------------------------------------------
// Reflector types
// ---------------------------------------------------------------------------

/** Input to the reflector — observations to synthesize */
export interface ReflectionInput {
  /** Observations to synthesize */
  readonly observations: readonly Observation[];
  /** Current session ID */
  readonly sessionId: string;
  /** Agent identifier */
  readonly agentId: string;
}

/** A single reflection — condensed insight from observations */
export interface Reflection {
  /** When the reflection was created (ISO-8601) */
  readonly timestamp: string;
  /** The synthesized insight */
  readonly insight: string;
  /** Number of source observations used */
  readonly sourceObservationCount: number;
  /** Additional metadata */
  readonly metadata?: Record<string, unknown>;
}

/** Reflector interface — synthesizes observations into insights */
export interface ObservationReflector {
  /** Synthesize observations into higher-level reflections */
  reflect(input: ReflectionInput): Promise<readonly Reflection[]>;
}

// ---------------------------------------------------------------------------
// Model call function type
// ---------------------------------------------------------------------------

/** Function type for making LLM calls (injected into extractor/reflector) */
export type ModelCallFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/** Feature flags — opt-in/opt-out for observational memory subsystems */
export interface ObservationalFeatureFlags {
  /** Extract observations from conversation turns (default: true) */
  readonly observer?: boolean;
  /** Synthesize observations into reflections (default: false — requires LLM) */
  readonly reflector?: boolean;
  /** Inject observations/reflections into context (default: true) */
  readonly contextInjection?: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for ObservationalMemoryMiddleware */
export interface ObservationalMemoryConfig {
  /** Feature flags — enable/disable subsystems */
  readonly enabled?: ObservationalFeatureFlags;

  // --- Observer config ---
  /** Extract observations every N turns (default: 3) */
  readonly observerInterval?: number;
  /** Maximum observations in rolling window (default: 100) */
  readonly maxObservations?: number;
  /** Maximum observer LLM calls per session (default: 20) */
  readonly maxObserverCalls?: number;
  /** Timeout for observer LLM call in ms (default: 10000) */
  readonly observerTimeoutMs?: number;

  // --- Reflector config ---
  /** Synthesize reflections every N turns (default: 10) */
  readonly reflectorInterval?: number;
  /** Timeout for reflector LLM call in ms (default: 15000) */
  readonly reflectorTimeoutMs?: number;

  // --- Storage config ---
  /** Memory scope for stored observations (default: "agent") */
  readonly scope?: string;
  /** Namespace prefix for stored observations (default: "observational") */
  readonly namespace?: string;
  /** Timeout for loading observations at session start in ms (default: 3000) */
  readonly sessionStartTimeoutMs?: number;
  /** Maximum observations to load at session start (default: 50) */
  readonly maxLoadedObservations?: number;
  /** Maximum reflections to load at session start (default: 10) */
  readonly maxLoadedReflections?: number;
  /** Timeout for batchStore operations in ms (default: 5000) */
  readonly storeTimeoutMs?: number;
}

/** Resolved configuration with all defaults applied */
export interface ResolvedObservationalConfig {
  readonly enabled: Required<ObservationalFeatureFlags>;
  readonly observerInterval: number;
  readonly maxObservations: number;
  readonly maxObserverCalls: number;
  readonly observerTimeoutMs: number;
  readonly reflectorInterval: number;
  readonly reflectorTimeoutMs: number;
  readonly scope: string;
  readonly namespace: string;
  readonly sessionStartTimeoutMs: number;
  readonly maxLoadedObservations: number;
  readonly maxLoadedReflections: number;
  readonly storeTimeoutMs: number;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

/** Default feature flags */
export const DEFAULT_OBSERVATIONAL_FEATURE_FLAGS: Required<ObservationalFeatureFlags> = {
  observer: true,
  reflector: false,
  contextInjection: true,
} as const;

/** Default configuration values */
export const DEFAULT_OBSERVATIONAL_CONFIG: ResolvedObservationalConfig = {
  enabled: DEFAULT_OBSERVATIONAL_FEATURE_FLAGS,
  observerInterval: 3,
  maxObservations: 100,
  maxObserverCalls: 20,
  observerTimeoutMs: 10000,
  reflectorInterval: 10,
  reflectorTimeoutMs: 15000,
  scope: "agent",
  namespace: "observational",
  sessionStartTimeoutMs: 3000,
  maxLoadedObservations: 50,
  maxLoadedReflections: 10,
  storeTimeoutMs: 5000,
} as const;
