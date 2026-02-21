import type { ChannelCapabilities } from "@templar/core";

/**
 * Static capability declaration for email (Gmail API + IMAP/SMTP).
 *
 * Email supports text, rich text (HTML), images (inline + attached),
 * files (attachments), and threads (via In-Reply-To / References headers).
 *
 * Not supported: buttons, typing indicator, reactions, voice, groups, identity.
 */
export const EMAIL_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: 1_000_000 },
  richText: { supported: true, formats: ["html"] },
  images: {
    supported: true,
    maxSize: 25_000_000,
    formats: ["jpeg", "png", "gif", "webp"],
  },
  files: { supported: true, maxSize: 25_000_000 },
  threads: { supported: true, nested: false },
} as const;
