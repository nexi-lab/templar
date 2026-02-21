/**
 * Secrets Audit resource for querying the credential access audit trail
 *
 * Issue #216: Read-only SDK for the immutable secrets audit log.
 * Wraps Nexus API: GET /api/v2/secrets-audit/*
 *
 * All events are zone-scoped (enforced server-side via auth).
 * Records are immutable (append-only) with SHA-256 tamper detection.
 */

import type {
  ExportSecretsAuditParams,
  ListSecretsAuditParams,
  SecretsAuditEvent,
  SecretsAuditEventListResponse,
  SecretsAuditExportResponse,
  SecretsAuditIntegrityResponse,
} from "../types/secrets-audit.js";
import { BaseResource } from "./base.js";

const BASE_PATH = "/api/v2/secrets-audit";

/**
 * Resource for querying the Nexus secrets audit trail
 *
 * Provides read-only access to the immutable credential/token
 * lifecycle audit log. Audit events are written server-side by
 * the Nexus auth system — no write methods are exposed.
 *
 * @example
 * ```typescript
 * // List recent credential events
 * const events = await client.secretsAudit.list({
 *   event_type: "key_accessed",
 *   limit: 50,
 * });
 *
 * // Verify a record hasn't been tampered with
 * const integrity = await client.secretsAudit.verifyIntegrity("rec-123");
 * console.log(integrity.is_valid); // true
 * ```
 */
export class SecretsAuditResource extends BaseResource {
  /**
   * List secrets audit events with cursor-based pagination.
   *
   * Supports filtering by event type, actor, provider, credential,
   * token family, and time range. Results are ordered by created_at DESC.
   *
   * @param params - Optional filter and pagination parameters
   * @returns Paginated list of audit events
   *
   * @example
   * ```typescript
   * // List all events for a specific credential
   * const result = await client.secretsAudit.list({
   *   credential_id: "cred-abc",
   *   limit: 20,
   * });
   *
   * // Paginate through results
   * const page2 = await client.secretsAudit.list({
   *   cursor: result.next_cursor,
   * });
   * ```
   */
  async list(params?: ListSecretsAuditParams): Promise<SecretsAuditEventListResponse> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params?.since !== undefined) query.since = params.since;
    if (params?.until !== undefined) query.until = params.until;
    if (params?.event_type !== undefined) query.event_type = params.event_type;
    if (params?.actor_id !== undefined) query.actor_id = params.actor_id;
    if (params?.provider !== undefined) query.provider = params.provider;
    if (params?.credential_id !== undefined) query.credential_id = params.credential_id;
    if (params?.token_family_id !== undefined) query.token_family_id = params.token_family_id;
    if (params?.limit !== undefined) query.limit = params.limit;
    if (params?.cursor !== undefined) query.cursor = params.cursor;
    if (params?.include_total !== undefined) query.include_total = params.include_total;

    const hasQuery = Object.keys(query).length > 0;
    return this.http.request<SecretsAuditEventListResponse>(`${BASE_PATH}/events`, {
      method: "GET",
      ...(hasQuery ? { query } : {}),
    });
  }

  /**
   * Get a single secrets audit event by ID.
   *
   * Returns 404 if the record doesn't exist or belongs to a different zone.
   *
   * @param recordId - The audit event UUID
   * @returns The full audit event record
   *
   * @example
   * ```typescript
   * const event = await client.secretsAudit.get("550e8400-e29b-41d4-a716-446655440000");
   * console.log(event.event_type); // "credential_created"
   * ```
   */
  async get(recordId: string): Promise<SecretsAuditEvent> {
    return this.http.request<SecretsAuditEvent>(
      `${BASE_PATH}/events/${encodeURIComponent(recordId)}`,
      { method: "GET" },
    );
  }

  /**
   * Export secrets audit events as JSON.
   *
   * Returns all matching events up to the specified limit (max 100,000).
   * For large exports, consider using filters to narrow the result set.
   *
   * @param params - Optional filter parameters and row limit
   * @returns All matching events in a single response
   *
   * @example
   * ```typescript
   * // Export last month's events
   * const exported = await client.secretsAudit.export({
   *   since: "2026-01-01T00:00:00Z",
   *   until: "2026-02-01T00:00:00Z",
   *   limit: 50000,
   * });
   * console.log(`Exported ${exported.events.length} events`);
   * ```
   */
  async export(params?: ExportSecretsAuditParams): Promise<SecretsAuditExportResponse> {
    const query: Record<string, string | number | boolean | undefined> = {
      format: "json",
    };
    if (params?.since !== undefined) query.since = params.since;
    if (params?.until !== undefined) query.until = params.until;
    if (params?.event_type !== undefined) query.event_type = params.event_type;
    if (params?.actor_id !== undefined) query.actor_id = params.actor_id;
    if (params?.provider !== undefined) query.provider = params.provider;
    if (params?.limit !== undefined) query.limit = params.limit;

    return this.http.request<SecretsAuditExportResponse>(`${BASE_PATH}/events/export`, {
      method: "GET",
      query,
    });
  }

  /**
   * Verify a record's integrity (tamper detection).
   *
   * Recomputes the SHA-256 hash from the record's fields and compares
   * it to the stored hash. Returns `is_valid: true` if the record
   * has not been tampered with.
   *
   * @param recordId - The audit event UUID to verify
   * @returns Integrity verification result
   *
   * @example
   * ```typescript
   * const result = await client.secretsAudit.verifyIntegrity("rec-123");
   * if (!result.is_valid) {
   *   console.error("ALERT: Audit record has been tampered with!");
   * }
   * ```
   */
  async verifyIntegrity(recordId: string): Promise<SecretsAuditIntegrityResponse> {
    return this.http.request<SecretsAuditIntegrityResponse>(
      `${BASE_PATH}/integrity/${encodeURIComponent(recordId)}`,
      { method: "GET" },
    );
  }
}
