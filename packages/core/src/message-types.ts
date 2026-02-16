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

// ---------------------------------------------------------------------------
// Channel Identity (used by OutboundMessage)
// ---------------------------------------------------------------------------

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
