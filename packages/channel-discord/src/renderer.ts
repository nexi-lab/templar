import { coalesceBlocks, type OutboundMessage, splitText } from "@templar/core";
import { ChannelSendError } from "@templar/errors";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CONTENT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Minimal Discord.js types (avoid hard coupling at import time)
// ---------------------------------------------------------------------------

/**
 * Minimal interface for anything that can send Discord messages.
 * Satisfied by TextChannel, DMChannel, ThreadChannel, etc.
 */
export interface DiscordSendable {
  send(options: Record<string, unknown>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Render plan types
// ---------------------------------------------------------------------------

interface FileData {
  readonly url: string;
  readonly filename: string;
}

interface ActionRowData {
  readonly type: 1; // ActionRow
  readonly components: readonly ButtonData[];
}

interface ButtonData {
  readonly type: 2; // Button
  readonly style: number;
  readonly label: string;
  readonly custom_id: string;
}

export interface RenderPlanCall {
  readonly content: string;
  readonly files: readonly FileData[];
  readonly components: readonly ActionRowData[];
  readonly threadId?: string;
  readonly replyTo?: string;
}

// ---------------------------------------------------------------------------
// Button style mapping
// ---------------------------------------------------------------------------

function mapButtonStyle(style?: "primary" | "secondary" | "danger"): number {
  if (style === "primary") return 1;
  if (style === "danger") return 4;
  return 2; // Secondary (default)
}

// ---------------------------------------------------------------------------
// Render plan builder
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of API calls from an OutboundMessage.
 *
 * Batching strategy (Decision 14A):
 * 1. Coalesce all text blocks into a single content string
 * 2. Collect all image/file blocks into a files array
 * 3. Build all button blocks into ActionRow components
 * 4. If content ≤ 2000 → single API call with content + files + components
 * 5. If content > 2000 → split into chunks:
 *    - Chunks 1..N-1: text-only calls
 *    - Chunk N: text + files + components
 */
export function buildRenderPlan(message: OutboundMessage): readonly RenderPlanCall[] {
  const { blocks, threadId, replyTo } = message;

  if (blocks.length === 0) return [];

  // --- Step 1: Coalesce adjacent text blocks ---
  const coalesced = coalesceBlocks(blocks);

  // --- Step 2: Collect text, files, and components ---
  let combinedText = "";
  const files: FileData[] = [];
  const components: ActionRowData[] = [];

  for (const block of coalesced) {
    if (block.type === "text") {
      if (combinedText.length > 0) {
        combinedText += "\n";
      }
      combinedText += block.content;
      continue;
    }

    if (block.type === "image") {
      files.push({
        url: block.url,
        filename: block.alt ?? "image.png",
      });
      continue;
    }

    if (block.type === "file") {
      files.push({
        url: block.url,
        filename: block.filename,
      });
      continue;
    }

    if (block.type === "button") {
      const buttons: ButtonData[] = block.buttons.map((btn, idx) => ({
        type: 2 as const,
        style: mapButtonStyle(btn.style),
        label: btn.label,
        custom_id: `${btn.action}_${idx}`,
      }));

      // Discord allows max 5 buttons per ActionRow
      for (let i = 0; i < buttons.length; i += 5) {
        components.push({
          type: 1 as const,
          components: buttons.slice(i, i + 5),
        });
      }
    }
  }

  // --- Step 3: Build plan ---
  const base = {
    ...(threadId != null ? { threadId } : {}),
    ...(replyTo != null ? { replyTo } : {}),
  };

  // If content fits in a single message, batch everything
  if (combinedText.length <= MAX_CONTENT_LENGTH) {
    return [
      {
        content: combinedText,
        files,
        components,
        ...base,
      },
    ];
  }

  // Content exceeds limit — split into chunks
  const chunks = splitText(combinedText, MAX_CONTENT_LENGTH);
  const plan: RenderPlanCall[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    plan.push({
      content: chunks[i] ?? "",
      files: isLast ? files : [],
      components: isLast ? components : [],
      ...base,
    });
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Discord error code handling (Decision 6A)
// ---------------------------------------------------------------------------

function mapDiscordError(error: unknown, channelId: string): ChannelSendError {
  if (error instanceof ChannelSendError) return error;

  const code = (error as Record<string, unknown> | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;

  if (code === 50013) {
    return new ChannelSendError(
      "discord",
      `Bot lacks permission to send in channel ${channelId}. Check that the bot has SendMessages, AttachFiles, and EmbedLinks permissions.`,
      { cause },
    );
  }

  if (code === 50001) {
    return new ChannelSendError(
      "discord",
      `Bot cannot access channel ${channelId}. Verify channel permissions or that the bot is in the guild.`,
      { cause },
    );
  }

  return new ChannelSendError("discord", `Failed to send message: ${message}`, { cause });
}

// ---------------------------------------------------------------------------
// Execute render plan
// ---------------------------------------------------------------------------

/**
 * Render an OutboundMessage by executing Discord API calls sequentially.
 * Handles batched sends (content + files + components in one call).
 */
export async function renderMessage(
  message: OutboundMessage,
  sendable: DiscordSendable,
): Promise<void> {
  const plan = buildRenderPlan(message);

  for (const call of plan) {
    try {
      const payload: Record<string, unknown> = {};

      if (call.content.length > 0) {
        payload.content = call.content;
      }

      if (call.files.length > 0) {
        payload.files = call.files.map((f) => ({
          attachment: f.url,
          name: f.filename,
        }));
      }

      if (call.components.length > 0) {
        payload.components = call.components;
      }

      if (call.threadId != null) {
        payload.threadId = call.threadId;
      }

      if (call.replyTo != null) {
        payload.reply = { messageReference: call.replyTo };
      }

      await sendable.send(payload);
    } catch (error) {
      throw mapDiscordError(error, message.channelId);
    }
  }
}
