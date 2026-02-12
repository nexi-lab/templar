import type { ContentBlock, FileBlock, ImageBlock, InboundMessage, TextBlock } from "@templar/core";

// ---------------------------------------------------------------------------
// Minimal Baileys types (avoid hard coupling at import time)
// ---------------------------------------------------------------------------

interface WAMessageKey {
  readonly remoteJid: string | null | undefined;
  readonly fromMe: boolean | null | undefined;
  readonly id: string | null | undefined;
  readonly participant: string | null | undefined;
}

interface WAImageMessage {
  readonly url: string | null | undefined;
  readonly mimetype: string | null | undefined;
  readonly caption: string | null | undefined;
  readonly fileLength: number | Long | null | undefined;
  readonly fileName: string | null | undefined;
}

interface WAVideoMessage {
  readonly url: string | null | undefined;
  readonly mimetype: string | null | undefined;
  readonly caption: string | null | undefined;
  readonly fileLength: number | Long | null | undefined;
  readonly fileName: string | null | undefined;
}

interface WAAudioMessage {
  readonly url: string | null | undefined;
  readonly mimetype: string | null | undefined;
  readonly ptt: boolean | null | undefined;
  readonly fileLength: number | Long | null | undefined;
  readonly fileName: string | null | undefined;
}

interface WADocumentMessage {
  readonly url: string | null | undefined;
  readonly mimetype: string | null | undefined;
  readonly fileName: string | null | undefined;
  readonly fileLength: number | Long | null | undefined;
}

interface WAExtendedTextMessage {
  readonly text: string | null | undefined;
}

interface WAEphemeralMessage {
  readonly message: WAMessageContent | null | undefined;
}

interface WAMessageContent {
  readonly conversation: string | null | undefined;
  readonly extendedTextMessage: WAExtendedTextMessage | null | undefined;
  readonly imageMessage: WAImageMessage | null | undefined;
  readonly videoMessage: WAVideoMessage | null | undefined;
  readonly audioMessage: WAAudioMessage | null | undefined;
  readonly documentMessage: WADocumentMessage | null | undefined;
  readonly ephemeralMessage: WAEphemeralMessage | null | undefined;
  // TODO: Support reaction messages (reactionMessage)
  // TODO: Support edited messages (protocolMessage)
  // TODO: Support view-once messages (viewOnceMessage)
  // TODO: Support protocol/system messages
}

export interface WAMessage {
  readonly key: WAMessageKey;
  readonly message: WAMessageContent | null | undefined;
  readonly messageTimestamp: number | Long | null | undefined;
  readonly pushName: string | null | undefined;
}

