import type { ChannelCapabilities } from "@templar/core";

/**
 * ACP channel capabilities for ChannelRegistry compatibility.
 *
 * ACP supports text and rich text (Markdown) natively.
 * File and image support depends on what the handler emits — ACP uses
 * diffs, terminal output, and resource links instead of traditional
 * file/image attachments.
 */
export const ACP_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: Number.MAX_SAFE_INTEGER },
  richText: { supported: true, formats: ["markdown"] },
} as const;
