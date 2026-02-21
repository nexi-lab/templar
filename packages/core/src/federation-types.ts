/**
 * Federation types — multi-zone coordination + edge sync (#202)
 *
 * Pure type definitions for zone management, edge sync state machine,
 * vector clocks, and conflict detection.
 *
 * Only cross-package types live here (Layer 0). Implementation-detail
 * types stay local to @templar/federation.
 */

// ---------------------------------------------------------------------------
// Zone Management
// ---------------------------------------------------------------------------

/** Zone ID slug format: [a-z0-9][a-z0-9-]{1,61}[a-z0-9] */
export type ZoneId = string;

/** Zone lifecycle phases matching Nexus zone API */
export type ZonePhase = "Active" | "Terminating" | "Terminated";

/** Zone information returned from Nexus zone API */
export interface ZoneInfo {
  readonly zoneId: ZoneId;
  readonly name: string;
  readonly domain: string | null;
  readonly description: string | null;
  readonly phase: ZonePhase;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Edge Sync
// ---------------------------------------------------------------------------

/** Edge sync state machine states matching Nexus EdgeSyncManager */
export type SyncState =
  | "DISCONNECTED"
  | "RECONNECTING"
  | "AUTH_REFRESH"
  | "CONFLICT_SCAN"
  | "WAL_REPLAY"
  | "ONLINE";

/** Edge sync configuration */
export interface EdgeSyncConfig {
  readonly maxReconnectAttempts?: number;
  readonly reconnectBaseDelayMs?: number;
  readonly reconnectMaxDelayMs?: number;
  readonly authRefreshTimeoutMs?: number;
  readonly conflictScanTimeoutMs?: number;
  readonly walReplayTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Causal Ordering
// ---------------------------------------------------------------------------

/** Causal ordering comparison result */
export type CausalOrder = "BEFORE" | "AFTER" | "CONCURRENT" | "EQUAL";

// ---------------------------------------------------------------------------
// Conflict Detection
// ---------------------------------------------------------------------------

/** Outcome of conflict detection between two operations */
export type ConflictOutcome = "NO_CONFLICT" | "EDGE_WINS" | "CLOUD_WINS" | "TRUE_CONFLICT";

// ---------------------------------------------------------------------------
// Federation Configuration (for TemplarConfig integration)
// ---------------------------------------------------------------------------

/** Top-level federation configuration */
export interface FederationConfig {
  readonly zoneId?: ZoneId;
  readonly edgeSync?: EdgeSyncConfig;
  readonly autoReconnect?: boolean;
}
