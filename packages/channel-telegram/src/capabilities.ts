import type { ChannelCapabilities } from "@templar/core";

/**
 * Static capability declaration for Telegram via grammY.
 *
 * MVP scope: text, richText, images, files, buttons, typingIndicator,
 * voiceMessages, groups. Threads and reactions deferred to follow-up.
 */
export const TELEGRAM_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: 4096 },
  richText: {
    supported: true,
    formats: [
      "bold",
      "italic",
      "code",
      "link",
      "strikethrough",
      "underline",
      "spoiler",
      "blockquote",
    ],
  },
  images: {
    supported: true,
    maxSize: 10_000_000,
    formats: ["jpeg", "png", "gif", "webp"],
  },
  files: { supported: true, maxSize: 50_000_000 },
  buttons: { supported: true, maxButtons: 100 },
  typingIndicator: { supported: true },
  voiceMessages: { supported: true, maxDuration: 60, formats: ["ogg"] },
  groups: { supported: true, maxMembers: 200_000 },
} as const;
