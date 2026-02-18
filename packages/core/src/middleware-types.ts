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

/**
 * Middleware interface — lifecycle hooks for DeepAgents integration
 *
 * All hooks are optional. Implement only the hooks your middleware needs.
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
}
