import type { MemoryScope } from "@nexus/sdk";

/**
 * Injection strategy for memory context
 *
 * - "session_start": Load memories once at session start, inject via metadata
 * - "every_turn": Re-query memories before every turn
 * - "on_demand": Do not automatically inject memories
 */
export type InjectionStrategy = "session_start" | "every_turn" | "on_demand";

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
}

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
