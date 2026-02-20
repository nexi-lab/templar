import type { MemoryScope } from "@nexus/sdk";

/**
 * Injection strategy for memory context
 *
 * - "session_start": Load memories once at session start, inject via metadata
 * - "every_turn": Re-query memories before every turn
 * - "on_demand": Do not automatically inject memories
 */
export type InjectionStrategy = "session_start" | "every_turn" | "on_demand";

// ---------------------------------------------------------------------------
// Memory categories and extracted facts
// ---------------------------------------------------------------------------

/** Memory category for extracted facts */
export type MemoryCategory = "fact" | "preference" | "decision" | "experience";

/** A single fact extracted from conversation turns */
export interface ExtractedFact {
  /** The fact content */
  readonly content: string;
  /** Category of the fact */
  readonly category: MemoryCategory;
  /** Importance score (0-1) */
  readonly importance: number;
  /** Optional path_key for cross-session dedup via Nexus upsert */
  readonly pathKey?: string;
}

/** Summary of a single turn, provided to the fact extractor */
export interface FactTurnSummary {
  /** Sequential turn number */
  readonly turnNumber: number;
  /** Turn input (user message) */
  readonly input: string;
  /** Turn output (agent response) */
  readonly output: string;
  /** When this turn occurred (ISO-8601) */
  readonly timestamp: string;
}

/** Context provided to the fact extractor */
export interface FactExtractionContext {
  /** Current session ID */
  readonly sessionId: string;
}

// ---------------------------------------------------------------------------
// Extractor interface (pluggable, follows ObservationExtractor pattern)
// ---------------------------------------------------------------------------

/** Pluggable fact extractor interface */
export interface FactExtractor {
  /** Extract facts from a batch of turn summaries */
  extract(
    turns: readonly FactTurnSummary[],
    context: FactExtractionContext,
  ): Promise<readonly ExtractedFact[]>;
}

/** Function type for making LLM calls (injected into extractor) */
export type ModelCallFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Auto-save configuration
// ---------------------------------------------------------------------------

/** Configuration for auto-save behavior */
export interface AutoSaveConfig {
  /** Categories to extract (default: all) */
  readonly categories?: readonly MemoryCategory[];
  /** Use LLM-based extraction (default: false — uses SimpleFactExtractor) */
  readonly useLlmExtraction?: boolean;
  /** Enable content-hash deduplication (default: true) */
  readonly deduplication?: boolean;
  /** Timeout for extraction in ms (default: 10000) */
  readonly extractionTimeoutMs?: number;
  /** Maximum pending memories in buffer (default: 100) */
  readonly maxPendingMemories?: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for NexusMemoryMiddleware
 */
export interface NexusMemoryConfig {
  /** Memory scope — required */
  scope: MemoryScope;

  /** Flush pending memories every N turns (default: 5) */
  autoSaveInterval?: number;

  /** Max memories per query (default: 10) */
  maxMemoriesPerQuery?: number;

  /** When to inject memories into turn context (default: "session_start") */
  injectionStrategy?: InjectionStrategy;

  /** Timeout for session start memory query in ms (default: 3000) */
  sessionStartTimeoutMs?: number;

  /** Timeout for distillation at session end in ms (default: 10000) */
  distillationTimeoutMs?: number;

  /** Optional namespace prefix for memory queries */
  namespace?: string;

  /** Auto-save configuration for fact extraction */
  autoSave?: AutoSaveConfig;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Default auto-save configuration */
export const DEFAULT_AUTO_SAVE_CONFIG: Required<AutoSaveConfig> = {
  categories: ["fact", "preference", "decision", "experience"],
  useLlmExtraction: false,
  deduplication: false,
  extractionTimeoutMs: 10000,
  maxPendingMemories: 100,
} as const;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  autoSaveInterval: 5,
  maxMemoriesPerQuery: 10,
  injectionStrategy: "session_start" as const,
  sessionStartTimeoutMs: 3000,
  distillationTimeoutMs: 10000,
} as const;
