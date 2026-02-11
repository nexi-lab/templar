/**
 * AG-UI Message -> Templar ContentBlock Mappers
 *
 * Converts AG-UI messages back to Templar content blocks.
 */

import type { ContentBlock } from "@templar/core";
import type { Message } from "../protocol/types.js";

/**
 * Maps an AG-UI Message to Templar ContentBlocks.
 *
 * Currently handles messages with string content.
 * Messages with no content or empty string content return an empty array.
 */
export function mapMessageToBlocks(message: Message): readonly ContentBlock[] {
  const content = getMessageContent(message);

  if (content === undefined || content === "") {
    return [];
  }

  return [{ type: "text", content }];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts string content from an AG-UI message.
 * Returns undefined if the message has no string content.
 */
function getMessageContent(message: Message): string | undefined {
  if ("content" in message && typeof message.content === "string") {
    return message.content;
  }
  return undefined;
}
