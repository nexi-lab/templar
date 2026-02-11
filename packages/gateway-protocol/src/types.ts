import { z } from "zod";

// ---------------------------------------------------------------------------
// Node Capabilities
// ---------------------------------------------------------------------------

/**
 * Capabilities advertised by a node during registration.
 */
export interface NodeCapabilities {
  /** Agent types this node can execute */
  readonly agentTypes: readonly string[];
  /** Tool namespaces available on this node */
  readonly tools: readonly string[];
  /** Maximum concurrent sessions */
  readonly maxConcurrency: number;
  /** Supported channel types */
  readonly channels: readonly string[];
}

export const NodeCapabilitiesSchema = z.object({
  agentTypes: z.array(z.string().min(1)).min(1),
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
] as const;
export type HotReloadableField = (typeof HOT_RELOADABLE_FIELDS)[number];

/** Fields that require gateway restart to take effect */
export const RESTART_REQUIRED_FIELDS = ["port", "nexusUrl", "nexusApiKey"] as const;
export type RestartRequiredField = (typeof RESTART_REQUIRED_FIELDS)[number];

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
}

export const GatewayConfigSchema = z.object({
  port: z.number().int().min(1).max(65535),
  nexusUrl: z.string().url(),
  nexusApiKey: z.string().min(1),
  sessionTimeout: z.number().int().positive(),
  suspendTimeout: z.number().int().positive(),
  healthCheckInterval: z.number().int().positive(),
  laneCapacity: z.number().int().positive(),
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
} as const;
