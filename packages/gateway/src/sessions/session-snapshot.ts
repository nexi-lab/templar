import { z } from "zod";
import { SessionInfoSchema } from "../protocol/sessions.js";

// ---------------------------------------------------------------------------
// Snapshot type
// ---------------------------------------------------------------------------

export interface SessionManagerSnapshot {
  readonly version: 1;
  readonly sessions: readonly import("../protocol/sessions.js").SessionInfo[];
  readonly capturedAt: number;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const SessionManagerSnapshotSchema = z.object({
  version: z.literal(1),
  sessions: z.array(SessionInfoSchema),
  capturedAt: z.number().int().positive(),
});
