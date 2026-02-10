/**
 * Event Log resource for immutable audit trail writes
 *
 * Wraps the Nexus Event Log API (POST /api/nfs/write) for
 * compliance logging, debugging, and cost attribution.
 */

import type {
  EventLogBatchWriteParams,
  EventLogBatchWriteResponse,
  EventLogWriteParams,
  EventLogWriteResponse,
} from "../types/eventlog.js";
import { BaseResource } from "./base.js";

/**
 * Resource for writing events to the Nexus Event Log (VFS-backed)
 *
 * Provides typed access to the immutable, append-only event log.
 * Used by AuditMiddleware for compliance logging.
 *
 * @example
 * ```typescript
 * const result = await client.eventLog.write({
 *   path: "/events/audit/session-123",
 *   data: { type: "session_start", userId: "user-1" },
 * });
 * console.log(`Event written: ${result.event_id}`);
 * ```
 */
export class EventLogResource extends BaseResource {
  /**
   * Write a single event to the log.
   *
   * @param params - Event write parameters including path and data
   * @returns The written event's ID, path, and server timestamp
   *
   * @example
   * ```typescript
   * const result = await client.eventLog.write({
   *   path: "/events/audit/session-123",
   *   data: { type: "llm_call", model: "gpt-4o", tokens: 1500 },
   * });
   * ```
   */
  async write(params: EventLogWriteParams): Promise<EventLogWriteResponse> {
    return this.http.request<EventLogWriteResponse>("/api/nfs/write", {
      method: "POST",
      body: {
        path: params.path,
        data: params.data,
        ...(params.timestamp !== undefined ? { timestamp: params.timestamp } : {}),
      },
    });
  }

  /**
   * Write a batch of events to the log.
   *
   * Events are written as a group. Some may fail while others succeed;
   * the response reports counts and IDs for successful writes.
   *
   * @param params - Batch of event entries to write
   * @returns Counts of written/failed events and IDs of successful writes
   *
   * @example
   * ```typescript
   * const result = await client.eventLog.batchWrite({
   *   entries: [
   *     { path: "/events/audit/s-1", data: { type: "llm_call" } },
   *     { path: "/events/audit/s-1", data: { type: "tool_call" } },
   *   ],
   * });
   * console.log(`Written: ${result.written}, Failed: ${result.failed}`);
   * ```
   */
  async batchWrite(params: EventLogBatchWriteParams): Promise<EventLogBatchWriteResponse> {
    return this.http.request<EventLogBatchWriteResponse>("/api/nfs/write/batch", {
      method: "POST",
      body: {
        entries: params.entries.map((entry) => ({
          path: entry.path,
          data: entry.data,
          ...(entry.timestamp !== undefined ? { timestamp: entry.timestamp } : {}),
        })),
      },
    });
  }
}
