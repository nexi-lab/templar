/**
 * WebSocket Error Envelope
 *
 * Standard wire format for WebSocket error messages
 */

import { z } from "zod";
import { ProblemDetailsSchema, type ProblemDetails } from "./rfc9457.js";

/**
 * WebSocket error message envelope
 */
export interface WebSocketErrorMessage {
  /**
   * Message type discriminator
   */
  type: "error";

  /**
   * Request ID to correlate with the originating request
   */
  requestId?: string;

  /**
   * Error details in RFC 9457 format
   */
  error: ProblemDetails;

  /**
   * Timestamp when the error occurred (ISO 8601)
   */
  timestamp: string;
}

/**
 * WebSocket success message envelope (for contrast)
 */
export interface WebSocketSuccessMessage<T = unknown> {
  /**
   * Message type discriminator
   */
  type: "success";

  /**
   * Request ID to correlate with the originating request
   */
  requestId?: string;

  /**
   * Response data
   */
  data: T;

  /**
   * Timestamp when the response was generated (ISO 8601)
   */
  timestamp: string;
}

/**
 * Union type for all WebSocket messages
 */
export type WebSocketMessage<T = unknown> = WebSocketErrorMessage | WebSocketSuccessMessage<T>;

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

/**
 * Zod schema for WebSocket error message
 */
export const WebSocketErrorMessageSchema = z.object({
  type: z.literal("error"),
  requestId: z.string().optional(),
  error: ProblemDetailsSchema,
  timestamp: z.string().datetime(),
});

/**
 * Zod schema for WebSocket success message
 */
export const WebSocketSuccessMessageSchema = z.object({
  type: z.literal("success"),
  requestId: z.string().optional(),
  data: z.unknown(),
  timestamp: z.string().datetime(),
});

/**
 * Zod schema for discriminated union of WebSocket messages
 */
export const WebSocketMessageSchema = z.discriminatedUnion("type", [
  WebSocketErrorMessageSchema,
  WebSocketSuccessMessageSchema,
]);

/**
 * Type inferred from Zod schema
 */
export type WebSocketErrorMessageValidated = z.infer<typeof WebSocketErrorMessageSchema>;
export type WebSocketSuccessMessageValidated = z.infer<typeof WebSocketSuccessMessageSchema>;
export type WebSocketMessageValidated = z.infer<typeof WebSocketMessageSchema>;
