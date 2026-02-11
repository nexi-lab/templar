/**
 * AG-UI Protocol Type Wrappers
 *
 * Thin re-export layer that pins the AG-UI types we depend on.
 * When @ag-ui/core ships a breaking change, only this file needs updating.
 */

// ---------------------------------------------------------------------------
// Event type enum
// ---------------------------------------------------------------------------

export { EventType } from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Event types we use (lifecycle)
// ---------------------------------------------------------------------------

export type {
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StepFinishedEvent,
  StepStartedEvent,
} from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Event types we use (text messages)
// ---------------------------------------------------------------------------

export type {
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
} from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Event types we use (tool calls)
// ---------------------------------------------------------------------------

export type {
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Event types we use (state management)
// ---------------------------------------------------------------------------

export type { StateDeltaEvent, StateSnapshotEvent } from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Event types we use (custom / extensions)
// ---------------------------------------------------------------------------

export type { CustomEvent } from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Input / message / base types
// ---------------------------------------------------------------------------

export type {
  BaseEvent,
  Context,
  Message,
  RunAgentInput,
  Tool,
} from "@ag-ui/core";

// ---------------------------------------------------------------------------
// Union of all events we emit
// ---------------------------------------------------------------------------

import type {
  CustomEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StateDeltaEvent,
  StateSnapshotEvent,
  StepFinishedEvent,
  StepStartedEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from "@ag-ui/core";

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent;
