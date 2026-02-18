import type { ChannelCapabilities } from "@templar/core";

/**
 * Static capability declaration for Discord via discord.js.
 *
 * Scope: text (2K), richText, images (25MB), files (25MB),
 * buttons (25), threads (non-nested), reactions, groups (500K).
 *
 * No typingIndicator, voiceMessages, or readReceipts — out of scope
 * for the base channel adapter (voice is @templar/channel-voice).
 */
export const DISCORD_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: 2000 },
  richText: {
    supported: true,
    formats: ["bold", "italic", "code", "link", "strikethrough", "blockquote"],
  },
  images: {
    supported: true,
    maxSize: 25_000_000,
    formats: ["jpeg", "png", "gif", "webp"],
  },
  files: { supported: true, maxSize: 25_000_000 },
  buttons: { supported: true, maxButtons: 25 },
  threads: { supported: true, nested: false },
  reactions: { supported: true },
  groups: { supported: true, maxMembers: 500_000 },
  identity: { supported: true, perMessage: true },
} as const;
