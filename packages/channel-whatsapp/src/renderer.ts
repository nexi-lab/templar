import type { OutboundMessage } from "@templar/core";
import { ChannelSendError } from "@templar/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONTENT_LENGTH = 65_536;

// ---------------------------------------------------------------------------
// Minimal Baileys socket type (avoid hard coupling at import time)
// ---------------------------------------------------------------------------

export interface WhatsAppSendable {
  sendMessage(
    jid: string,
    content: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Render plan types
// ---------------------------------------------------------------------------

interface TextCall {
  readonly type: "text";
  readonly text: string;
}

interface ImageCall {
  readonly type: "image";
  readonly url: string;
  readonly caption: string | undefined;
}

interface FileCall {
  readonly type: "file";
  readonly url: string;
  readonly filename: string;
  readonly mimetype: string;
}

interface AudioCall {
  readonly type: "audio";
  readonly url: string;
  readonly ptt: boolean;
}

interface ButtonCall {
  readonly type: "button";
  readonly text: string;
  readonly buttons: readonly {
    readonly buttonId: string;
    readonly buttonText: { readonly displayText: string };
  }[];
}

export type RenderPlanCall = TextCall | ImageCall | FileCall | AudioCall | ButtonCall;

// ---------------------------------------------------------------------------
// Text splitting (inline — WhatsApp's 65K limit rarely needs splitting)
// ---------------------------------------------------------------------------

function splitText(text: string, maxLength: number): readonly string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at newline
    let splitAt = remaining.lastIndexOf("\n", maxLength);
    if (splitAt <= 0) {
      // Try to split at space
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt <= 0) {
      // Hard cut
      splitAt = maxLength;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// Coalesce adjacent text blocks
// ---------------------------------------------------------------------------

function coalesceTextBlocks(blocks: OutboundMessage["blocks"]): OutboundMessage["blocks"] {
  const result: Array<OutboundMessage["blocks"][number]> = [];

  for (const block of blocks) {
    if (block.type === "text" && result.length > 0 && result[result.length - 1]?.type === "text") {
      const prev = result[result.length - 1];
      if (prev?.type === "text") {
        result[result.length - 1] = {
          type: "text",
          content: `${prev.content}\n${block.content}`,
        };
        continue;
      }
    }
    result.push(block);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Render plan builder
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of WhatsApp API calls from an OutboundMessage.
 *
 * Strategy:
 * 1. Coalesce adjacent text blocks
 * 2. For the first image block, attach any preceding text as caption
 * 3. All remaining blocks become individual sendMessage calls
 * 4. Split text exceeding 65K into multiple calls
 * 5. Buttons rendered as WhatsApp button message format (max 3)
 */
export function buildRenderPlan(message: OutboundMessage): readonly RenderPlanCall[] {
  const { blocks } = message;
  if (blocks.length === 0) return [];

  const coalesced = coalesceTextBlocks(blocks);
  const plan: RenderPlanCall[] = [];

  let pendingText: string | undefined;

  for (const block of coalesced) {
    if (block.type === "text") {
      pendingText = pendingText != null ? `${pendingText}\n${block.content}` : block.content;
      continue;
    }

    if (block.type === "image") {
      // Attach pending text as caption on the image
      plan.push({
        type: "image",
        url: block.url,
        caption: pendingText,
      });
      pendingText = undefined;
      continue;
    }

    if (block.type === "button") {
      // Attach pending text as the button message body
      const buttons = block.buttons.slice(0, 3).map((btn, idx) => ({
        buttonId: `${btn.action}_${idx}`,
        buttonText: { displayText: btn.label },
      }));
      plan.push({
        type: "button",
        text: pendingText ?? "",
        buttons,
      });
      pendingText = undefined;
      continue;
    }

    // For non-image, non-button media, flush pending text first
    if (pendingText != null) {
      const chunks = splitText(pendingText, MAX_CONTENT_LENGTH);
      for (const chunk of chunks) {
        plan.push({ type: "text", text: chunk });
      }
      pendingText = undefined;
    }

    if (block.type === "file") {
      // Detect audio by mimetype
      if (block.mimeType.startsWith("audio/")) {
        plan.push({
          type: "audio",
          url: block.url,
          ptt: block.mimeType.includes("ogg") || block.mimeType.includes("opus"),
        });
      } else {
        plan.push({
          type: "file",
          url: block.url,
          filename: block.filename,
          mimetype: block.mimeType,
        });
      }
    }
  }

  // Flush any remaining text
  if (pendingText != null) {
    const chunks = splitText(pendingText, MAX_CONTENT_LENGTH);
    for (const chunk of chunks) {
      plan.push({ type: "text", text: chunk });
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Execute render plan
// ---------------------------------------------------------------------------

/**
 * Render an OutboundMessage by executing WhatsApp API calls sequentially.
 * Uses URL references for media (never loads full buffers into memory).
 */
export async function renderMessage(
  message: OutboundMessage,
  socket: WhatsAppSendable,
): Promise<void> {
  const plan = buildRenderPlan(message);
  const jid = message.channelId;
  const quotedOptions = message.replyTo != null ? { quoted: { key: { id: message.replyTo } } } : {};

  for (const call of plan) {
    try {
      switch (call.type) {
        case "text":
          await socket.sendMessage(jid, { text: call.text }, quotedOptions);
          break;

        case "image":
          await socket.sendMessage(
            jid,
            {
              image: { url: call.url },
              ...(call.caption != null ? { caption: call.caption } : {}),
            },
            quotedOptions,
          );
          break;

        case "file":
          await socket.sendMessage(
            jid,
            {
              document: { url: call.url },
              mimetype: call.mimetype,
              fileName: call.filename,
            },
            quotedOptions,
          );
          break;

        case "audio":
          await socket.sendMessage(
            jid,
            {
              audio: { url: call.url },
              ptt: call.ptt,
            },
            quotedOptions,
          );
          break;

        case "button":
          await socket.sendMessage(
            jid,
            {
              text: call.text,
              footer: "",
              buttons: call.buttons,
              headerType: 1,
            },
            quotedOptions,
          );
          break;
      }
    } catch (error) {
      throw mapWhatsAppError(error, jid);
    }
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

function mapWhatsAppError(error: unknown, jid: string): ChannelSendError {
  if (error instanceof ChannelSendError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  if (message.includes("not authorized") || message.includes("403")) {
    return new ChannelSendError(
      "whatsapp",
      `Not authorized to send to ${jid}. The recipient may have blocked this number.`,
      { cause },
    );
  }

  if (message.includes("rate-overlimit") || message.includes("429")) {
    return new ChannelSendError(
      "whatsapp",
      `Rate limited when sending to ${jid}. Reduce message frequency.`,
      { cause },
    );
  }

  return new ChannelSendError("whatsapp", `Failed to send message: ${message}`, {
    cause,
  });
}
