import { z } from "zod";

// ---------------------------------------------------------------------------
// Binding Match
// ---------------------------------------------------------------------------

/**
 * Pattern-based match criteria for routing a message to an agent.
 *
 * Each field supports exact match or simple glob patterns:
 * - `"slack"` — exact match
 * - `"slack-*"` — prefix match
 * - `"*-personal"` — suffix match
 * - `"*"` — matches anything
 * - `undefined` — field not considered (matches anything)
 */
export interface BindingMatch {
  /** Channel ID pattern (exact or glob) */
  readonly channel?: string;
  /** Account ID pattern (exact or glob) */
  readonly accountId?: string;
  /** Peer ID pattern (exact or glob) */
  readonly peerId?: string;
}

export const BindingMatchSchema = z.object({
  channel: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  peerId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Agent Binding
// ---------------------------------------------------------------------------

/**
 * A declarative binding rule that routes matching messages to a logical agent.
 *
 * Bindings are evaluated in order (first match wins).
 * A binding with an empty `match` object acts as a catch-all.
 */
export interface AgentBinding {
  /** Logical agent ID to route to */
  readonly agentId: string;
  /** Match criteria — empty object = catch-all */
  readonly match: BindingMatch;
}

export const AgentBindingSchema = z.object({
  agentId: z.string().min(1),
  match: BindingMatchSchema,
});
