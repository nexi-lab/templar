import type { ContentBlock } from "./types.js";

/**
 * Coalesce adjacent text blocks into a single text block.
 * Non-text blocks act as boundaries.
 */
export function coalesceBlocks(blocks: readonly ContentBlock[]): readonly ContentBlock[] {
  const result: ContentBlock[] = [];
  let textBuffer: string[] = [];

  function flushTextBuffer() {
    if (textBuffer.length > 0) {
      result.push({ type: "text", content: textBuffer.join("\n") });
      textBuffer = [];
    }
  }

  for (const block of blocks) {
    if (block.type === "text") {
      textBuffer.push(block.content);
    } else {
      flushTextBuffer();
      result.push(block);
    }
  }
  flushTextBuffer();

  return result;
}

/**
 * Split text into chunks that fit within the given length limit.
 * Tries to split at newlines, then spaces, then hard-cuts.
 */
export function splitText(text: string, maxLength: number): readonly string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at last newline within limit
    let splitPos = remaining.lastIndexOf("\n", maxLength);
    if (splitPos <= 0) {
      // Try to split at last space within limit
      splitPos = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitPos <= 0) {
      // Hard cut
      splitPos = maxLength;
    }

    chunks.push(remaining.slice(0, splitPos));
    remaining = remaining.slice(splitPos).trimStart();
  }

  return chunks;
}
