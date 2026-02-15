import type { ContentBlock as ACPContentBlock } from "@agentclientprotocol/sdk";
import type { ContentBlock, InboundMessage } from "@templar/core";

// ---------------------------------------------------------------------------
// ACP ContentBlock → Templar ContentBlock
// ---------------------------------------------------------------------------

/**
 * Convert a single ACP ContentBlock to a Templar ContentBlock.
 * Returns undefined for unsupported types (audio, unknown).
 */
export function mapACPBlockToTemplar(block: ACPContentBlock): ContentBlock | undefined {
  switch (block.type) {
    case "text":
      return { type: "text", content: block.text };

    case "image":
      return {
        type: "image",
        url: block.uri ?? `data:${block.mimeType};base64,${block.data}`,
        mimeType: block.mimeType,
      };

    case "resource_link":
      return {
        type: "file",
        url: block.uri,
        filename: block.name,
        mimeType: block.mimeType ?? "application/octet-stream",
      };

    case "resource": {
      const resource = block.resource;
      if ("text" in resource) {
        return { type: "text", content: resource.text };
      }
      // BlobResourceContents — treat as file
      return {
        type: "file",
        url: resource.uri,
        filename: resource.uri.split("/").pop() ?? "blob",
        mimeType: resource.mimeType ?? "application/octet-stream",
      };
    }

    case "audio":
      // Audio not supported in Templar ContentBlock — skip with warning
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Convert ACP prompt content blocks to Templar ContentBlock[].
 * Filters out unsupported block types.
 */
export function mapACPContentToBlocks(
  acpBlocks: readonly ACPContentBlock[],
): readonly ContentBlock[] {
  const result: ContentBlock[] = [];
  for (const block of acpBlocks) {
    const mapped = mapACPBlockToTemplar(block);
    if (mapped) {
      result.push(mapped);
    }
  }
  return result;
}

/**
 * Convert an ACP prompt into a Templar InboundMessage.
 */
export function mapACPPromptToInbound(
  sessionId: string,
  prompt: readonly ACPContentBlock[],
): InboundMessage {
  return {
    channelType: "acp",
    channelId: sessionId,
    senderId: "ide-client",
    blocks: mapACPContentToBlocks(prompt),
    timestamp: Date.now(),
    messageId: crypto.randomUUID(),
    raw: prompt,
  };
}
