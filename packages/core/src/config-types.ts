import type { NexusClient as _NexusClient } from "@nexus/sdk";
import type { ExecutionLimitsConfig } from "./execution-types.js";
import type { IdentityConfig } from "./message-types.js";

/**
 * Re-export NexusClient from @nexus/sdk for consumers
 */
export type NexusClient = _NexusClient;

/**
 * Placeholder for DeepAgentConfig from 'deepagents' package
 * Will be replaced with actual import when dependency is added
 */
export interface DeepAgentConfig {
  model?: string;
  middleware?: unknown[];
  [key: string]: unknown;
}

/**
 * Model configuration for agent
 */
export interface ModelConfig {
  provider: string;
  name: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Tool configuration
 */
export interface ToolConfig {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/**
 * Channel configuration
 */
export interface ChannelConfig {
  type: string;
  config: Record<string, unknown>;
}

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  name: string;
  config?: Record<string, unknown>;
}

/**
 * Permission configuration
 */
export interface PermissionConfig {
  allowed: string[];
  denied?: string[];
}

// ---------------------------------------------------------------------------
// Bootstrap File Hierarchy
// ---------------------------------------------------------------------------

/** Bootstrap file kind — determines which files to load per agent type */
export type BootstrapFileKind = "instructions" | "tools" | "context";

/** Per-file size budgets (characters) */
export interface BootstrapBudget {
  readonly instructions: number;
  readonly tools: number;
  readonly context: number;
}

/** Resolved bootstrap file content (output of resolution) */
export interface BootstrapFile {
  readonly kind: BootstrapFileKind;
  readonly content: string;
  readonly filePath: string;
  readonly originalSize: number;
  readonly truncated: boolean;
  readonly contentHash: string;
}

/** Complete resolved bootstrap context */
export interface BootstrapContext {
  readonly files: readonly BootstrapFile[];
  readonly totalSize: number;
  readonly resolvedFrom: string;
}

/** Bootstrap path overrides in agent manifest */
export interface BootstrapPathConfig {
  readonly instructions?: string;
  readonly tools?: string;
  readonly context?: string;
  readonly budget?: Partial<BootstrapBudget>;
}

// ---------------------------------------------------------------------------
// Conversation Scoping
// ---------------------------------------------------------------------------

/**
 * The 4 DM scoping modes for conversation isolation.
 *
 * - main:                     Single conversation per agent (no isolation)
 * - per-peer:                 One conversation per peer across all channels
 * - per-channel-peer:         One conversation per (channel, peer) pair
 * - per-account-channel-peer: One conversation per (account, channel, peer) triple
 */
export const CONVERSATION_SCOPES = [
  "main",
  "per-peer",
  "per-channel-peer",
  "per-account-channel-peer",
] as const;
export type ConversationScope = (typeof CONVERSATION_SCOPES)[number];

/**
 * Agent manifest (parsed from templar.yaml)
 */
export interface AgentManifest {
  name: string;
  version: string;
  description: string;
  model?: ModelConfig;
  tools?: ToolConfig[];
  channels?: ChannelConfig[];
  middleware?: MiddlewareConfig[];
  permissions?: PermissionConfig;
  identity?: IdentityConfig;
  schedule?: string;
  prompt?: string;
  skills?: string[];
  bootstrap?: BootstrapPathConfig;
  /** Conversation isolation mode */
  sessionScoping?: ConversationScope;
}

/**
 * Templar configuration extends DeepAgentConfig
 */
export interface TemplarConfig extends DeepAgentConfig {
  /** Nexus SDK client (optional) */
  nexus?: NexusClient;
  /** Parsed YAML manifest */
  manifest?: AgentManifest;
  /** High Templar (persistent) or Dark Templar (ephemeral) */
  agentType?: "high" | "dark";
  /** Execution safety guards (iteration limits, loop detection) */
  executionLimits?: ExecutionLimitsConfig;
}
