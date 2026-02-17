import { z } from "zod";
import { type AgentBinding, AgentBindingSchema } from "./bindings.js";
import { type ConversationScope, ConversationScopeSchema } from "./conversations.js";

// ---------------------------------------------------------------------------
// Node Capabilities
// ---------------------------------------------------------------------------

/**
 * Capabilities advertised by a node during registration.
 */
export interface NodeCapabilities {
  /** Agent types this node can execute */
  readonly agentTypes: readonly string[];
  /** Logical agent IDs this node serves (for multi-agent routing) */
  readonly agentIds?: readonly string[];
  /** Tool namespaces available on this node */
  readonly tools: readonly string[];
  /** Maximum concurrent sessions */
  readonly maxConcurrency: number;
  /** Supported channel types */
  readonly channels: readonly string[];
}

export const NodeCapabilitiesSchema = z.object({
  agentTypes: z.array(z.string().min(1)).min(1),
  agentIds: z.array(z.string().min(1)).optional(),
  tools: z.array(z.string()),
  maxConcurrency: z.number().int().positive(),
  channels: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Task Requirements (for node selection)
// ---------------------------------------------------------------------------

/**
 * Requirements for selecting a node to handle a task.
 */
export interface TaskRequirements {
  readonly agentType: string;
  readonly tools?: readonly string[];
  readonly channel?: string;
}

export const TaskRequirementsSchema = z.object({
  agentType: z.string().min(1),
  tools: z.array(z.string()).optional(),
  channel: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Gateway Configuration
// ---------------------------------------------------------------------------

/** Fields that can be hot-reloaded without restart */
export const HOT_RELOADABLE_FIELDS = [
  "sessionTimeout",
  "suspendTimeout",
  "healthCheckInterval",
  "laneCapacity",
  "maxFramesPerSecond",
  "defaultConversationScope",
  "maxConversations",
  "conversationTtl",
  "bindings",
] as const;
export type HotReloadableField = (typeof HOT_RELOADABLE_FIELDS)[number];

/** Fields that require gateway restart to take effect */
export const RESTART_REQUIRED_FIELDS = [
  "port",
  "nexusUrl",
  "nexusApiKey",
  "maxConnections",
  "authMode",
] as const;
export type RestartRequiredField = (typeof RESTART_REQUIRED_FIELDS)[number];

/**
 * Authentication mode for node connections.
 * - "legacy": Bearer token only (backward compatible)
 * - "ed25519": Ed25519 JWT only (no legacy tokens accepted)
 * - "dual": Both methods accepted (migration mode)
 */
export type AuthMode = "legacy" | "ed25519" | "dual";

export const AuthModeSchema = z.enum(["legacy", "ed25519", "dual"]);

/**
 * Device authentication configuration for Ed25519 key-based node auth.
 */
export interface DeviceAuthConfig {
  /** Allow Trust-On-First-Use key registration (default: false) */
  readonly allowTofu: boolean;
  /** Maximum number of device keys stored (default: 10_000) */
  readonly maxDeviceKeys: number;
  /** JWT maximum age/lifetime (default: "5m") */
  readonly jwtMaxAge: string;
  /** Pre-registered device keys */
  readonly knownKeys?: readonly { readonly nodeId: string; readonly publicKey: string }[];
}

export const DeviceAuthConfigSchema = z.object({
  allowTofu: z.boolean().default(false),
  maxDeviceKeys: z.number().int().positive().default(10_000),
  jwtMaxAge: z.string().min(1).default("5m"),
  knownKeys: z
    .array(
      z.object({
        nodeId: z.string().min(1),
        publicKey: z.string().min(1),
      }),
    )
    .optional(),
});

/**
 * Gateway configuration.
 */
export interface GatewayConfig {
  /** WebSocket server port (default: 18789) */
  readonly port: number;
  /** Nexus API base URL */
  readonly nexusUrl: string;
  /** Nexus API key */
  readonly nexusApiKey: string;
  /** Idle timeout in ms before CONNECTED → IDLE (default: 60_000) */
  readonly sessionTimeout: number;
  /** Suspend timeout in ms before IDLE → SUSPENDED (default: 300_000) */
  readonly suspendTimeout: number;
  /** Health check interval in ms (default: 30_000) */
  readonly healthCheckInterval: number;
  /** Max items per lane queue per node (default: 256) */
  readonly laneCapacity: number;
  /** Max concurrent WebSocket connections (default: 1024) */
  readonly maxConnections: number;
  /** Max frames per second per connection before rate limiting (default: 100) */
  readonly maxFramesPerSecond: number;
  /** Default conversation scoping mode for DM isolation (default: 'per-channel-peer') */
  readonly defaultConversationScope: ConversationScope;
  /** Maximum number of tracked conversations before eviction (default: 100_000) */
  readonly maxConversations: number;
  /** Conversation TTL in ms — inactive conversations are swept (default: 86_400_000 = 24h) */
  readonly conversationTtl: number;
  /** Declarative agent bindings for multi-agent routing (optional, hot-reloadable) */
  readonly bindings?: readonly AgentBinding[];
  /** Authentication mode (default: "legacy") */
  readonly authMode: AuthMode;
  /** Device authentication config for Ed25519 mode */
  readonly deviceAuth?: DeviceAuthConfig;
}

export const GatewayConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  nexusUrl: z.string().url(),
  nexusApiKey: z.string().min(1),
  sessionTimeout: z.number().int().positive(),
  suspendTimeout: z.number().int().positive(),
  healthCheckInterval: z.number().int().positive(),
  laneCapacity: z.number().int().positive(),
  maxConnections: z.number().int().positive(),
  maxFramesPerSecond: z.number().int().positive(),
  defaultConversationScope: ConversationScopeSchema,
  maxConversations: z.number().int().positive(),
  conversationTtl: z.number().int().positive(),
  bindings: z.array(AgentBindingSchema).optional(),
  authMode: AuthModeSchema,
  deviceAuth: DeviceAuthConfigSchema.optional(),
});

/**
 * Default configuration values.
 */
export const DEFAULT_GATEWAY_CONFIG: Omit<GatewayConfig, "nexusUrl" | "nexusApiKey"> = {
  port: 18789,
  sessionTimeout: 60_000,
  suspendTimeout: 300_000,
  healthCheckInterval: 30_000,
  laneCapacity: 256,
  maxConnections: 1024,
  maxFramesPerSecond: 100,
  defaultConversationScope: "per-channel-peer",
  maxConversations: 100_000,
  conversationTtl: 86_400_000,
  authMode: "legacy",
} as const;
