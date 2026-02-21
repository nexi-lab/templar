/**
 * Types for CrystallizerMiddleware (#164)
 *
 * The crystallizer observes tool usage patterns across sessions
 * and auto-creates reusable composite tools when patterns repeat.
 *
 * Sequence identity uses tool names only (no input shape matching).
 */

// ---------------------------------------------------------------------------
// Tool call observation
// ---------------------------------------------------------------------------

/** Single tool call record captured by wrapToolCall */
export interface ToolCallRecord {
  /** Name of the tool that was called */
  readonly toolName: string;
  /** Whether the call succeeded */
  readonly success: boolean;
  /** Wall-clock duration in milliseconds */
  readonly durationMs: number;
  /** Turn number within the session */
  readonly turnNumber: number;
  /** ISO-8601 timestamp of the call */
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Session sequence (stored in Nexus Memory)
// ---------------------------------------------------------------------------

/** Aggregated tool sequence for a single session */
export interface SessionSequence {
  /** Session identifier */
  readonly sessionId: string;
  /** Ordered tool names as called in the session */
  readonly sequence: readonly string[];
  /** Per-tool success/failure counts */
  readonly successMap: Readonly<
    Record<string, { readonly success: number; readonly failure: number }>
  >;
  /** ISO-8601 timestamp when the session ended */
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Mined pattern
// ---------------------------------------------------------------------------

/** A frequent sequential pattern discovered by PrefixSpan */
export interface MinedPattern {
  /** Ordered tool names in the pattern */
  readonly tools: readonly string[];
  /** Number of sessions containing this pattern */
  readonly support: number;
  /** Weighted success rate across sessions (0–1) */
  readonly successRate: number;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

/** Feature flags — opt-in/opt-out for crystallizer subsystems */
export interface CrystallizerFeatureFlags {
  /** Track tool calls during session (default: true) */
  readonly observation?: boolean;
  /** Run PrefixSpan pattern mining on session end (default: true) */
  readonly mining?: boolean;
  /** Create artifacts for discovered patterns (default: true) */
  readonly crystallization?: boolean;
  /** Validate crystallized tools on session start (default: true) */
  readonly validation?: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Configuration for CrystallizerMiddleware */
export interface CrystallizerConfig {
  /** Feature flags — enable/disable subsystems */
  readonly enabled?: CrystallizerFeatureFlags;
  /** Minimum support (session count) for crystallization (default: 5) */
  readonly minUses?: number;
  /** Minimum success rate 0–1 for crystallization (default: 0.7) */
  readonly minSuccessRate?: number;
  /** Minimum tools in a pattern (default: 2) */
  readonly minPatternLength?: number;
  /** Maximum tools in a pattern (default: 10) */
  readonly maxPatternLength?: number;
  /** Create artifacts as active (default: false → inactive) */
  readonly autoApprove?: boolean;
  /** Maximum historical sequences to load (default: 100) */
  readonly maxLoadedSequences?: number;
  /** Memory scope for stored sequences (default: "agent") */
  readonly scope?: string;
  /** Memory namespace (default: "crystallizer") */
  readonly namespace?: string;
  /** Timeout for loading data at session start in ms (default: 3000) */
  readonly sessionStartTimeoutMs?: number;
  /** Timeout for storing data at session end in ms (default: 5000) */
  readonly storeTimeoutMs?: number;
  /** Tags applied to created artifacts (default: []) */
  readonly tags?: readonly string[];
}

/** Resolved configuration with all defaults applied */
export interface ResolvedCrystallizerConfig {
  readonly enabled: Required<CrystallizerFeatureFlags>;
  readonly minUses: number;
  readonly minSuccessRate: number;
  readonly minPatternLength: number;
  readonly maxPatternLength: number;
  readonly autoApprove: boolean;
  readonly maxLoadedSequences: number;
  readonly scope: string;
  readonly namespace: string;
  readonly sessionStartTimeoutMs: number;
  readonly storeTimeoutMs: number;
  readonly tags: readonly string[];
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

/** Default feature flags */
export const DEFAULT_CRYSTALLIZER_FEATURE_FLAGS: Required<CrystallizerFeatureFlags> = {
  observation: true,
  mining: true,
  crystallization: true,
  validation: true,
} as const;

/** Default configuration values */
export const DEFAULT_CRYSTALLIZER_CONFIG: ResolvedCrystallizerConfig = {
  enabled: DEFAULT_CRYSTALLIZER_FEATURE_FLAGS,
  minUses: 5,
  minSuccessRate: 0.7,
  minPatternLength: 2,
  maxPatternLength: 10,
  autoApprove: false,
  maxLoadedSequences: 100,
  scope: "agent",
  namespace: "crystallizer",
  sessionStartTimeoutMs: 3000,
  storeTimeoutMs: 5000,
  tags: [],
} as const;
