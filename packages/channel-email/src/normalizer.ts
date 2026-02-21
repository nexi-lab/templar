import type { ContentBlock, FileBlock, ImageBlock, InboundMessage, TextBlock } from "@templar/core";
import type { EmailAttachment, RawEmail } from "./providers/types.js";
import type { ThreadCache } from "./thread-cache.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_MIME_PREFIXES = ["image/"] as const;

// ---------------------------------------------------------------------------
// Block extractors
// ---------------------------------------------------------------------------

function extractBodyBlock(raw: RawEmail): TextBlock | undefined {
  // Prefer HTML body (richer), fall back to text body
  const content = raw.htmlBody && raw.htmlBody.length > 0 ? raw.htmlBody : raw.textBody;

  if (!content || content.length === 0) return undefined;

  return { type: "text", content };
}

function isImageMime(mimeType: string): boolean {
  return IMAGE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
}

function attachmentToDataUrl(attachment: EmailAttachment): string {
  return `data:${attachment.mimeType};base64,${attachment.content.toString("base64")}`;
}

function extractAttachmentBlock(attachment: EmailAttachment): ImageBlock | FileBlock {
  if (attachment.disposition === "inline" && isImageMime(attachment.mimeType)) {
    return {
      type: "image",
      url: attachmentToDataUrl(attachment),
      alt: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    };
  }

  return {
    type: "file",
    url: attachmentToDataUrl(attachment),
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

// ---------------------------------------------------------------------------
// Thread resolution
// ---------------------------------------------------------------------------

function resolveThread(raw: RawEmail, cache: ThreadCache): string {
  // Try to find existing thread from In-Reply-To / References
  const existingThread = cache.resolve(raw.inReplyTo, raw.references ?? []);

  if (existingThread !== undefined) {
    // Store this message in the same thread
    cache.set(raw.messageId, existingThread);
    return existingThread;
  }

  // First message in thread: use messageId as threadId
  cache.set(raw.messageId, raw.messageId);
  return raw.messageId;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a RawEmail (provider-agnostic) into an InboundMessage.
 * Returns undefined if the email is missing required fields (from, messageId).
 */
export function normalizeEmail(raw: RawEmail, cache: ThreadCache): InboundMessage | undefined {
  // Validate minimum required fields
  if (!raw.from || !raw.messageId) return undefined;

  const blocks: ContentBlock[] = [];

  // Extract body (text or HTML)
  const bodyBlock = extractBodyBlock(raw);
  if (bodyBlock) {
    blocks.push(bodyBlock);
  }

  // Extract attachments
  for (const attachment of raw.attachments) {
    blocks.push(extractAttachmentBlock(attachment));
  }

  // Resolve thread
  const threadId = resolveThread(raw, cache);

  return {
    channelType: "email",
    channelId: raw.from.address,
    senderId: raw.from.address,
    blocks,
    threadId,
    timestamp: raw.date.getTime(),
    messageId: raw.messageId,
    raw,
  };
}
