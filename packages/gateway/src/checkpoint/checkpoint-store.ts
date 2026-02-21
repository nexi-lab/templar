import type { GatewayCheckpoint } from "./types.js";

// ---------------------------------------------------------------------------
// Abstract interface (Decision 1A — DelegationStore pattern)
// ---------------------------------------------------------------------------

/**
 * Persistence backend for gateway checkpoints.
 *
 * Implementations control where snapshots are stored (memory, disk, remote).
 * All methods are async to support any backend.
 */
export interface CheckpointStore {
  save(checkpoint: GatewayCheckpoint): Promise<void>;
  load(): Promise<GatewayCheckpoint | undefined>;
}
