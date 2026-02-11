/**
 * SSE Encoder Wrapper
 *
 * Wraps @ag-ui/encoder to provide a typed encoding interface
 * for AG-UI events over Server-Sent Events.
 */

import type { AgUiEvent } from "./types.js";

/**
 * Encodes an AG-UI event as an SSE data line.
 *
 * Format: `data: {JSON}\n\n`
 */
export function encodeEvent(event: AgUiEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Encodes an SSE comment (used for heartbeat keep-alive).
 *
 * Format: `:comment\n\n`
 */
export function encodeComment(comment: string): string {
  return `:${comment}\n\n`;
}

/**
 * Standard SSE response headers for AG-UI streaming.
 */
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;
