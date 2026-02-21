import { z } from "zod";

// ---------------------------------------------------------------------------
// Binding schema (inline — ConversationBinding is a plain interface)
// ---------------------------------------------------------------------------

const ConversationBindingSchema = z.object({
  conversationKey: z.string().min(1),
  nodeId: z.string().min(1),
  createdAt: z.number().int().positive(),
  lastActiveAt: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Snapshot type
// ---------------------------------------------------------------------------

export interface ConversationStoreSnapshot {
  readonly version: 1;
  readonly bindings: readonly import("./conversation-store.js").ConversationBinding[];
  readonly capturedAt: number;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const ConversationStoreSnapshotSchema = z.object({
  version: z.literal(1),
  bindings: z.array(ConversationBindingSchema),
  capturedAt: z.number().int().positive(),
});
