/**
 * Type definitions for DistillationMiddleware.
 */

import type { NexusClient } from "@nexus/sdk";

// ---------------------------------------------------------------------------
// Extracted memory representation
// ---------------------------------------------------------------------------

export interface ExtractedMemory {
  /** Memory content text */
  readonly content: string;
  /** Category: "fact", "decision", "action_item", "preference" */
  readonly category: string;
  /** Confidence score (0.0 - 1.0) */
  readonly confidence: number;
  /** Which turns contributed to this extraction */
  readonly sourceContext?: string;
}

// ---------------------------------------------------------------------------
// Turn summary for extraction input
// ---------------------------------------------------------------------------

export interface TurnSummary {
  /** Sequential turn number (1-based) */
  readonly turnNumber: number;
  /** Turn input (user message) */
  readonly input: string;
  /** Turn output (agent response) */
  readonly output: string;
}

// ---------------------------------------------------------------------------
// Extraction context
// ---------------------------------------------------------------------------

export interface ExtractionContext {
  readonly sessionId: string;
  readonly agentId?: string;
  readonly userId?: string;
}

// ---------------------------------------------------------------------------
// Memory extractor interface (Decision 8 — injectable)
// ---------------------------------------------------------------------------

/**
 * Extracts structured memories from conversation turns.
 *
 * Default: DefaultMemoryExtractor (returns input as-is for testing).
 * Users inject custom extractors (LLM-based, rule-based, hybrid).
 */
export interface MemoryExtractor {
  extract(
    turns: readonly TurnSummary[],
    context: ExtractionContext,
  ): Promise<readonly ExtractedMemory[]>;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type DistillationTrigger = "session_end" | "context_compact";

export interface DistillationConfig {
  /** NexusClient for storing extracted memories */
  readonly nexusClient: NexusClient;
  /** When to trigger extraction (default: ["session_end"]) */
  readonly triggers?: readonly DistillationTrigger[];
  /** Injectable memory extractor (Decision 8) */
  readonly extractor?: MemoryExtractor;
  /** Max turns to include in extraction window (Decision 16, default: 50) */
  readonly maxTurns?: number;
  /** Timeout for extraction (ms, default: 30000) */
  readonly extractionTimeoutMs?: number;
  /** Minimum confidence threshold to store (default: 0.3) */
  readonly minConfidence?: number;
  /** Memory scope for storage (default: "agent") */
  readonly scope?: string;
}

export interface ResolvedDistillationConfig {
  readonly nexusClient: NexusClient;
  readonly triggers: readonly DistillationTrigger[];
  readonly extractor: MemoryExtractor;
  readonly maxTurns: number;
  readonly extractionTimeoutMs: number;
  readonly minConfidence: number;
  readonly scope: string;
}
