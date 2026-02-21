import type { ContentBlock, OutboundMessage } from "@templar/core";
import type { RenderedAttachment, RenderedEmail } from "./providers/types.js";
import type { ThreadCache } from "./thread-cache.js";

// ---------------------------------------------------------------------------
// Data URL parsing
// ---------------------------------------------------------------------------

function parseDataUrl(url: string): { content: Buffer; mimeType: string } | undefined {
  const match = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!match || !match[1] || !match[2]) return undefined;
  return {
    mimeType: match[1],
    content: Buffer.from(match[2], "base64"),
  };
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
      return "#";
    }
    return escapeHtml(url);
  } catch {
    return escapeHtml(url);
  }
}

// ---------------------------------------------------------------------------
// Block renderers
// ---------------------------------------------------------------------------

interface TextParts {
  readonly textParts: string[];
  readonly htmlParts: string[];
}

function renderTextBlock(content: string, parts: TextParts): void {
  parts.textParts.push(content);
  parts.htmlParts.push(escapeHtml(content));
}

function renderButtonBlock(
  buttons: readonly { readonly label: string; readonly action: string }[],
  parts: TextParts,
): void {
  const textLines = buttons.map((b) => `- ${b.label}: ${b.action}`);
  const htmlLines = buttons.map(
    (b) => `<a href="${sanitizeUrl(b.action)}">${escapeHtml(b.label)}</a>`,
  );
  parts.textParts.push(textLines.join("\n"));
  parts.htmlParts.push(htmlLines.join("<br>"));
}

function renderImageBlock(
  url: string,
  alt: string | undefined,
  attachments: RenderedAttachment[],
): void {
  const cid = `img-${attachments.length}@templar`;
  const parsed = parseDataUrl(url);

  attachments.push({
    filename: alt ?? `image-${attachments.length}`,
    content: parsed ? parsed.content : url,
    contentType: parsed ? parsed.mimeType : "image/png",
    cid,
    contentDisposition: "inline",
  });
}

function renderFileBlock(
  url: string,
  filename: string,
  mimeType: string,
  attachments: RenderedAttachment[],
): void {
  const parsed = parseDataUrl(url);

  attachments.push({
    filename,
    content: parsed ? parsed.content : url,
    contentType: mimeType,
    contentDisposition: "attachment",
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a RenderedEmail from an OutboundMessage.
 *
 * Converts Templar content blocks to email body + attachments.
 * Email-specific fields (subject, CC, BCC) are extracted from message.metadata.
 */
export function buildEmailFromMessage(
  message: OutboundMessage,
  _cache: ThreadCache,
  fromAddress: string,
): RenderedEmail {
  const metadata = message.metadata ?? {};
  const subject = (metadata.subject as string | undefined) ?? "";
  const cc = metadata.cc as string | undefined;
  const bcc = metadata.bcc as string | undefined;

  const parts: TextParts = { textParts: [], htmlParts: [] };
  const attachments: RenderedAttachment[] = [];

  for (const block of message.blocks) {
    renderBlock(block, parts, attachments);
  }

  const text = parts.textParts.join("\n\n");
  const html = parts.htmlParts.join("<br><br>");

  const result: RenderedEmail = {
    from: fromAddress,
    to: message.channelId,
    subject,
    text,
    html,
    attachments,
    ...(cc !== undefined ? { cc } : {}),
    ...(bcc !== undefined ? { bcc } : {}),
    ...(message.replyTo !== undefined ? { inReplyTo: message.replyTo } : {}),
  };

  return result;
}

function renderBlock(
  block: ContentBlock,
  parts: TextParts,
  attachments: RenderedAttachment[],
): void {
  switch (block.type) {
    case "text":
      renderTextBlock(block.content, parts);
      break;
    case "button":
      renderButtonBlock(block.buttons, parts);
      break;
    case "image":
      renderImageBlock(block.url, block.alt, attachments);
      break;
    case "file":
      renderFileBlock(block.url, block.filename, block.mimeType, attachments);
      break;
  }
}
