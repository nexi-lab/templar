/**
 * Mapping functions between MCP tool results and Templar content blocks.
 */

import type { InboundMessage, OutboundMessage, TextBlock } from "@templar/core";
import type { McpToolResult } from "../bridge/types.js";

export interface ToolCallParams {
  readonly name: string;
  readonly args?: Record<string, unknown>;
}

/**
 * Extract MCP tool call parameters from an OutboundMessage's metadata.
 * Expects `metadata.mcpTool` (string) and optional `metadata.mcpArgs` (object).
 */
export function outboundToToolCall(message: OutboundMessage): ToolCallParams {
  const mcpTool = message.metadata?.mcpTool;
  if (typeof mcpTool !== "string" || mcpTool.length === 0) {
    throw new Error("OutboundMessage metadata must include 'mcpTool' (string) for MCP adapter");
  }

  const mcpArgs = message.metadata?.mcpArgs;
  const parsedArgs =
    mcpArgs !== null && mcpArgs !== undefined && typeof mcpArgs === "object"
      ? (mcpArgs as Record<string, unknown>)
      : undefined;
  if (parsedArgs !== undefined) {
    return { name: mcpTool, args: parsedArgs };
  }
  return { name: mcpTool };
}

/**
 * Map an McpToolResult into an InboundMessage with TextBlocks.
 */
export function toolResultToInbound(result: McpToolResult, toolName: string): InboundMessage {
  const blocks: readonly TextBlock[] = Object.freeze(
    result.content
      .filter((c) => c.type === "text" && c.text !== undefined)
      .map(
        (c): TextBlock =>
          Object.freeze({
            type: "text" as const,
            content: c.text ?? "",
          }),
      ),
  );

  return Object.freeze({
    channelType: "mcp",
    channelId: toolName,
    senderId: "mcp-server",
    blocks,
    timestamp: Date.now(),
    messageId: `mcp-${toolName}-${Date.now()}`,
    raw: result,
  });
}
