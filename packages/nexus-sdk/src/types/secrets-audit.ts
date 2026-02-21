/**
 * Secrets Audit types — mirrors Nexus secrets audit API contract
 *
 * Issue #216: Read-only SDK for the immutable credential access audit trail.
 * Nexus API: GET /api/v2/secrets-audit/*
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Types of auditable secrets/credential events.
 * Mirrors SecretsAuditEventType from Nexus.
 */
export type SecretsAuditEventType =
  | "credential_created"
  | "credential_updated"
  | "credential_revoked"
  | "token_refreshed"
  | "token_rotated"
  | "token_reuse_detected"
  | "family_invalidated"
  | "key_accessed"
  | "key_rotated";

/**
 * Supported export formats for the events export endpoint.
 */
export type SecretsAuditExportFormat = "json" | "csv";

// ============================================================================
// REQUEST PARAMS
// ============================================================================

/**
 * Parameters for listing secrets audit events with cursor-based pagination.
 */
export interface ListSecretsAuditParams {
  /** Filter events after this time (ISO-8601) */
  readonly since?: string;

  /** Filter events before this time (ISO-8601) */
  readonly until?: string;

  /** Filter by event type */
  readonly event_type?: SecretsAuditEventType;

  /** Filter by actor ID (who performed the action) */
  readonly actor_id?: string;

  /** Filter by OAuth provider */
  readonly provider?: string;

  /** Filter by credential ID */
  readonly credential_id?: string;

  /** Filter by token family ID */
  readonly token_family_id?: string;

  /** Page size (1-1000, default: 100) */
  readonly limit?: number;

  /** Cursor from previous response for pagination */
  readonly cursor?: string;

  /** Include total count in response (default: false) */
  readonly include_total?: boolean;
}

/**
 * Parameters for exporting secrets audit events.
 */
export interface ExportSecretsAuditParams {
  /** Filter events after this time (ISO-8601) */
  readonly since?: string;

  /** Filter events before this time (ISO-8601) */
  readonly until?: string;

  /** Filter by event type */
  readonly event_type?: SecretsAuditEventType;

  /** Filter by actor ID */
  readonly actor_id?: string;

  /** Filter by OAuth provider */
  readonly provider?: string;

  /** Max rows to export (1-100000, default: 10000) */
  readonly limit?: number;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * Single secrets audit log entry.
 */
export interface SecretsAuditEvent {
  /** Unique record identifier (UUID) */
  readonly id: string;

  /** SHA-256 hash for tamper detection */
  readonly record_hash: string;

  /** When the event was recorded (ISO-8601) */
  readonly created_at: string;

  /** Type of credential event */
  readonly event_type: string;

  /** Who performed the action */
  readonly actor_id: string;

  /** OAuth provider (e.g., "github", "google") */
  readonly provider: string | null;

  /** Affected credential ID */
  readonly credential_id: string | null;

  /** Token family for rotation tracking */
  readonly token_family_id: string | null;

  /** Zone scope for multi-tenancy */
  readonly zone_id: string;

  /** Source IP address */
  readonly ip_address: string | null;

  /** Additional details (JSON string — never contains secrets) */
  readonly details: string | null;

  /** SHA-256 of the details JSON */
  readonly metadata_hash: string | null;
}

/**
 * Paginated list of secrets audit events.
 */
export interface SecretsAuditEventListResponse {
  /** List of audit events */
  readonly events: readonly SecretsAuditEvent[];

  /** Page size used */
  readonly limit: number;

  /** Whether more results are available */
  readonly has_more: boolean;

  /** Total count (only present if include_total=true) */
  readonly total: number | null;

  /** Cursor for next page (null if no more results) */
  readonly next_cursor: string | null;
}

/**
 * JSON export response containing all matching events.
 */
export interface SecretsAuditExportResponse {
  /** All matching events */
  readonly events: readonly SecretsAuditEvent[];
}

/**
 * Result of integrity verification for a single record.
 */
export interface SecretsAuditIntegrityResponse {
  /** The record ID that was verified */
  readonly record_id: string;

  /** Whether the hash matches (true = not tampered) */
  readonly is_valid: boolean;

  /** The stored hash for reference */
  readonly record_hash: string;
}
