import type { ContentBlock, FileBlock, ImageBlock, InboundMessage, TextBlock } from "@templar/core";
import type { Api } from "grammy";
import type { Message, MessageEntity, PhotoSize, Update } from "grammy/types";

// ---------------------------------------------------------------------------
// File URL resolution
// ---------------------------------------------------------------------------

const TELEGRAM_FILE_BASE = "https://api.telegram.org/file/bot";

async function resolveFileUrl(api: Api, fileId: string, token: string): Promise<string> {
  const file = await api.getFile(fileId);
  if (!file.file_path) {
    return "";
  }
  return `${TELEGRAM_FILE_BASE}${token}/${file.file_path}`;
}

// ---------------------------------------------------------------------------
// Entity-to-HTML conversion
// ---------------------------------------------------------------------------

/**
 * Convert Telegram MessageEntity array to HTML-formatted text.
 * Handles nested/overlapping entities by processing them in offset order.
 *
 * Note: Telegram entity offsets are in UTF-16 code units.
 * JavaScript strings use UTF-16 internally, so .length and .slice() work correctly.
 */
export function entitiesToHtml(text: string, entities: readonly MessageEntity[]): string {
  if (entities.length === 0) return escapeHtml(text);

  // Sort by offset ascending, then by length descending (outer entity first)
  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);

  let result = "";
  let lastOffset = 0;

  for (const entity of sorted) {
    // Add text before this entity (escaped)
    if (entity.offset > lastOffset) {
      result += escapeHtml(text.slice(lastOffset, entity.offset));
    }

    const entityText = text.slice(entity.offset, entity.offset + entity.length);
    result += wrapEntity(entityText, entity);
    lastOffset = entity.offset + entity.length;
  }

  // Add remaining text after last entity
  if (lastOffset < text.length) {
    result += escapeHtml(text.slice(lastOffset));
  }

  return result;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapEntity(text: string, entity: MessageEntity): string {
  const escaped = escapeHtml(text);
  switch (entity.type) {
    case "bold":
      return `<b>${escaped}</b>`;
    case "italic":
      return `<i>${escaped}</i>`;
    case "underline":
      return `<u>${escaped}</u>`;
    case "strikethrough":
      return `<s>${escaped}</s>`;
    case "code":
      return `<code>${escaped}</code>`;
    case "pre":
      if ("language" in entity && entity.language) {
        return `<pre><code class="language-${entity.language}">${escaped}</code></pre>`;
      }
      return `<pre>${escaped}</pre>`;
    case "text_link":
      return `<a href="${("url" in entity ? entity.url : "").replace(/"/g, "&quot;")}">${escaped}</a>`;
    case "spoiler":
      return `<tg-spoiler>${escaped}</tg-spoiler>`;
    case "blockquote":
    case "expandable_blockquote":
      return `<blockquote>${escaped}</blockquote>`;
    default:
      return escaped;
  }
}

// ---------------------------------------------------------------------------
// Block Extractors
// ---------------------------------------------------------------------------

type BlockExtractor = (
  msg: Message,
  api: Api,
  token: string,
) => Promise<ContentBlock | ContentBlock[] | undefined>;

async function extractText(msg: Message): Promise<TextBlock | undefined> {
  if (!msg.text) return undefined;
  const content =
    msg.entities && msg.entities.length > 0 ? entitiesToHtml(msg.text, msg.entities) : msg.text;
  return { type: "text", content };
}

async function extractPhoto(
  msg: Message,
  api: Api,
  token: string,
): Promise<ImageBlock | undefined> {
  if (!msg.photo || msg.photo.length === 0) return undefined;

  // Pick the largest photo (last in array)
  const largest = msg.photo[msg.photo.length - 1] as PhotoSize;
  const url = await resolveFileUrl(api, largest.file_id, token);

  return {
    type: "image",
    url,
    alt: `photo:${largest.file_id}`,
    ...(largest.file_size != null ? { size: largest.file_size } : {}),
  };
}

async function extractDocument(
  msg: Message,
  api: Api,
  token: string,
): Promise<FileBlock | undefined> {
  if (!msg.document) return undefined;

  const url = await resolveFileUrl(api, msg.document.file_id, token);

  return {
    type: "file",
    url,
    filename: msg.document.file_name ?? "unknown",
    mimeType: msg.document.mime_type ?? "application/octet-stream",
    ...(msg.document.file_size != null ? { size: msg.document.file_size } : {}),
  };
}

async function extractVoice(msg: Message, api: Api, token: string): Promise<FileBlock | undefined> {
  if (!msg.voice) return undefined;

  const url = await resolveFileUrl(api, msg.voice.file_id, token);

  return {
    type: "file",
    url,
    filename: "voice.ogg",
    mimeType: msg.voice.mime_type ?? "audio/ogg",
    ...(msg.voice.file_size != null ? { size: msg.voice.file_size } : {}),
  };
}

async function extractCaption(msg: Message): Promise<TextBlock | undefined> {
  if (!msg.caption) return undefined;
  const content =
    msg.caption_entities && msg.caption_entities.length > 0
      ? entitiesToHtml(msg.caption, msg.caption_entities)
      : msg.caption;
  return { type: "text", content };
}

const EXTRACTORS: readonly BlockExtractor[] = [
  extractText,
  extractPhoto,
  extractDocument,
  extractVoice,
  extractCaption,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a Telegram Update into an InboundMessage.
 * Returns undefined if the update has no processable message.
 */
export async function normalizeUpdate(
  update: Update,
  api: Api,
  token: string,
  _botUsername: string,
): Promise<InboundMessage | undefined> {
  const msg = update.message;
  if (!msg) return undefined;

  const blocks: ContentBlock[] = [];
  for (const extractor of EXTRACTORS) {
    const result = await extractor(msg, api, token);
    if (result) {
      if (Array.isArray(result)) {
        blocks.push(...result);
      } else {
        blocks.push(result);
      }
    }
  }

  // If no blocks were extracted, still return the message
  // (allows consumers to inspect raw data)
  const senderId = msg.from?.id?.toString() ?? "unknown";
  const channelId = msg.chat.id.toString();
  const threadId = msg.message_thread_id?.toString();
  const messageId = msg.message_id.toString();

  return {
    channelType: "telegram",
    channelId,
    senderId,
    blocks,
    ...(threadId != null ? { threadId } : {}),
    timestamp: msg.date * 1000, // Telegram sends Unix seconds, convert to ms
    messageId,
    raw: update,
  };
}

/**
 * Check if a message text contains an @mention of the bot.
 */
export function hasBotMention(msg: Message, botUsername: string): boolean {
  if (!msg.entities) return false;
  const mentionTag = `@${botUsername}`.toLowerCase();
  return msg.entities.some(
    (e) =>
      e.type === "mention" &&
      msg.text?.slice(e.offset, e.offset + e.length).toLowerCase() === mentionTag,
  );
}
