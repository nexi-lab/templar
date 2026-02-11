import type { Readable } from "node:stream";
import type { OutboundMessage } from "@templar/core";
import { coalesceBlocks } from "@templar/core";
import { ChannelSendError } from "@templar/errors";
import { downloadFile } from "./download.js";
import { toMrkdwn } from "./mrkdwn.js";

// ---------------------------------------------------------------------------
// Block Kit block types
// ---------------------------------------------------------------------------

interface SectionBlock {
  readonly type: "section";
  readonly text: { readonly type: "mrkdwn"; readonly text: string };
}

interface ImageBlockKit {
  readonly type: "image";
  readonly image_url: string;
  readonly alt_text: string;
}

interface ButtonElement {
  readonly type: "button";
  readonly text: { readonly type: "plain_text"; readonly text: string };
  readonly action_id: string;
  readonly style?: "primary" | "danger" | undefined;
}

interface ActionsBlock {
  readonly type: "actions";
  readonly elements: readonly ButtonElement[];
}

type BlockKitBlock = SectionBlock | ImageBlockKit | ActionsBlock;

// ---------------------------------------------------------------------------
// Render plan types
// ---------------------------------------------------------------------------

interface PostMessageCall {
  readonly kind: "postMessage";
  readonly channel: string;
  readonly text: string;
  readonly blocks: readonly BlockKitBlock[];
  readonly thread_ts?: string;
}

interface FileUploadCall {
  readonly kind: "fileUpload";
  readonly channel: string;
  readonly url: string;
  readonly filename: string;
  readonly title: string;
  readonly thread_ts?: string;
}

type RenderCall = PostMessageCall | FileUploadCall;

// ---------------------------------------------------------------------------
// Block Kit block builders
// ---------------------------------------------------------------------------

function buildSection(content: string): SectionBlock {
  return {
    type: "section",
    text: { type: "mrkdwn", text: toMrkdwn(content) },
  };
}

function buildImage(url: string, alt?: string): ImageBlockKit {
  return {
    type: "image",
    image_url: url,
    alt_text: alt ?? "image",
  };
}

function mapButtonStyle(
  style?: "primary" | "secondary" | "danger",
): "primary" | "danger" | undefined {
  if (style === "primary") return "primary";
  if (style === "danger") return "danger";
  return undefined;
}

function buildActions(
  buttons: readonly { label: string; action: string; style?: "primary" | "secondary" | "danger" }[],
): ActionsBlock {
  return {
    type: "actions",
    elements: buttons.map((btn, idx) => {
      const style = mapButtonStyle(btn.style);
      return {
        type: "button" as const,
        text: { type: "plain_text" as const, text: btn.label },
        action_id: `${btn.action}_${idx}`,
        ...(style ? { style } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Render plan builder
// ---------------------------------------------------------------------------

function flushBlockKit(
  channel: string,
  blocks: BlockKitBlock[],
  fallbackParts: string[],
  threadTs: string | undefined,
  plan: RenderCall[],
): void {
  if (blocks.length === 0) return;

  const text = fallbackParts.join("\n") || " ";
  plan.push({
    kind: "postMessage",
    channel,
    text,
    blocks: [...blocks],
    ...(threadTs != null ? { thread_ts: threadTs } : {}),
  });
  blocks.length = 0;
  fallbackParts.length = 0;
}

/**
 * Build an ordered list of Slack API calls from an OutboundMessage.
 * Batches text/image/button blocks into a single postMessage with Block Kit.
 * File blocks break the batch and are uploaded separately.
 */
const MAX_BLOCKS_PER_MESSAGE = 50;

export function buildRenderPlan(message: OutboundMessage): readonly RenderCall[] {
  const { channelId, blocks, threadId } = message;
  const plan: RenderCall[] = [];

  if (blocks.length === 0) return plan;

  const coalesced = coalesceBlocks(blocks);
  const pendingBlocks: BlockKitBlock[] = [];
  const fallbackParts: string[] = [];

  for (const block of coalesced) {
    // Flush if we'd exceed Slack's 50-block limit
    if (pendingBlocks.length >= MAX_BLOCKS_PER_MESSAGE) {
      flushBlockKit(channelId, pendingBlocks, fallbackParts, threadId, plan);
    }

    if (block.type === "text") {
      pendingBlocks.push(buildSection(block.content));
      fallbackParts.push(block.content);
      continue;
    }

    if (block.type === "image") {
      pendingBlocks.push(buildImage(block.url, block.alt));
      fallbackParts.push(`[image: ${block.alt ?? block.url}]`);
      continue;
    }

    if (block.type === "button") {
      pendingBlocks.push(buildActions(block.buttons));
      continue;
    }

    if (block.type === "file") {
      // Flush pending Block Kit blocks before file upload
      flushBlockKit(channelId, pendingBlocks, fallbackParts, threadId, plan);

      plan.push({
        kind: "fileUpload",
        channel: channelId,
        url: block.url,
        filename: block.filename,
        title: block.filename,
        ...(threadId != null ? { thread_ts: threadId } : {}),
      });
    }
  }

  // Flush remaining Block Kit blocks
  flushBlockKit(channelId, pendingBlocks, fallbackParts, threadId, plan);

  return plan;
}

// ---------------------------------------------------------------------------
// Slack WebClient interface (minimal subset for rendering)
// ---------------------------------------------------------------------------

export interface SlackWebClient {
  chat: {
    postMessage(args: {
      channel: string;
      text: string;
      blocks?: readonly Record<string, unknown>[];
      thread_ts?: string;
    }): Promise<unknown>;
  };
  filesUploadV2(args: {
    channel_id: string;
    file: Readable | Buffer;
    filename: string;
    title?: string;
    thread_ts?: string;
  }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Execute render plan
// ---------------------------------------------------------------------------

/**
 * Render an OutboundMessage by executing Slack API calls sequentially.
 */
export async function renderMessage(
  message: OutboundMessage,
  client: SlackWebClient,
): Promise<void> {
  const plan = buildRenderPlan(message);

  for (const call of plan) {
    try {
      switch (call.kind) {
        case "postMessage": {
          await client.chat.postMessage({
            channel: call.channel,
            text: call.text,
            blocks: call.blocks as unknown as Record<string, unknown>[],
            ...(call.thread_ts != null ? { thread_ts: call.thread_ts } : {}),
          });
          break;
        }

        case "fileUpload": {
          const { stream } = await downloadFile(call.url);
          await client.filesUploadV2({
            channel_id: call.channel,
            file: stream,
            filename: call.filename,
            title: call.title,
            ...(call.thread_ts != null ? { thread_ts: call.thread_ts } : {}),
          });
          break;
        }
      }
    } catch (error) {
      if (error instanceof ChannelSendError) throw error;
      throw new ChannelSendError(
        "slack",
        `${call.kind} failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }
}
