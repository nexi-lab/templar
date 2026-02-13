import type { ChannelCapabilities } from "@templar/core";

/**
 * Static capability declaration for Slack via Bolt.
 *
 * Scope: text, richText, images, files, buttons, threads, reactions, groups.
 * No typingIndicator or voiceMessages (Slack has no API for these).
 */
export const SLACK_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: 40_000 },
  richText: {
    supported: true,
    formats: ["bold", "italic", "code", "link", "strikethrough", "blockquote"],
  },
  images: {
    supported: true,
    maxSize: 20_000_000,
    formats: ["jpeg", "png", "gif", "webp"],
  },
  files: { supported: true, maxSize: 1_000_000_000 },
  buttons: { supported: true, maxButtons: 25 },
  threads: { supported: true, nested: false },
  reactions: { supported: true },
  groups: { supported: true, maxMembers: 500_000 },
  identity: { supported: true, perMessage: true },
} as const;
