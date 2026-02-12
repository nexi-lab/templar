import type { ChannelCapabilities } from "@templar/core";

/**
 * Static capability declaration for WhatsApp via Baileys.
 *
 * Scope: text (65K), images (16MB), files (100MB), buttons (3),
 * reactions, typing indicator, read receipts, voice messages (15min),
 * groups (1024).
 *
 * No richText (WhatsApp has no markdown API) or threads (no thread model).
 */
export const WHATSAPP_CAPABILITIES: ChannelCapabilities = Object.freeze({
  text: { supported: true, maxLength: 65_536 },
  // richText: absent — WhatsApp has no markdown/formatting API
  images: {
    supported: true,
    maxSize: 16_000_000,
    formats: ["jpeg", "png", "gif", "webp"],
  },
  files: { supported: true, maxSize: 100_000_000 },
  buttons: { supported: true, maxButtons: 3 },
  // threads: absent — WhatsApp has no thread model
  reactions: { supported: true },
  typingIndicator: { supported: true },
  readReceipts: { supported: true },
  voiceMessages: { supported: true, maxDuration: 900, formats: ["ogg", "mp4"] },
  groups: { supported: true, maxMembers: 1024 },
} as const);
