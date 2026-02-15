/**
 * @templar/gateway/protocol
 *
 * Shared wire protocol types for the Templar Gateway control plane.
 * Used by both @templar/gateway (server) and @templar/node (client).
 */

// Bindings
export {
  type AgentBinding,
  AgentBindingSchema,
  type BindingMatch,
  BindingMatchSchema,
} from "./bindings.js";

// Conversations
export {
  CONVERSATION_SCOPES,
  type ConversationKey,
  type ConversationKeyInput,
  type ConversationKeyResult,
  type ConversationScope,
  ConversationScopeSchema,
  MESSAGE_TYPES,
  type MessageRoutingContext,
  MessageRoutingContextSchema,
  type MessageType,
  MessageTypeSchema,
  parseConversationKey,
  resolveConversationKey,
} from "./conversations.js";

// Frames
export {
  type ConfigChangedFrame,
  ConfigChangedFrameSchema,
  type ErrorFrame,
  ErrorFrameSchema,
  FRAME_KINDS,
  type FrameKind,
  type GatewayFrame,
  GatewayFrameSchema,
  type HeartbeatPingFrame,
  HeartbeatPingFrameSchema,
  type HeartbeatPongFrame,
  HeartbeatPongFrameSchema,
  type LaneMessageAckFrame,
  LaneMessageAckFrameSchema,
  type LaneMessageFrame,
  LaneMessageFrameSchema,
  type NodeDeregisterFrame,
  NodeDeregisterFrameSchema,
  type NodeRegisterAckFrame,
  NodeRegisterAckFrameSchema,
  type NodeRegisterFrame,
  NodeRegisterFrameSchema,
  parseFrame,
  type SessionUpdateFrame,
  SessionUpdateFrameSchema,
  safeParseFrame,
} from "./frames.js";

// Lanes
export {
  LANE_PRIORITY,
  LANES,
  type Lane,
  type LaneMessage,
  LaneMessageSchema,
  LaneSchema,
  QUEUED_LANES,
  type QueuedLane,
  QueuedLaneSchema,
} from "./lanes.js";
// Sessions
export {
  SESSION_EVENTS,
  SESSION_STATES,
  SESSION_TRANSITIONS,
  type SessionEvent,
  SessionEventSchema,
  type SessionInfo,
  SessionInfoSchema,
  type SessionState,
  SessionStateSchema,
} from "./sessions.js";
// Types
export {
  DEFAULT_GATEWAY_CONFIG,
  type GatewayConfig,
  GatewayConfigSchema,
  HOT_RELOADABLE_FIELDS,
  type HotReloadableField,
  type NodeCapabilities,
  NodeCapabilitiesSchema,
  RESTART_REQUIRED_FIELDS,
  type RestartRequiredField,
  type TaskRequirements,
  TaskRequirementsSchema,
} from "./types.js";
