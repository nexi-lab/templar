/**
 * Pay API types — NexusPay budget tracking and cost management
 *
 * Supports TigerBeetle two-phase credit transfers and balance tracking.
 */

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

/**
 * Transfer phase for two-phase commit protocol.
 *
 * - "reserve": Hold credits before an LLM call
 * - "commit": Finalize the transfer with actual cost
 * - "release": Cancel the reservation (on failure)
 */
export type TransferPhase = "reserve" | "commit" | "release";

/**
 * Transfer status returned from the API.
 */
export type TransferStatus = "reserved" | "committed" | "released";

// ============================================================================
// CORE ENTITY
// ============================================================================

/**
 * Token usage metadata extracted from LLM responses.
 *
 * This is a convention type — the LLM framework populates
 * `TurnContext.metadata.usage` with this shape.
 */
export interface TokenUsage {
  /** Model identifier (e.g., "gpt-4o", "claude-sonnet-4-20250514") */
  model: string;

  /** Number of input/prompt tokens */
  inputTokens: number;

  /** Number of output/completion tokens */
  outputTokens: number;

  /** Total tokens (input + output) */
  totalTokens: number;

  /** Provider-reported total cost (if available) */
  totalCost?: number;

  /** Cached prompt tokens read (e.g., Anthropic prompt caching) */
  cacheReadTokens?: number;

  /** Tokens used to create cache entries */
  cacheCreationTokens?: number;
}

// ============================================================================
// REQUEST PARAMS
// ============================================================================

/**
 * Parameters for credit transfer (two-phase commit).
 */
export interface TransferParams {
  /** Credits to transfer (integer) */
  amount: number;

  /** Two-phase commit phase */
  phase: TransferPhase;

  /** Transfer ID — required for commit/release, returned by reserve */
  transfer_id?: string;

  /** Human-readable description of the transfer */
  description?: string;

  /** Arbitrary metadata for cost attribution */
  metadata?: Record<string, unknown>;
}

/**
 * Parameters for direct debit (single-phase).
 */
export interface DebitParams {
  /** Credits to debit (integer) */
  amount: number;

  /** Model that generated the cost (for attribution) */
  model?: string;

  /** Session ID for cost attribution */
  session_id?: string;

  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Agent wallet balance response.
 */
export interface BalanceResponse {
  /** Current credit balance (integer credits) */
  balance: number;

  /** Currency identifier (e.g., "credits") */
  currency: string;

  /** Last updated timestamp (ISO 8601) */
  updated_at: string;
}

/**
 * Credit transfer response.
 */
export interface TransferResponse {
  /** Unique transfer identifier */
  transfer_id: string;

  /** Phase that was executed */
  phase: TransferPhase;

  /** Amount transferred */
  amount: number;

  /** Balance after transfer */
  balance: number;

  /** Transfer status */
  status: TransferStatus;
}

/**
 * Direct debit response.
 */
export interface DebitResponse {
  /** Unique debit identifier */
  debit_id: string;

  /** Amount debited */
  amount: number;

  /** Balance after debit */
  balance: number;
}
