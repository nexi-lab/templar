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

// ---------------------------------------------------------------------------
// Priority (source of truth for queued lane ordering)
// ---------------------------------------------------------------------------

/**
 * Priority ordering for queued lanes (lower = higher priority).
 * This is the **single source of truth** — `QUEUED_LANES` is derived from it.
 */
export const LANE_PRIORITY = {
  steer: 0,
  collect: 1,
  followup: 2,
} as const;

/** Lanes that participate in the priority queue (interrupt bypasses). */
export type QueuedLane = keyof typeof LANE_PRIORITY;

/**
 * Queued lane names sorted by priority (ascending — highest priority first).
 * Derived from `LANE_PRIORITY` to avoid DRY violation.
 */
export const QUEUED_LANES: readonly QueuedLane[] = (
  Object.keys(LANE_PRIORITY) as QueuedLane[]
).sort((a, b) => LANE_PRIORITY[a] - LANE_PRIORITY[b]);

export const QueuedLaneSchema = z.enum(Object.keys(LANE_PRIORITY) as [QueuedLane, ...QueuedLane[]]);

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
