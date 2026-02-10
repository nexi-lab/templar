/**
 * Event Log API types — Nexus Event Log for compliance and audit trails
 *
 * The Event Log provides an immutable, append-only log implemented as VFS writes.
 * Used by AuditMiddleware for compliance logging (SOC2, HIPAA).
 *
 * Nexus API endpoint: POST /api/nfs/write
 */

// ============================================================================
// REQUEST PARAMS
// ============================================================================

/**
 * Parameters for writing a single event to the log.
 */
export interface EventLogWriteParams {
  /** VFS path for the event (e.g., "/events/audit/{sessionId}") */
  path: string;

  /** Event payload — serialized to JSON by the SDK */
  data: unknown;

  /** ISO 8601 timestamp (default: server-generated) */
  timestamp?: string;
}

/**
 * Parameters for writing a batch of events to the log.
 */
export interface EventLogBatchWriteParams {
  /** Array of event entries to write atomically */
  entries: readonly EventLogWriteParams[];
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Response from a single event log write.
 */
export interface EventLogWriteResponse {
  /** Unique event identifier assigned by the server */
  event_id: string;

  /** VFS path where the event was written */
  path: string;

  /** Server-assigned timestamp (ISO 8601) */
  timestamp: string;
}

/**
 * Response from a batch event log write.
 */
export interface EventLogBatchWriteResponse {
  /** Number of events successfully written */
  written: number;

  /** Number of events that failed to write */
  failed: number;

  /** Event IDs for successfully written events */
  event_ids: readonly string[];
}