/** Long-style integer from protobufjs */
interface Long {
  toNumber(): number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BROADCAST = "status@broadcast";

function toLong(value: number | Long | null | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return value;
  return value.toNumber();
}

function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

/**
 * Unwrap ephemeral message wrapper to get the actual message content.
 */
function unwrapMessage(msg: WAMessageContent | null | undefined): WAMessageContent | undefined {
  if (msg == null) return undefined;
  if (msg.ephemeralMessage?.message != null) {
    return msg.ephemeralMessage.message;
  }
  return msg;
}

// ---------------------------------------------------------------------------
// Block extractors
// ---------------------------------------------------------------------------

function extractText(content: WAMessageContent): TextBlock | undefined {
  // Extended text takes priority (URLs with previews)
  const extText = content.extendedTextMessage?.text;
  if (extText) return { type: "text", content: extText };

  // Simple conversation text
  if (content.conversation) return { type: "text", content: content.conversation };

  // Image/video captions as text
  const caption = content.imageMessage?.caption ?? content.videoMessage?.caption;
  if (caption) return { type: "text", content: caption };

  return undefined;
}

function extractImage(content: WAMessageContent, messageId: string): ImageBlock | undefined {
  const img = content.imageMessage;
  if (!img) return undefined;

  const base = {
    type: "image" as const,
    url: `whatsapp://media/${messageId}`,
    mimeType: img.mimetype ?? "image/jpeg",
  };
  const size = toLong(img.fileLength);
  if (size != null) return { ...base, size };
  return base;
}

function extractVideo(content: WAMessageContent, messageId: string): FileBlock | undefined {
  const vid = content.videoMessage;
  if (!vid) return undefined;

  const base = {
    type: "file" as const,
    url: `whatsapp://media/${messageId}`,
    filename: vid.fileName ?? "video.mp4",
    mimeType: vid.mimetype ?? "video/mp4",
  };
  const size = toLong(vid.fileLength);
  if (size != null) return { ...base, size };
  return base;
}

function extractAudio(content: WAMessageContent, messageId: string): FileBlock | undefined {
  const audio = content.audioMessage;
  if (!audio) return undefined;

  const base = {
    type: "file" as const,
    url: `whatsapp://media/${messageId}`,
    filename: audio.ptt ? "voice-note.ogg" : "audio.mp4",
    mimeType: audio.mimetype ?? "audio/ogg; codecs=opus",
  };
  const size = toLong(audio.fileLength);
  if (size != null) return { ...base, size };
  return base;
}

function extractDocument(content: WAMessageContent, messageId: string): FileBlock | undefined {
  const doc = content.documentMessage;
  if (!doc) return undefined;

  const base = {
    type: "file" as const,
    url: `whatsapp://media/${messageId}`,
    filename: doc.fileName ?? "document",
    mimeType: doc.mimetype ?? "application/octet-stream",
  };
  const size = toLong(doc.fileLength);
  if (size != null) return { ...base, size };
  return base;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a Baileys WAMessage into an InboundMessage.
 *
 * Returns undefined for:
 * - Self-messages (msg.key.fromMe)
 * - Status broadcasts (status@broadcast)
 * - Messages with no content
 *
 * Handles:
 * - Text (conversation + extendedTextMessage)
 * - Images (imageMessage with lazy media URL)
 * - Videos (videoMessage with lazy media URL)
 * - Audio (audioMessage with lazy media URL)
 * - Documents (documentMessage with lazy media URL)
 * - Ephemeral message unwrapping
 * - Group vs DM detection
 */
export function normalizeMessage(msg: WAMessage): InboundMessage | undefined {
  // Edge case #1: Filter self-messages to prevent infinite loops
  if (msg.key.fromMe) return undefined;

  // Edge case #2: Filter status broadcast messages
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid || remoteJid === STATUS_BROADCAST) return undefined;

  // Edge case #5: Unwrap ephemeral messages
  const content = unwrapMessage(msg.message);
  if (!content) return undefined;

  const messageId = msg.key.id ?? `unknown-${Date.now()}`;
  const blocks: ContentBlock[] = [];

  // Extract content blocks in priority order
  const text = extractText(content);
  if (text) blocks.push(text);

  const image = extractImage(content, messageId);
  if (image) blocks.push(image);

  const video = extractVideo(content, messageId);
  if (video) blocks.push(video);

  const audio = extractAudio(content, messageId);
  if (audio) blocks.push(audio);

  const doc = extractDocument(content, messageId);
  if (doc) blocks.push(doc);

  // Skip messages with no extractable content
  if (blocks.length === 0) return undefined;

  // Edge case #3: Determine sender ID
  // In groups, participant is the actual sender; in DMs, remoteJid is the sender
  const senderId = isGroupJid(remoteJid) ? (msg.key.participant ?? remoteJid) : remoteJid;

  const timestamp = toLong(msg.messageTimestamp);

  return {
    channelType: "whatsapp",
    channelId: remoteJid,
    senderId,
    blocks,
    timestamp: timestamp != null ? timestamp * 1000 : Date.now(),
    messageId,
    raw: msg,
  };
}

/**
 * Download media content from a WhatsApp message.
 *
 * This function resolves lazy `whatsapp://media/*` URLs into actual content.
 * It requires the original WAMessage from the `raw` field of InboundMessage.
 *
 * @param message - The InboundMessage containing a media block with whatsapp:// URL
 * @returns Buffer containing the downloaded media content
 */
export async function downloadMedia(message: InboundMessage): Promise<Buffer> {
  const { downloadMediaMessage } = await import("@whiskeysockets/baileys");
  // Cast through unknown because our minimal WAMessage type uses `| undefined`
  // for optional fields while Baileys uses `| null`
  const buffer = await downloadMediaMessage(
    message.raw as unknown as Parameters<typeof downloadMediaMessage>[0],
    "buffer",
    {},
  );
  return buffer as Buffer;
}
