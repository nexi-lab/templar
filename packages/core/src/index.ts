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
// Context hydration types (#59)
export type {
  ContextHydrationConfig,
  ContextSourceConfig,
  HydrationMetrics,
  HydrationResult,
  HydrationTemplateVars,
  LinkedResourceSourceConfig,
  McpToolSourceConfig,
  MemoryQuerySourceConfig,
  ResolvedContextSource,
  ToolExecutor,
  WorkspaceSnapshotSourceConfig,
} from "./context-types.js";
// Execution types
export type {
  ExecutionLimitsConfig,
  LoopDetection,
  LoopDetectionConfig,
  StopReason,
} from "./execution-types.js";
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
  ModelHandler,
  ModelRequest,
  ModelResponse,
  SessionContext,
  TemplarMiddleware,
  ToolHandler,
  ToolRequest,
  ToolResponse,
  TurnContext,
} from "./middleware-types.js";
// Plugin types (#108)
export type {
  PluginAssemblyResult,
  PluginCapability,
  PluginConfig,
  PluginManifestSnapshot,
  PluginTrust,
  TemplarPluginApi,
  TemplarPluginDefinition,
} from "./plugin-types.js";
// Resolver types
export type { Resolver } from "./resolver-types.js";
// Spawn governance types (#163)
export type {
  DepthToolPolicy,
  PreSubagentSpawnData,
  SpawnDecision,
  SpawnDenialCode,
  SpawnGuardState,
  SpawnLimitsConfig,
  SpawnStopReason,
} from "./spawn-types.js";
