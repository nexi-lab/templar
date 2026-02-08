// Re-export types from DeepAgents (will be added when dependency is available)
// For now, define placeholder types that match the expected API

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
 * Placeholder for NexusClient from '@nexus/sdk' package
 */
export interface NexusClient {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
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
 * Middleware interface — extended from DeepAgents
 */
export interface TemplarMiddleware {
	name: string;
	// ... follows DeepAgents middleware contract
	[key: string]: unknown;
}
