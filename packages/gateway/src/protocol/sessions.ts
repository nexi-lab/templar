import { z } from "zod";

// ---------------------------------------------------------------------------
// Session States
// ---------------------------------------------------------------------------

/**
 * Session lifecycle states per §11.3.
 *
 * CONNECTED → IDLE → SUSPENDED → DISCONNECTED
 */
export const SESSION_STATES = ["connected", "idle", "suspended", "disconnected"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SessionStateSchema = z.enum(SESSION_STATES);

// ---------------------------------------------------------------------------
// Session Events
// ---------------------------------------------------------------------------

/**
 * Events that can trigger session state transitions.
 */
export const SESSION_EVENTS = [
  "heartbeat",
  "message",
  "idle_timeout",
  "suspend_timeout",
  "disconnect",
  "reconnect",
] as const;
export type SessionEvent = (typeof SESSION_EVENTS)[number];

export const SessionEventSchema = z.enum(SESSION_EVENTS);

// ---------------------------------------------------------------------------
// Transition Table
// ---------------------------------------------------------------------------

/**
 * State machine transition table.
 * `null` means the transition is invalid (no-op with warning).
 */
export const SESSION_TRANSITIONS: Readonly<
  Record<SessionState, Readonly<Record<SessionEvent, SessionState | null>>>
> = {
  connected: {
    heartbeat: "connected",
    message: "connected",
    idle_timeout: "idle",
    suspend_timeout: null,
    disconnect: "disconnected",
    reconnect: null,
  },
  idle: {
    heartbeat: "connected",
    message: "connected",
    idle_timeout: null,
    suspend_timeout: "suspended",
    disconnect: "disconnected",
    reconnect: null,
  },
  suspended: {
    heartbeat: null,
    message: null,
    idle_timeout: null,
    suspend_timeout: null,
    disconnect: "disconnected",
    reconnect: "connected",
  },
  disconnected: {
    heartbeat: null,
    message: null,
    idle_timeout: null,
    suspend_timeout: null,
    disconnect: null,
    reconnect: null,
  },
} as const;

// ---------------------------------------------------------------------------
// Session Metadata
// ---------------------------------------------------------------------------

/**
 * Metadata tracked per session.
 */
export interface SessionInfo {
  readonly nodeId: string;
  readonly state: SessionState;
  readonly connectedAt: number;
  readonly lastActivityAt: number;
  readonly reconnectCount: number;
}

export const SessionInfoSchema = z.object({
  nodeId: z.string().min(1),
  state: SessionStateSchema,
  connectedAt: z.number().int().positive(),
  lastActivityAt: z.number().int().positive(),
  reconnectCount: z.number().int().nonnegative(),
});
