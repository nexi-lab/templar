import type { MessageHandler, OutboundMessage } from "./message-types.js";

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

export interface RealTimeVoiceCapability {
  readonly supported: true;
  readonly codecs: readonly string[]; // e.g., ["opus"]
  readonly sampleRates: readonly number[]; // e.g., [16000, 48000]
  readonly duplex: boolean; // true = full-duplex
  readonly maxParticipants: number; // per room
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
  readonly realTimeVoice?: RealTimeVoiceCapability;
  readonly groups?: GroupCapability;
  readonly identity?: IdentityCapability;
}

/** All recognized capability keys */
export type CapabilityKey = keyof ChannelCapabilities;

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
