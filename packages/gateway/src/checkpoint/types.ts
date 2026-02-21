import { z } from "zod";
import type { ConversationStoreSnapshot } from "../conversations/conversation-snapshot.js";
import { ConversationStoreSnapshotSchema } from "../conversations/conversation-snapshot.js";
import type { DeliveryTrackerSnapshot } from "../delivery-snapshot.js";
import { DeliveryTrackerSnapshotSchema } from "../delivery-snapshot.js";
import type { SessionManagerSnapshot } from "../sessions/session-snapshot.js";
import { SessionManagerSnapshotSchema } from "../sessions/session-snapshot.js";

// ---------------------------------------------------------------------------
// Unified checkpoint
// ---------------------------------------------------------------------------

export interface GatewayCheckpoint {
  readonly version: 1;
  readonly sessions: SessionManagerSnapshot;
  readonly conversations: ConversationStoreSnapshot;
  readonly deliveries: DeliveryTrackerSnapshot;
  readonly createdAt: number;
  readonly checkpointId: string;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const GatewayCheckpointSchema = z.object({
  version: z.literal(1),
  sessions: SessionManagerSnapshotSchema,
  conversations: ConversationStoreSnapshotSchema,
  deliveries: DeliveryTrackerSnapshotSchema,
  createdAt: z.number().int().positive(),
  checkpointId: z.string().min(1),
});
