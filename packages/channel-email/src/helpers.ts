import type { ContentBlock, OutboundMessage } from "@templar/core";

/**
 * Options for creating a typed email outbound message.
 */
export interface CreateEmailMessageOptions {
  /** Recipient email address (maps to channelId) */
  readonly to: string;
  /** Email subject line */
  readonly subject: string;
  /** Email body text (can be plain text or HTML) */
  readonly body: string;
  /** CC recipients (comma-separated) */
  readonly cc?: string;
  /** BCC recipients (comma-separated) */
  readonly bcc?: string;
  /** Attachments */
  readonly attachments?: readonly {
    readonly url: string;
    readonly filename: string;
    readonly mimeType: string;
  }[];
  /** Message-ID to reply to (for threading) */
  readonly replyTo?: string;
  /** Thread ID (resolved via thread cache) */
  readonly threadId?: string;
}

/**
 * Build a properly structured OutboundMessage for the email channel.
 *
 * This is a convenience helper that maps email concepts (subject, CC, BCC)
 * to the OutboundMessage metadata convention used by @templar/channel-email.
 *
 * @example
 * ```typescript
 * const msg = createEmailMessage({
 *   to: "alice@example.com",
 *   subject: "Meeting Notes",
 *   body: "Here are the notes from today...",
 *   cc: "bob@example.com",
 *   attachments: [{ url: "data:...", filename: "notes.pdf", mimeType: "application/pdf" }],
 * });
 * await emailChannel.send(msg);
 * ```
 */
export function createEmailMessage(opts: CreateEmailMessageOptions): OutboundMessage {
  const blocks: ContentBlock[] = [{ type: "text", content: opts.body }];

  if (opts.attachments) {
    for (const att of opts.attachments) {
      blocks.push({
        type: "file",
        url: att.url,
        filename: att.filename,
        mimeType: att.mimeType,
      });
    }
  }

  const metadata: Record<string, unknown> = {};
  if (opts.subject) metadata.subject = opts.subject;
  if (opts.cc) metadata.cc = opts.cc;
  if (opts.bcc) metadata.bcc = opts.bcc;

  return {
    channelId: opts.to,
    blocks,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    ...(opts.replyTo !== undefined ? { replyTo: opts.replyTo } : {}),
    ...(opts.threadId !== undefined ? { threadId: opts.threadId } : {}),
  };
}
