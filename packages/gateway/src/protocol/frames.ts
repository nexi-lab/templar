import type { ProblemDetails } from "@templar/errors";
import { ProblemDetailsSchema } from "@templar/errors";
import { z } from "zod";
import { type Lane, type LaneMessage, LaneMessageSchema, LaneSchema } from "./lanes.js";
import { type SessionState, SessionStateSchema } from "./sessions.js";
import { type NodeCapabilities, NodeCapabilitiesSchema } from "./types.js";

// ---------------------------------------------------------------------------
// Frame Kinds
// ---------------------------------------------------------------------------

export const FRAME_KINDS = [
  "node.register",
  "node.register.ack",
  "node.deregister",
  "heartbeat.ping",
  "heartbeat.pong",
  "lane.message",
  "lane.message.ack",
  "session.update",
  "config.changed",
  "error",
] as const;
export type FrameKind = (typeof FRAME_KINDS)[number];

// ---------------------------------------------------------------------------
// Individual Frame Types
// ---------------------------------------------------------------------------

/** Sent by node to register with the gateway */
export interface NodeRegisterFrame {
  readonly kind: "node.register";
  readonly nodeId: string;
  readonly capabilities: NodeCapabilities;
  /** Legacy bearer token (optional when using Ed25519 auth) */
  readonly token?: string;
  /** Base64url-encoded Ed25519 JWT for device auth */
  readonly signature?: string;
  /** Base64url-encoded Ed25519 public key (for TOFU registration) */
  readonly publicKey?: string;
}

/** Sent by gateway to acknowledge registration */
export interface NodeRegisterAckFrame {
  readonly kind: "node.register.ack";
  readonly nodeId: string;
  readonly sessionId: string;
}

/** Sent by node to deregister from the gateway */
export interface NodeDeregisterFrame {
  readonly kind: "node.deregister";
  readonly nodeId: string;
  readonly reason?: string;
}

/** Sent by gateway to check node liveness */
export interface HeartbeatPingFrame {
  readonly kind: "heartbeat.ping";
  readonly timestamp: number;
}

/** Sent by node in response to ping */
export interface HeartbeatPongFrame {
  readonly kind: "heartbeat.pong";
  readonly timestamp: number;
}

/** Channel message routed through a lane */
export interface LaneMessageFrame {
  readonly kind: "lane.message";
  readonly lane: Lane;
  readonly message: LaneMessage;
}

/** Acknowledgement of lane message receipt */
export interface LaneMessageAckFrame {
  readonly kind: "lane.message.ack";
  readonly messageId: string;
}

/** Session state update notification */
export interface SessionUpdateFrame {
  readonly kind: "session.update";
  readonly sessionId: string;
  readonly nodeId: string;
  readonly state: SessionState;
  readonly timestamp: number;
}

/** Config change notification */
export interface ConfigChangedFrame {
  readonly kind: "config.changed";
  readonly fields: readonly string[];
  readonly timestamp: number;
}

/** Error frame wrapping ProblemDetails */
export interface ErrorFrame {
  readonly kind: "error";
  readonly requestId?: string;
  readonly error: ProblemDetails;
  readonly timestamp: number;
}

// ---------------------------------------------------------------------------
// Discriminated Union
// ---------------------------------------------------------------------------

/**
 * All possible gateway frames, discriminated on `kind`.
 */
export type GatewayFrame =
  | NodeRegisterFrame
  | NodeRegisterAckFrame
  | NodeDeregisterFrame
  | HeartbeatPingFrame
  | HeartbeatPongFrame
  | LaneMessageFrame
  | LaneMessageAckFrame
  | SessionUpdateFrame
  | ConfigChangedFrame
  | ErrorFrame;

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const NodeRegisterFrameSchema = z.object({
  kind: z.literal("node.register"),
  nodeId: z.string().min(1),
  capabilities: NodeCapabilitiesSchema,
  token: z.string().min(1).optional(),
  signature: z.string().min(1).optional(),
  publicKey: z.string().min(1).optional(),
});

export const NodeRegisterAckFrameSchema = z.object({
  kind: z.literal("node.register.ack"),
  nodeId: z.string().min(1),
  sessionId: z.string().min(1),
});

export const NodeDeregisterFrameSchema = z.object({
  kind: z.literal("node.deregister"),
  nodeId: z.string().min(1),
  reason: z.string().optional(),
});

export const HeartbeatPingFrameSchema = z.object({
  kind: z.literal("heartbeat.ping"),
  timestamp: z.number().int().positive(),
});

export const HeartbeatPongFrameSchema = z.object({
  kind: z.literal("heartbeat.pong"),
  timestamp: z.number().int().positive(),
});

export const LaneMessageFrameSchema = z.object({
  kind: z.literal("lane.message"),
  lane: LaneSchema,
  message: LaneMessageSchema,
});

export const LaneMessageAckFrameSchema = z.object({
  kind: z.literal("lane.message.ack"),
  messageId: z.string().min(1),
});

export const SessionUpdateFrameSchema = z.object({
  kind: z.literal("session.update"),
  sessionId: z.string().min(1),
  nodeId: z.string().min(1),
  state: SessionStateSchema,
  timestamp: z.number().int().positive(),
});

export const ConfigChangedFrameSchema = z.object({
  kind: z.literal("config.changed"),
  fields: z.array(z.string().min(1)).min(1),
  timestamp: z.number().int().positive(),
});

export const ErrorFrameSchema = z.object({
  kind: z.literal("error"),
  requestId: z.string().optional(),
  error: ProblemDetailsSchema,
  timestamp: z.number().int().positive(),
});

/**
 * Discriminated union schema for all gateway frames.
 */
export const GatewayFrameSchema = z.discriminatedUnion("kind", [
  NodeRegisterFrameSchema,
  NodeRegisterAckFrameSchema,
  NodeDeregisterFrameSchema,
  HeartbeatPingFrameSchema,
  HeartbeatPongFrameSchema,
  LaneMessageFrameSchema,
  LaneMessageAckFrameSchema,
  SessionUpdateFrameSchema,
  ConfigChangedFrameSchema,
  ErrorFrameSchema,
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw message into a GatewayFrame.
 * Returns the validated frame or throws ZodError.
 */
export function parseFrame(raw: unknown): GatewayFrame {
  return GatewayFrameSchema.parse(raw) as GatewayFrame;
}

/**
 * Safely parse a raw message into a GatewayFrame.
 * Returns a Zod SafeParseResult.
 */
export function safeParseFrame(raw: unknown): z.SafeParseReturnType<unknown, GatewayFrame> {
  return GatewayFrameSchema.safeParse(raw) as z.SafeParseReturnType<unknown, GatewayFrame>;
}
