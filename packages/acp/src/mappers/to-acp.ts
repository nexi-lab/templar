import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { ContentBlock, OutboundMessage } from "@templar/core";

// ---------------------------------------------------------------------------
// Templar ContentBlock → ACP SessionUpdate
// ---------------------------------------------------------------------------

/**
 * Convert a Templar ContentBlock to an ACP agent_message_chunk SessionUpdate.
 * Used when pushing outbound messages through the bridge.
 */
export function mapBlockToSessionUpdate(block: ContentBlock): SessionUpdate {
  switch (block.type) {
    case "text":
      return {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: block.content },
      };
    case "image":
      return {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "image",
          data: block.url,
          mimeType: block.mimeType ?? "image/png",
        },
      };
    case "file":
      return {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "resource_link",
          uri: block.url,
          name: block.filename,
          mimeType: block.mimeType,
        },
      };
    case "button":
      // ACP doesn't have buttons — render as text with labels
      return {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: block.buttons.map((b) => `[${b.label}]`).join(" "),
        },
      };
  }
}

/**
 * Convert an OutboundMessage's blocks into ACP SessionUpdate events.
 */
export function mapOutboundToUpdates(message: OutboundMessage): readonly SessionUpdate[] {
  return message.blocks.map(mapBlockToSessionUpdate);
}

// ---------------------------------------------------------------------------
// Re-export the identity function for the handler's emit path.
// When the handler already emits SessionUpdate objects directly,
// this is a pass-through. Only the bridge path needs mapping.
// ---------------------------------------------------------------------------

/**
 * Identity pass-through — the handler emits SessionUpdate directly.
 * Provided for symmetry with the from-acp mapper.
 */
export function mapUpdateToACP(update: SessionUpdate): SessionUpdate {
  return update;
}
