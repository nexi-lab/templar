/**
 * Edge sync state machine constants and transition rules.
 */

import type { EdgeSyncConfig, SyncState } from "@templar/core";

// ---------------------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------------------

/**
 * Allowed state transitions for the edge sync state machine.
 *
 * Each key maps to the set of states it may transition to.
 */
export const VALID_TRANSITIONS: Readonly<Record<SyncState, readonly SyncState[]>> = {
  DISCONNECTED: ["RECONNECTING"],
  RECONNECTING: ["AUTH_REFRESH", "DISCONNECTED"],
  AUTH_REFRESH: ["CONFLICT_SCAN", "DISCONNECTED"],
  CONFLICT_SCAN: ["WAL_REPLAY", "DISCONNECTED"],
  WAL_REPLAY: ["ONLINE", "DISCONNECTED"],
  ONLINE: ["DISCONNECTED"],
};

/** Check whether a transition from → to is valid. */
export function isValidTransition(from: SyncState, to: SyncState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

/** Default edge sync configuration values. */
export const DEFAULT_EDGE_SYNC_CONFIG: Required<EdgeSyncConfig> = {
  maxReconnectAttempts: 10,
  reconnectBaseDelayMs: 1_000,
  reconnectMaxDelayMs: 30_000,
  authRefreshTimeoutMs: 10_000,
  conflictScanTimeoutMs: 15_000,
  walReplayTimeoutMs: 30_000,
};
