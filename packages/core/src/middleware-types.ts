import type { TokenUsage } from "./token-usage-types.js";

/**
 * Session context — passed to middleware on session start/end.
 *
 * NOTE: This type represents a conversation-level context (agent + user + scope),
 * NOT the node connection lifecycle (see @templar/gateway-protocol SessionInfo).
 * A type alias `ConversationContext` is provided for clarity in new code.
 * Full rename planned for a follow-up PR.
 */
export interface SessionContext {
  /** Unique session identifier */
  sessionId: string;
  /** Agent identifier */
  agentId?: string;
  /** User identifier */
  userId?: string;
  /** Memory scope override */
  scope?: string;
  /** Spawn depth in the agent tree (0 = root agent). Set by spawn governance. */
  spawnDepth?: number;
  /** Parent agent ID that spawned this agent. Undefined for root agents. */
  parentAgentId?: string;
  /** Active channel type (telegram, slack, discord, etc.) */
  channelType?: string;
  /** Nexus namespace / zone ID */
  zoneId?: string;
  /** Node executing the agent */
  nodeId?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

/** @see SessionContext — alias for clarity in conversation-scoping code */
export type ConversationContext = SessionContext;

/**
 * Turn context — passed to middleware before/after each turn
 */
export interface TurnContext {
  /** Session this turn belongs to */
  sessionId: string;
  /** Sequential turn number (1-based) */
  turnNumber: number;
  /** Turn input (user message, tool result, etc.) */
  input?: unknown;
  /** Turn output (agent response, tool call, etc.) */
  output?: unknown;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Model call types — used by wrapModelCall hook
// ---------------------------------------------------------------------------

/** Request payload for an LLM model call */
export interface ModelRequest {
  readonly messages: readonly { readonly role: string; readonly content: string }[];
  readonly model?: string;
  readonly systemPrompt?: string;
  readonly metadata?: Record<string, unknown>;
}

/** Response from an LLM model call */
export interface ModelResponse {
  readonly content: string;
  readonly model?: string;
  readonly usage?: TokenUsage;
  readonly metadata?: Record<string, unknown>;
}

/** Next handler in the model call chain */
export type ModelHandler = (req: ModelRequest) => Promise<ModelResponse>;

// ---------------------------------------------------------------------------
// Tool call types — used by wrapToolCall hook
// ---------------------------------------------------------------------------

/** Request payload for a tool invocation */
export interface ToolRequest {
  readonly toolName: string;
  readonly input: unknown;
  readonly metadata?: Record<string, unknown>;
}

/** Response from a tool invocation */
export interface ToolResponse {
  readonly output: unknown;
  readonly metadata?: Record<string, unknown>;
}

/** Next handler in the tool call chain */
export type ToolHandler = (req: ToolRequest) => Promise<ToolResponse>;

// ---------------------------------------------------------------------------
// Middleware interface
// ---------------------------------------------------------------------------

/**
 * Middleware interface — lifecycle hooks for DeepAgents integration
 *
 * All hooks are optional. Implement only the hooks your middleware needs.
 * Includes both lifecycle hooks (session/turn) and wrap hooks (model/tool calls).
 */
export interface TemplarMiddleware {
  /** Unique middleware name */
  readonly name: string;

  /** Called when a session starts, before any turns */
  onSessionStart?(context: SessionContext): Promise<void>;

  /** Called before each turn is processed */
  onBeforeTurn?(context: TurnContext): Promise<void>;

  /** Called after each turn is processed */
  onAfterTurn?(context: TurnContext): Promise<void>;

  /** Called when a session ends, after all turns */
  onSessionEnd?(context: SessionContext): Promise<void>;

  /** Wrap an LLM model call — intercept, modify, or observe model requests/responses */
  wrapModelCall?(req: ModelRequest, next: ModelHandler): Promise<ModelResponse>;

  /** Wrap a tool invocation — intercept, modify, or observe tool requests/responses */
  wrapToolCall?(req: ToolRequest, next: ToolHandler): Promise<ToolResponse>;
}
