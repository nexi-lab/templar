import type { ContentBlock, FileBlock, InboundMessage, TextBlock } from "@templar/core";

// ---------------------------------------------------------------------------
// Slack event types (minimal subset we need)
// ---------------------------------------------------------------------------

export interface SlackFile {
  readonly id: string;
  readonly name?: string;
  readonly mimetype?: string;
  readonly size?: number;
  readonly url_private?: string;
  readonly url_private_download?: string;
}

export interface SlackMessageEvent {
  readonly type?: string;
  readonly subtype?: string;
  readonly text?: string;
  readonly user?: string;
  readonly channel?: string;
  readonly ts?: string;
  readonly thread_ts?: string;
  readonly files?: readonly SlackFile[];
}

// ---------------------------------------------------------------------------
// Block extractors
// ---------------------------------------------------------------------------

function extractText(event: SlackMessageEvent): TextBlock | undefined {
  if (!event.text || event.text.length === 0) return undefined;
  return { type: "text", content: event.text };
}

function extractFiles(event: SlackMessageEvent): readonly FileBlock[] {
  if (!event.files || event.files.length === 0) return [];

  const result: FileBlock[] = [];
  for (const f of event.files) {
    const url = f.url_private_download ?? f.url_private;
    if (!url) continue;
    result.push({
      type: "file",
      url,
      filename: f.name ?? "unknown",
      mimeType: f.mimetype ?? "application/octet-stream",
      ...(f.size != null ? { size: f.size } : {}),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a Slack message event into an InboundMessage.
 * Returns undefined if the event has no processable content.
 */
export function normalizeSlackEvent(event: SlackMessageEvent): InboundMessage | undefined {
  // Skip bot messages, message_changed, etc.
  if (event.subtype && event.subtype !== "file_share") return undefined;

  const blocks: ContentBlock[] = [];

  const text = extractText(event);
  if (text) blocks.push(text);

  const files = extractFiles(event);
  blocks.push(...files);

  const channelId = event.channel ?? "";
  const senderId = event.user ?? "unknown";
  const threadId = event.thread_ts;
  const messageId = event.ts ?? "";
  const timestamp = event.ts ? Number.parseFloat(event.ts) * 1000 : Date.now();

  return {
    channelType: "slack",
    channelId,
    senderId,
    blocks,
    ...(threadId != null ? { threadId } : {}),
    timestamp,
    messageId,
    raw: event,
  };
}
