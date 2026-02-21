/**
 * @templar/federation — Multi-zone coordination + edge sync (#202)
 *
 * Provides zone management, edge sync state machine, vector clocks,
 * and conflict detection for distributed AI agent coordination.
 */

// ---------------------------------------------------------------------------
// Zone management
// ---------------------------------------------------------------------------

export {
  type CreateZoneOptions,
  type JoinZoneOptions,
  type ListZonesOptions,
  type ListZonesResult,
  type ShareZoneOptions,
  validateZoneId,
  ZoneClient,
} from "./zone/index.js";

// ---------------------------------------------------------------------------
// Edge sync state machine
// ---------------------------------------------------------------------------

export {
  DEFAULT_EDGE_SYNC_CONFIG,
  type EdgeSyncEvents,
  EdgeSyncManager,
  type EdgeSyncManagerOptions,
  isValidTransition,
  resolveEdgeSyncConfig,
  type SyncPhaseHandlers,
  VALID_TRANSITIONS,
} from "./sync/index.js";

// ---------------------------------------------------------------------------
// Vector clocks
// ---------------------------------------------------------------------------

export { VectorClock, type VectorClockJSON } from "./vector-clock/index.js";

// ---------------------------------------------------------------------------
// Conflict detection
// ---------------------------------------------------------------------------

export {
  type ConflictResult,
  detectConflict,
  type OperationState,
} from "./conflict/index.js";

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

export { defaultSyncClock, type SyncClock } from "./clock.js";
