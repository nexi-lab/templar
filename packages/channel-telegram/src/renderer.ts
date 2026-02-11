import { type ButtonBlock, coalesceBlocks, type OutboundMessage, splitText } from "@templar/core";
import type { Api } from "grammy";
import type { InlineKeyboardButton, InlineKeyboardMarkup } from "grammy/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_TEXT_LENGTH = 4096;
const BUTTON_PLACEHOLDER = "Please choose an option:";

// ---------------------------------------------------------------------------
// Inline keyboard builder
// ---------------------------------------------------------------------------

function buildInlineKeyboard(block: ButtonBlock): InlineKeyboardMarkup {
  const buttons: InlineKeyboardButton[][] = block.buttons.map((btn) => [
    { text: btn.label, callback_data: btn.action },
  ]);
  return { inline_keyboard: buttons };
}

// ---------------------------------------------------------------------------
// Render plan — intermediate representation
// ---------------------------------------------------------------------------

interface SendTextCall {
  readonly kind: "sendMessage";
  readonly chatId: string;
  readonly text: string;
  readonly parseMode: "HTML";
  readonly replyMarkup?: InlineKeyboardMarkup;
  readonly threadId?: string;
  readonly replyTo?: string;
}

interface SendPhotoCall {
  readonly kind: "sendPhoto";
  readonly chatId: string;
  readonly photo: string;
  readonly replyMarkup?: InlineKeyboardMarkup;
  readonly threadId?: string;
  readonly replyTo?: string;
}

interface SendDocumentCall {
  readonly kind: "sendDocument";
  readonly chatId: string;
  readonly document: string;
  readonly filename: string;
  readonly replyMarkup?: InlineKeyboardMarkup;
  readonly threadId?: string;
  readonly replyTo?: string;
}

interface SendTypingCall {
  readonly kind: "sendChatAction";
  readonly chatId: string;
  readonly action: "typing";
}

type RenderCall = SendTextCall | SendPhotoCall | SendDocumentCall | SendTypingCall;

// ---------------------------------------------------------------------------
// Render plan builder
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of API calls from an OutboundMessage.
 * - Adjacent text blocks are coalesced
 * - Button blocks attach to the preceding message
 * - A typing indicator is sent first
 */
export function buildRenderPlan(message: OutboundMessage): readonly RenderCall[] {
  const { channelId, blocks, threadId, replyTo } = message;
  const plan: RenderCall[] = [];

  if (blocks.length === 0) return plan;

  // Send typing indicator first
  plan.push({ kind: "sendChatAction", chatId: channelId, action: "typing" });

  // Coalesce adjacent text blocks, then process
  const coalesced = coalesceBlocks(blocks);

  let pendingKeyboard: InlineKeyboardMarkup | undefined;

  for (let i = 0; i < coalesced.length; i++) {
    const block = coalesced[i]!;

    if (block.type === "button") {
      const keyboard = buildInlineKeyboard(block);

      // Look back: can we attach to a pending (not-yet-emitted) call?
      const lastCall = plan[plan.length - 1];
      if (
        lastCall &&
        lastCall.kind !== "sendChatAction" &&
        !("replyMarkup" in lastCall && lastCall.replyMarkup)
      ) {
        // Attach to preceding call
        (lastCall as { replyMarkup?: InlineKeyboardMarkup }).replyMarkup = keyboard;
      } else {
        // No preceding content call — store pending for next content or emit standalone
        pendingKeyboard = keyboard;
      }
      continue;
    }

    if (block.type === "text") {
      const chunks = splitText(block.content, MAX_TEXT_LENGTH);
      for (let c = 0; c < chunks.length; c++) {
        const isLastChunk = c === chunks.length - 1;
        plan.push({
          kind: "sendMessage",
          chatId: channelId,
          text: chunks[c]!,
          parseMode: "HTML",
          ...(isLastChunk && pendingKeyboard ? { replyMarkup: pendingKeyboard } : {}),
          ...(threadId != null ? { threadId } : {}),
          ...(replyTo != null ? { replyTo } : {}),
        } as SendTextCall);
        if (isLastChunk && pendingKeyboard) {
          pendingKeyboard = undefined;
        }
      }
      continue;
    }

    if (block.type === "image") {
      plan.push({
        kind: "sendPhoto",
        chatId: channelId,
        photo: block.url,
        ...(pendingKeyboard ? { replyMarkup: pendingKeyboard } : {}),
        ...(threadId != null ? { threadId } : {}),
        ...(replyTo != null ? { replyTo } : {}),
      } as SendPhotoCall);
      pendingKeyboard = undefined;
      continue;
    }

    if (block.type === "file") {
      plan.push({
        kind: "sendDocument",
        chatId: channelId,
        document: block.url,
        filename: block.filename,
        ...(pendingKeyboard ? { replyMarkup: pendingKeyboard } : {}),
        ...(threadId != null ? { threadId } : {}),
        ...(replyTo != null ? { replyTo } : {}),
      } as SendDocumentCall);
      pendingKeyboard = undefined;
    }
  }

  // If there's a pending keyboard with no content to attach to, emit standalone
  if (pendingKeyboard) {
    plan.push({
      kind: "sendMessage",
      chatId: channelId,
      text: BUTTON_PLACEHOLDER,
      parseMode: "HTML",
      replyMarkup: pendingKeyboard,
      ...(threadId != null ? { threadId } : {}),
      ...(replyTo != null ? { replyTo } : {}),
    } as SendTextCall);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Execute render plan
// ---------------------------------------------------------------------------

/**
 * Render an OutboundMessage by executing Telegram API calls sequentially.
 */
export async function renderMessage(message: OutboundMessage, api: Api): Promise<void> {
  const plan = buildRenderPlan(message);

  for (const call of plan) {
    switch (call.kind) {
      case "sendChatAction":
        await api.sendChatAction(call.chatId, call.action);
        break;

      case "sendMessage": {
        const opts: Record<string, unknown> = {
          parse_mode: call.parseMode,
        };
        if (call.replyMarkup) opts.reply_markup = call.replyMarkup;
        if (call.threadId) opts.message_thread_id = Number(call.threadId);
        if (call.replyTo) opts.reply_to_message_id = Number(call.replyTo);
        await api.sendMessage(call.chatId, call.text, opts);
        break;
      }

      case "sendPhoto": {
        const opts: Record<string, unknown> = {};
        if (call.replyMarkup) opts.reply_markup = call.replyMarkup;
        if (call.threadId) opts.message_thread_id = Number(call.threadId);
        if (call.replyTo) opts.reply_to_message_id = Number(call.replyTo);
        await api.sendPhoto(call.chatId, call.photo, opts);
        break;
      }

      case "sendDocument": {
        const opts: Record<string, unknown> = {};
        if (call.replyMarkup) opts.reply_markup = call.replyMarkup;
        if (call.threadId) opts.message_thread_id = Number(call.threadId);
        if (call.replyTo) opts.reply_to_message_id = Number(call.replyTo);
        await api.sendDocument(call.chatId, call.document, opts);
        break;
      }
    }
  }
}
