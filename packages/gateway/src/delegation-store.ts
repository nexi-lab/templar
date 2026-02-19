/**
 * Abstract DelegationStore interface (Decision 1A / 16C).
 *
 * No implementation in gateway — consumers inject their own.
 * All methods return Promises for async-compatible backends (e.g. Nexus API).
 */

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

export interface DelegationRecord {
  readonly delegationId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly intent: string;
  readonly status:
    | "pending"
    | "accepted"
    | "completed"
    | "failed"
    | "refused"
    | "timeout"
    | "cancelled";
  readonly createdAt: number;
  readonly updatedAt: number;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface DelegationStore {
  create(record: Omit<DelegationRecord, "updatedAt">): Promise<DelegationRecord>;
  update(delegationId: string, status: DelegationRecord["status"]): Promise<void>;
  getTrustScore?(nodeId: string): Promise<number>;
}
