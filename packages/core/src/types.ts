// Re-export types from DeepAgents (will be added when dependency is available)
// For now, define placeholder types that match the expected API

import type { NexusClient as _NexusClient } from "@nexus/sdk";

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
}

/**
 * Channel capabilities
 */
export interface ChannelCapabilities {
  text: boolean;
  richText: boolean;
  images: boolean;
  files: boolean;
  buttons: boolean;
  threads: boolean;
  reactions: boolean;
  typingIndicator: boolean;
  readReceipts: boolean;
  voiceMessages: boolean;
  groups: boolean;
  maxMessageLength: number;
}

/**
 * Message types
 */
export interface OutboundMessage {
  content: string;
  channelId: string;
  metadata?: Record<string, unknown>;
}

export type MessageHandler = (message: unknown) => void | Promise<void>;

/**
 * Channel adapter interface — implemented by @templar/channel-*
 */
export interface ChannelAdapter {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: OutboundMessage): Promise<void>;
  onMessage(handler: MessageHandler): void;
}

/**
 * Session context — passed to middleware on session start/end
 */
export interface SessionContext {
  /** Unique session identifier */
  sessionId: string;
  /** Agent identifier */
  agentId?: string;
  /** User identifier */
  userId?: string;
  /** Memory scope override */
  scope?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Turn context — passed to middleware before/after each turn
 */
export interface TurnContext {
  /** Session this turn belongs to */
  sessionId: string;
  /** Sequential turn number (1-based) */
  turnNumber: number;
  /** Turn input (user message, tool result, etc.) */
  input?: unknown;
  /** Turn output (agent response, tool call, etc.) */
  output?: unknown;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Middleware interface — lifecycle hooks for DeepAgents integration
 *
 * All hooks are optional. Implement only the hooks your middleware needs.
 */
export interface TemplarMiddleware {
  /** Unique middleware name */
  readonly name: string;

  /** Called when a session starts, before any turns */
  onSessionStart?(context: SessionContext): Promise<void>;

  /** Called before each turn is processed */
  onBeforeTurn?(context: TurnContext): Promise<void>;

  /** Called after each turn is processed */
  onAfterTurn?(context: TurnContext): Promise<void>;

  /** Called when a session ends, after all turns */
  onSessionEnd?(context: SessionContext): Promise<void>;
}
