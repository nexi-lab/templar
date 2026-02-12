/**
 * @templar/mcp
 *
 * MCP client bridge for Templar — connect agents to MCP servers
 * that expose tools, resources, and prompts.
 */

// ============================================================================
// BRIDGE
// ============================================================================

export { McpBridge } from "./bridge/mcp-bridge.js";
export type {
  McpContent,
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  McpPromptResult,
  McpResource,
  McpResourceContent,
  McpServerInfo,
  McpTool,
  McpToolResult,
} from "./bridge/types.js";

// ============================================================================
// CONFIG
// ============================================================================

export { McpServerConfigSchema, parseMcpConfig } from "./config/config.js";
export type {
  McpHttpConfig,
  McpServerConfig,
  McpStdioConfig,
} from "./transport/types.js";

// ============================================================================
// TRANSPORT
// ============================================================================

export { createTransport } from "./transport/create-transport.js";

// ============================================================================
// ADAPTER
// ============================================================================

export { MCP_CAPABILITIES } from "./adapter/capabilities.js";
export type { ToolCallParams } from "./adapter/mappers.js";
export { outboundToToolCall, toolResultToInbound } from "./adapter/mappers.js";
export { McpChannelAdapter } from "./adapter/mcp-channel-adapter.js";

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/mcp";
export const PACKAGE_VERSION = "0.0.0";
