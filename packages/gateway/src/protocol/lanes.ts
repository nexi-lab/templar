import { z } from "zod";
import { type MessageRoutingContext, MessageRoutingContextSchema } from "./conversations.js";

// ---------------------------------------------------------------------------
// Lane Priority
// ---------------------------------------------------------------------------

/**
 * Message lanes in priority order (lowest number = highest priority).
 *
 * - steer:    Direct agent steering commands (highest)
 * - collect:  Data collection / information gathering
 * - followup: Low-priority follow-up messages
 * - interrupt: Bypasses all queues entirely (not queued)
 */
export const LANES = ["steer", "collect", "followup", "interrupt"] as const;
export type Lane = (typeof LANES)[number];

export const LaneSchema = z.enum(LANES);

/**
 * Lanes that participate in the priority queue (interrupt bypasses).
 */
export const QUEUED_LANES = ["steer", "collect", "followup"] as const;
export type QueuedLane = (typeof QUEUED_LANES)[number];

export const QueuedLaneSchema = z.enum(QUEUED_LANES);

/**
 * Priority ordering for queued lanes (lower = higher priority).
 */
export const LANE_PRIORITY: Readonly<Record<QueuedLane, number>> = {
  steer: 0,
  collect: 1,
  followup: 2,
} as const;

// ---------------------------------------------------------------------------
// Lane Message
// ---------------------------------------------------------------------------

/**
 * A message routed through the lane system.
 */
export interface LaneMessage {
  readonly id: string;
  readonly lane: Lane;
  readonly channelId: string;
  readonly payload: unknown;
  readonly timestamp: number;
  /** Routing context for conversation scoping (populated by channel adapter) */
  readonly routingContext?: MessageRoutingContext;
}

export const LaneMessageSchema = z.object({
  id: z.string().min(1),
  lane: LaneSchema,
  channelId: z.string().min(1),
  payload: z.unknown(),
  timestamp: z.number().int().positive(),
  routingContext: MessageRoutingContextSchema.optional(),
});
