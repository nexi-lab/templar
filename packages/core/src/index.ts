// ---------------------------------------------------------------------------
// @templar/core — Types-only kernel (zero runtime)
// ---------------------------------------------------------------------------

// Channel types
export type {
  ButtonCapability,
  CapabilityKey,
  ChannelAdapter,
  ChannelCapabilities,
  ChannelModule,
  FileCapability,
  GroupCapability,
  IdentityCapability,
  ImageCapability,
  ReactionCapability,
  ReadReceiptCapability,
  RealTimeVoiceCapability,
  RichTextCapability,
  TextCapability,
  ThreadCapability,
  TypingIndicatorCapability,
  VoiceMessageCapability,
} from "./channel-types.js";
// Config types
export type {
  AgentManifest,
  BootstrapBudget,
  BootstrapContext,
  BootstrapFile,
  BootstrapFileKind,
  BootstrapPathConfig,
  ChannelConfig,
  ConversationScope,
  DeepAgentConfig,
  MiddlewareConfig,
  ModelConfig,
  NexusClient,
  PermissionConfig,
  TemplarConfig,
  ToolConfig,
} from "./config-types.js";
export { CONVERSATION_SCOPES } from "./config-types.js";
// Message types
export type {
  Button,
  ButtonBlock,
  ChannelIdentity,
  ChannelIdentityConfig,
  ContentBlock,
  FileBlock,
  IdentityConfig,
  ImageBlock,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
  TextBlock,
} from "./message-types.js";
// Middleware types
export type {
  ConversationContext,
  SessionContext,
  TemplarMiddleware,
  TurnContext,
} from "./middleware-types.js";
