import { z } from "zod";
import { LaneMessageSchema } from "./protocol/lanes.js";

// ---------------------------------------------------------------------------
// Pending message schema
// ---------------------------------------------------------------------------

const PendingMessageSchema = z.object({
  messageId: z.string().min(1),
  nodeId: z.string().min(1),
  sentAt: z.number().int().positive(),
  message: LaneMessageSchema,
});

// ---------------------------------------------------------------------------
// Snapshot type
// ---------------------------------------------------------------------------

export interface DeliveryTrackerSnapshot {
  readonly version: 1;
  readonly pending: Readonly<
    Record<string, readonly import("./delivery-tracker.js").PendingMessage[]>
  >;
  readonly capturedAt: number;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const DeliveryTrackerSnapshotSchema = z.object({
  version: z.literal(1),
  pending: z.record(z.string(), z.array(PendingMessageSchema)),
  capturedAt: z.number().int().positive(),
});
