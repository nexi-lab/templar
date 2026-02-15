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
  identity?: IdentityConfig;
  schedule?: string;
  prompt?: string;
  skills?: string[];
  bootstrap?: BootstrapPathConfig;
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

// ---------------------------------------------------------------------------
// Channel Capability Groups
// ---------------------------------------------------------------------------

/**
 * Each capability group has `supported: true` plus type-specific constraints.
 * Capabilities absent from ChannelCapabilities are unsupported.
 */

export interface TextCapability {
  readonly supported: true;
  readonly maxLength: number;
}

export interface RichTextCapability {
  readonly supported: true;
  readonly formats: readonly string[]; // 'markdown', 'html', etc.
}

export interface ImageCapability {
  readonly supported: true;
  readonly maxSize: number; // bytes
  readonly formats: readonly string[]; // 'png', 'jpg', 'gif', 'webp'
}

export interface FileCapability {
  readonly supported: true;
  readonly maxSize: number; // bytes
  readonly allowedTypes?: readonly string[]; // MIME types; undefined = all
}

export interface ButtonCapability {
  readonly supported: true;
  readonly maxButtons: number;
}

export interface ThreadCapability {
  readonly supported: true;
  readonly nested: boolean;
}

export interface ReactionCapability {
  readonly supported: true;
}

export interface TypingIndicatorCapability {
  readonly supported: true;
}

export interface ReadReceiptCapability {
  readonly supported: true;
}

export interface VoiceMessageCapability {
  readonly supported: true;
  readonly maxDuration: number; // seconds
  readonly formats: readonly string[];
}

export interface GroupCapability {
  readonly supported: true;
  readonly maxMembers: number;
}

export interface IdentityCapability {
  readonly supported: true;
  readonly perMessage: boolean; // true = per-send(), false = per-connect()
}

/**
 * Channel capabilities — only present keys are supported.
 * Absent keys mean the channel does not support that capability.
 */
export interface ChannelCapabilities {
  readonly text?: TextCapability;
  readonly richText?: RichTextCapability;
  readonly images?: ImageCapability;
  readonly files?: FileCapability;
  readonly buttons?: ButtonCapability;
  readonly threads?: ThreadCapability;
  readonly reactions?: ReactionCapability;
  readonly typingIndicator?: TypingIndicatorCapability;
  readonly readReceipts?: ReadReceiptCapability;
  readonly voiceMessages?: VoiceMessageCapability;
  readonly groups?: GroupCapability;
  readonly identity?: IdentityCapability;
}

/** All recognized capability keys */
export type CapabilityKey = keyof ChannelCapabilities;

// ---------------------------------------------------------------------------
// Content Blocks (discriminated union)
// ---------------------------------------------------------------------------

export interface TextBlock {
  readonly type: "text";
  readonly content: string;
}

export interface ImageBlock {
  readonly type: "image";
  readonly url: string;
  readonly alt?: string;
  readonly mimeType?: string;
  readonly size?: number; // bytes
}

export interface FileBlock {
  readonly type: "file";
  readonly url: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly size?: number; // bytes
}

export interface Button {
  readonly label: string;
  readonly action: string;
  readonly style?: "primary" | "secondary" | "danger";
}

export interface ButtonBlock {
  readonly type: "button";
  readonly buttons: readonly Button[];
}

export type ContentBlock = TextBlock | ImageBlock | FileBlock | ButtonBlock;

/**
 * Maps content block type discriminant to the capability key that gates it
 */
export const BLOCK_TYPE_TO_CAPABILITY: Readonly<Record<ContentBlock["type"], CapabilityKey>> = {
  text: "text",
  image: "images",
  file: "files",
  button: "buttons",
} as const;

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Outbound message with typed content blocks
 */
export interface OutboundMessage {
  readonly channelId: string;
  readonly blocks: readonly ContentBlock[];
  readonly threadId?: string;
  readonly replyTo?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly identity?: ChannelIdentity;
}

/**
 * Visual identity attached to an outbound message (name, avatar, bio).
 */
export interface ChannelIdentity {
  readonly name?: string;
  readonly avatar?: string; // URL or relative path
  readonly bio?: string;
}

/**
 * Identity config for a single channel — visual fields plus systemPromptPrefix.
 */
export interface ChannelIdentityConfig extends ChannelIdentity {
  readonly systemPromptPrefix?: string;
}

/**
 * Agent-level identity configuration with 2-level cascade:
 * channel override -> default.
 */
export interface IdentityConfig {
  readonly default?: ChannelIdentityConfig;
  readonly channels?: Readonly<Record<string, ChannelIdentityConfig>>;
}

/**
 * Inbound message received from a channel
 */
export interface InboundMessage {
  readonly channelType: string;
  readonly channelId: string;
  readonly senderId: string;
  readonly blocks: readonly ContentBlock[];
  readonly threadId?: string;
  readonly timestamp: number;
  readonly messageId: string;
  readonly raw: unknown; // adapter-specific escape hatch
}

export type MessageHandler = (message: InboundMessage) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Channel Adapter
// ---------------------------------------------------------------------------

/**
 * Channel adapter interface — implemented by @templar/channel-* packages
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
 * Expected module shape of a @templar/channel-* package
 */
export interface ChannelModule {
  readonly default: new (config: Readonly<Record<string, unknown>>) => ChannelAdapter;
}

/**
 * Session context — passed to middleware on session start/end.
 *
 * NOTE: This type represents a conversation-level context (agent + user + scope),
 * NOT the node connection lifecycle (see @templar/gateway-protocol SessionInfo).
 * A type alias `ConversationContext` is provided for clarity in new code.
 * Full rename planned for a follow-up PR.
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

/** @see SessionContext — alias for clarity in conversation-scoping code */
export type ConversationContext = SessionContext;

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
