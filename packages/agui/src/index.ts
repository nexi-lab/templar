/**
 * @templar/agui
 *
 * AG-UI SSE streaming server with CopilotKit integration for Templar.
 */

// ---------------------------------------------------------------------------
// Protocol types (thin wrappers over @ag-ui/core)
// ---------------------------------------------------------------------------

export {
  type AgUiEvent,
  type BaseEvent,
  type Context,
  EventType,
  type Message,
  type RunAgentInput,
  type RunErrorEvent,
  type RunFinishedEvent,
  type RunStartedEvent,
  type StateDeltaEvent,
  type StateSnapshotEvent,
  type StepFinishedEvent,
  type StepStartedEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type TextMessageStartEvent,
  type Tool,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallStartEvent,
} from "./protocol/types.js";

// ---------------------------------------------------------------------------
// Encoder utilities
// ---------------------------------------------------------------------------

export { encodeComment, encodeEvent, SSE_HEADERS } from "./protocol/encoder.js";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export { RunAgentInputSchema, type ValidatedRunAgentInput } from "./protocol/schemas.js";

// ---------------------------------------------------------------------------
// Mappers (Templar <-> AG-UI)
// ---------------------------------------------------------------------------

export { mapMessageToBlocks } from "./mappers/from-agui.js";
export { mapBlockToEvents } from "./mappers/to-agui.js";

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export { AgUiServer, type AgUiServerOptions, type RunHandler } from "./server/agui-server.js";
export { type AgUiServerConfig, AgUiServerConfigSchema } from "./server/config.js";
export { ConnectionTracker } from "./server/connection-tracker.js";

// ---------------------------------------------------------------------------
// CopilotKit bridge
// ---------------------------------------------------------------------------

export {
  type CopilotKitAgentConfig,
  type CopilotKitAgentInput,
  createCopilotKitAgent,
} from "./copilotkit/bridge.js";

// ---------------------------------------------------------------------------
// Package metadata
// ---------------------------------------------------------------------------

export const PACKAGE_NAME = "@templar/agui";
export const PACKAGE_VERSION = "0.0.0";
