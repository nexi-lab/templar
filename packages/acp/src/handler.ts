import type {
  ContentBlock as ACPContentBlock,
  RequestPermissionOutcome,
  RequestPermissionRequest,
  SessionNotification,
  SessionUpdate,
  TerminalHandle,
  ToolCallContent,
  ToolCallStatus,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { ContentBlock } from "@templar/core";

// ---------------------------------------------------------------------------
// ACPContext — capabilities provided to the handler by the server
// ---------------------------------------------------------------------------

/**
 * Context object providing ACP-specific capabilities to the handler.
 * The handler uses this to interact with the editor's environment.
 */
export interface ACPContext {
  /** Read a file from the editor's workspace (requires client fs.readTextFile capability). */
  readonly readFile: (path: string) => Promise<string>;

  /** Write a file in the editor's workspace (requires client fs.writeTextFile capability). */
  readonly writeFile: (path: string, content: string) => Promise<void>;

  /** Create a terminal and run a command (requires client terminal capability). */
  readonly createTerminal: (command: string, args?: readonly string[]) => Promise<TerminalHandle>;

  /** Request permission from the user before a sensitive operation. */
  readonly requestPermission: (
    params: RequestPermissionRequest,
  ) => Promise<RequestPermissionOutcome>;

  /** Client capabilities negotiated during initialization. */
  readonly clientCapabilities: ACPClientCapabilities;

  /** The ACP connection's AbortSignal — aborts when connection closes. */
  readonly connectionSignal: AbortSignal;
}

/** Subset of client capabilities relevant to the handler. */
export interface ACPClientCapabilities {
  readonly readTextFile: boolean;
  readonly writeTextFile: boolean;
  readonly terminal: boolean;
}

// ---------------------------------------------------------------------------
// ACPUpdate — events emitted by the handler during a prompt turn
// ---------------------------------------------------------------------------

/** Re-export ACP SDK types for convenience. */
export type {
  ACPContentBlock,
  SessionUpdate,
  SessionNotification,
  ToolCallContent,
  ToolCallStatus,
  ToolKind,
};

/**
 * Stop reasons for a prompt turn.
 * Mirrors the ACP StopReason enum for type safety.
 */
export type ACPStopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

/**
 * Handler function that processes ACP prompt turns.
 *
 * Receives the user prompt + ACP context, emits session updates, returns stop reason.
 * The handler is stateless for conversation history — it owns its own
 * context (e.g. via LangGraph checkpoints).
 */
export type ACPRunHandler = (
  input: {
    readonly sessionId: string;
    readonly prompt: readonly ContentBlock[];
  },
  context: ACPContext,
  emit: (event: SessionUpdate) => void,
  signal: AbortSignal,
) => Promise<ACPStopReason>;
