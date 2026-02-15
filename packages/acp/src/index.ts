// @templar/acp — Agent Client Protocol server adapter for IDE integration
// See: https://agentclientprotocol.com/

// Bridge (ChannelAdapter compatibility)
export { ACPChannelBridge } from "./bridge.js";
// Capabilities
export { ACP_CAPABILITIES } from "./capabilities.js";
export type { ACPConfig } from "./config.js";
// Config
export { ACPConfigSchema, parseACPConfig } from "./config.js";

// Handler types
export type {
  ACPClientCapabilities,
  ACPContext,
  ACPRunHandler,
  ACPStopReason,
  SessionNotification,
  SessionUpdate,
  ToolCallContent,
  ToolCallStatus,
  ToolKind,
} from "./handler.js";
export { mapACPContentToBlocks, mapACPPromptToInbound } from "./mappers/from-acp.js";
// Mappers
export { mapUpdateToACP } from "./mappers/to-acp.js";
export type { ACPServerOptions } from "./server.js";
// Core server
export { ACPServer } from "./server.js";
// Session
export { SessionManager } from "./session.js";
export type { ACPTransport } from "./transport.js";
// Transport
export { StdioTransport } from "./transport.js";
