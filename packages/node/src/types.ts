import type { Lane, LaneMessage, NodeCapabilities, SessionState } from "@templar/gateway-protocol";
import { NodeCapabilitiesSchema } from "@templar/gateway-protocol";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Node State
// ---------------------------------------------------------------------------

export const NODE_STATES = ["disconnected", "connecting", "connected", "reconnecting"] as const;
export type NodeState = (typeof NODE_STATES)[number];

// ---------------------------------------------------------------------------
// Token Provider
// ---------------------------------------------------------------------------

/**
 * Authentication token: static string or factory function for refresh.
 * Factory is called fresh on each connection/reconnection attempt.
 */
export type TokenProvider = string | (() => string | Promise<string>);

// ---------------------------------------------------------------------------
// Reconnect Config
// ---------------------------------------------------------------------------

export interface ReconnectConfig {
  readonly maxRetries: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
}

export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxRetries: 10,
  baseDelay: 1_000,
  maxDelay: 30_000,
} as const;

export const ReconnectConfigSchema = z
  .object({
    maxRetries: z.number().int().nonnegative().default(DEFAULT_RECONNECT_CONFIG.maxRetries),
    baseDelay: z.number().int().positive().default(DEFAULT_RECONNECT_CONFIG.baseDelay),
    maxDelay: z.number().int().positive().default(DEFAULT_RECONNECT_CONFIG.maxDelay),
  })
  .default({});

// ---------------------------------------------------------------------------
// Node Config
// ---------------------------------------------------------------------------

export interface NodeConfig {
  readonly nodeId: string;
  readonly gatewayUrl: string;
  readonly token: TokenProvider;
  readonly capabilities: NodeCapabilities;
  readonly reconnect?: ReconnectConfig;
}

export const NodeConfigSchema = z.object({
  nodeId: z.string().min(1),
  gatewayUrl: z.string().url(),
  token: z.union([z.string().min(1), z.function()]),
  capabilities: NodeCapabilitiesSchema,
  reconnect: ReconnectConfigSchema,
});

// ---------------------------------------------------------------------------
// Resolved Config
// ---------------------------------------------------------------------------

/**
 * Config after Zod parsing — all defaults applied, all fields present.
 */
export interface ResolvedNodeConfig {
  readonly nodeId: string;
  readonly gatewayUrl: string;
  readonly token: TokenProvider;
  readonly capabilities: NodeCapabilities;
  readonly reconnect: ReconnectConfig;
}

/**
 * Parse and resolve a NodeConfig, applying all defaults.
 * Throws ZodError if config is invalid.
 */
export function resolveNodeConfig(config: NodeConfig): ResolvedNodeConfig {
  return NodeConfigSchema.parse(config) as ResolvedNodeConfig;
}

// ---------------------------------------------------------------------------
// Event Handler Types
// ---------------------------------------------------------------------------

export type ConnectedHandler = (sessionId: string) => void;
export type DisconnectedHandler = (code: number, reason: string) => void;
export type ReconnectingHandler = (attempt: number, delay: number) => void;
export type ReconnectedHandler = (sessionId: string) => void;
export type MessageHandler = (lane: Lane, message: LaneMessage) => void | Promise<void>;
export type SessionUpdateHandler = (state: SessionState) => void;
export type ConfigChangedHandler = (fields: readonly string[]) => void;
export type ErrorHandler = (error: Error, context?: string) => void;
