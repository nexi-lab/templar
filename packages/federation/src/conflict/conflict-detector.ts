/**
 * Conflict detection for distributed operations.
 *
 * Pure function — compares two operations' vector clocks and timestamps
 * to determine whether there is a conflict and, if so, which side wins.
 */

import type { ConflictOutcome } from "@templar/core";
import { VectorClock, type VectorClockJSON } from "../vector-clock/index.js";

// ---------------------------------------------------------------------------
// Types (local to federation — Decision #8)
// ---------------------------------------------------------------------------

/** State of a single operation for conflict comparison. */
export interface OperationState {
  /** Vector clock as JSON record. */
  readonly clock: VectorClockJSON;
  /** UNIX epoch ms timestamp of the operation. */
  readonly timestamp: number;
  /** Human-readable label for logging (e.g. "edge", "cloud"). */
  readonly origin: string;
}

/** Result of conflict detection. */
export interface ConflictResult {
  readonly outcome: ConflictOutcome;
  readonly winner: string | null;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// detectConflict
// ---------------------------------------------------------------------------

/**
 * Detect conflicts between a local and remote operation.
 *
 * Algorithm:
 * 1. Compare vector clocks for causal ordering.
 * 2. BEFORE / AFTER → no conflict, ordered side wins.
 * 3. EQUAL → no conflict (same state).
 * 4. CONCURRENT → use LWW (last-writer-wins) by timestamp.
 *    - Different timestamps → later timestamp wins.
 *    - Same timestamp → TRUE_CONFLICT (cannot resolve automatically).
 */
export function detectConflict(local: OperationState, remote: OperationState): ConflictResult {
  const localClock = VectorClock.fromJSON(local.clock);
  const remoteClock = VectorClock.fromJSON(remote.clock);
  const order = localClock.compare(remoteClock);

  switch (order) {
    case "BEFORE":
      return {
        outcome: "NO_CONFLICT",
        winner: remote.origin,
        reason: `Local (${local.origin}) causally before remote (${remote.origin})`,
      };

    case "AFTER":
      return {
        outcome: "NO_CONFLICT",
        winner: local.origin,
        reason: `Local (${local.origin}) causally after remote (${remote.origin})`,
      };

    case "EQUAL":
      return {
        outcome: "NO_CONFLICT",
        winner: null,
        reason: "Clocks are equal — no divergence",
      };

    case "CONCURRENT": {
      if (local.timestamp > remote.timestamp) {
        return {
          outcome: "EDGE_WINS",
          winner: local.origin,
          reason: `Concurrent: ${local.origin} has later timestamp (${local.timestamp} > ${remote.timestamp})`,
        };
      }
      if (remote.timestamp > local.timestamp) {
        return {
          outcome: "CLOUD_WINS",
          winner: remote.origin,
          reason: `Concurrent: ${remote.origin} has later timestamp (${remote.timestamp} > ${local.timestamp})`,
        };
      }
      return {
        outcome: "TRUE_CONFLICT",
        winner: null,
        reason: `Concurrent with identical timestamps (${local.timestamp}) — cannot resolve automatically`,
      };
    }
  }
}
