/**
 * Templar ContentBlock -> AG-UI Event Mappers
 *
 * Converts Templar message blocks to AG-UI SSE events.
 * Each block type has a dedicated mapping function.
 */

import type { ButtonBlock, ContentBlock, FileBlock, ImageBlock, TextBlock } from "@templar/core";
import { type AgUiEvent, EventType } from "../protocol/types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps a Templar ContentBlock to one or more AG-UI events.
 *
 * Uses compile-time exhaustiveness checking (never type)
 * to ensure all block types are handled.
 */
export function mapBlockToEvents(block: ContentBlock, messageId: string): readonly AgUiEvent[] {
  switch (block.type) {
    case "text":
      return mapTextBlock(block, messageId);
    case "image":
      return mapImageBlock(block, messageId);
    case "file":
      return mapFileBlock(block, messageId);
    case "button":
      return mapButtonBlock(block, messageId);
    default:
      return assertNever(block);
  }
}

// ---------------------------------------------------------------------------
// Per-type mappers
// ---------------------------------------------------------------------------

function mapTextBlock(block: TextBlock, messageId: string): readonly AgUiEvent[] {
  return wrapTextMessage(block.content, messageId);
}

function mapImageBlock(block: ImageBlock, messageId: string): readonly AgUiEvent[] {
  const alt = escapeMarkdownBrackets(block.alt ?? "");
  const markdown = `![${alt}](${block.url})`;
  return wrapTextMessage(markdown, messageId);
}

function mapFileBlock(block: FileBlock, messageId: string): readonly AgUiEvent[] {
  const name = escapeMarkdownBrackets(block.filename);
  const markdown = `[${name}](${block.url})`;
  return wrapTextMessage(markdown, messageId);
}

function mapButtonBlock(block: ButtonBlock, messageId: string): readonly AgUiEvent[] {
  return [
    {
      type: EventType.CUSTOM,
      name: "templar.buttons",
      value: {
        messageId,
        buttons: block.buttons.map((b) => ({
          label: b.label,
          action: b.action,
          style: b.style,
        })),
      },
    } as AgUiEvent,
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wraps a text string in the standard TEXT_MESSAGE_START/CONTENT/END triple.
 * Returns an empty array for empty content (AG-UI schema forbids empty delta).
 */
function wrapTextMessage(content: string, messageId: string): readonly AgUiEvent[] {
  if (content === "") {
    return [];
  }
  return [
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: "assistant",
    } as AgUiEvent,
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta: content,
    } as AgUiEvent,
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId,
    } as AgUiEvent,
  ];
}

/**
 * Escapes `[` and `]` in markdown text to prevent broken links/images.
 */
function escapeMarkdownBrackets(text: string): string {
  return text.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

/**
 * Compile-time exhaustiveness check.
 * If a new ContentBlock type is added, TypeScript will error here.
 */
function assertNever(value: never): never {
  throw new Error(`Unhandled block type: ${(value as ContentBlock).type}`);
}
