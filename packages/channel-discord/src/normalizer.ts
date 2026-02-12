import type { ContentBlock, FileBlock, ImageBlock, InboundMessage, TextBlock } from "@templar/core";

// ---------------------------------------------------------------------------
// Minimal Discord.js types (avoid hard coupling to discord.js at import time)
// ---------------------------------------------------------------------------

interface DiscordAttachment {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly contentType: string | null;
  readonly size: number;
}

interface DiscordEmbed {
  readonly description: string | null;
  readonly fields: readonly { readonly name: string; readonly value: string }[];
}

interface DiscordChannel {
  readonly id: string;
  readonly type: number;
  isThread(): boolean;
}

interface DiscordMessage {
  readonly id: string;
  readonly content: string | undefined;
  readonly author: { readonly id: string; readonly bot: boolean };
  readonly channelId: string;
  readonly channel: DiscordChannel;
  readonly attachments: ReadonlyMap<string, DiscordAttachment>;
  readonly embeds: readonly DiscordEmbed[];
  readonly createdTimestamp: number;
}

// ---------------------------------------------------------------------------
// Content type detection
// ---------------------------------------------------------------------------

const IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
]);

function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return IMAGE_CONTENT_TYPES.has(contentType);
}

// ---------------------------------------------------------------------------
// Block extractors
// ---------------------------------------------------------------------------

function extractText(msg: DiscordMessage): TextBlock | undefined {
  if (!msg.content || msg.content.length === 0) return undefined;
  return { type: "text", content: msg.content };
}

function extractAttachments(msg: DiscordMessage): readonly (ImageBlock | FileBlock)[] {
  const blocks: (ImageBlock | FileBlock)[] = [];

  for (const [, att] of msg.attachments) {
    if (isImageContentType(att.contentType)) {
      blocks.push({
        type: "image",
        url: att.url,
        alt: att.name,
        ...(att.size > 0 ? { size: att.size } : {}),
      });
    } else {
      blocks.push({
        type: "file",
        url: att.url,
        filename: att.name,
        mimeType: att.contentType ?? "application/octet-stream",
        ...(att.size > 0 ? { size: att.size } : {}),
      });
    }
  }

  return blocks;
}

function extractEmbedText(msg: DiscordMessage): readonly TextBlock[] {
  const blocks: TextBlock[] = [];

  for (const embed of msg.embeds) {
    const parts: string[] = [];

    if (embed.description) {
      parts.push(embed.description);
    }

    if (embed.fields.length > 0) {
      const fieldText = embed.fields.map((f) => `${f.name}: ${f.value}`).join("\n");
      parts.push(fieldText);
    }

    if (parts.length > 0) {
      blocks.push({ type: "text", content: parts.join("\n") });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a Discord Message into an InboundMessage.
 * Returns undefined for bot messages (prevents infinite loops).
 */
export function normalizeMessage(msg: DiscordMessage): InboundMessage | undefined {
  // Edge case #6: filter bot messages
  if (msg.author.bot) return undefined;

  const blocks: ContentBlock[] = [];

  const text = extractText(msg);
  if (text) blocks.push(text);

  const attachments = extractAttachments(msg);
  blocks.push(...attachments);

  const embedTexts = extractEmbedText(msg);
  blocks.push(...embedTexts);

  // Edge case #4: thread detection
  const threadId = msg.channel.isThread() ? msg.channel.id : undefined;

  return {
    channelType: "discord",
    channelId: msg.channelId,
    senderId: msg.author.id,
    blocks,
    ...(threadId != null ? { threadId } : {}),
    timestamp: msg.createdTimestamp,
    messageId: msg.id,
    raw: msg,
  };
}
