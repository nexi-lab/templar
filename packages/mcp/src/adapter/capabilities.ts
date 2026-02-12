/**
 * MCP channel capabilities — MCP is primarily text-based.
 * Only `text` capability is declared. Consumers needing full
 * MCP power should use McpBridge directly.
 */

import type { ChannelCapabilities } from "@templar/core";

export const MCP_CAPABILITIES: ChannelCapabilities = {
  text: { supported: true, maxLength: Number.MAX_SAFE_INTEGER },
} as const;
