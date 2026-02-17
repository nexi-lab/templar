// ---------------------------------------------------------------------------
// Interceptor Event Data (can block + modify)
// ---------------------------------------------------------------------------

export interface PreToolUseData {
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly sessionId: string;
}

export interface PreModelCallData {
  readonly model: string;
  readonly messages: readonly Record<string, unknown>[];
  readonly config: Record<string, unknown>;
  readonly sessionId: string;
}

export interface PreModelSelectData {
  readonly candidates: readonly string[];
  readonly context: Record<string, unknown>;
  readonly sessionId: string;
}

export interface PreMessageData {
  readonly message: Record<string, unknown>;
  readonly channelId: string;
  readonly sessionId: string;
}

export interface BudgetExhaustedData {
  readonly budget: number;
  readonly spent: number;
  readonly remaining: number;
  readonly agentId: string;
}

export interface PreCompactData {
  readonly sessionId: string;
  readonly currentTokens: number;
  readonly maxTokens: number;
  readonly preservedIds: readonly string[];
  readonly injections: readonly Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Observer Event Data (observe only)
// ---------------------------------------------------------------------------

export interface PostToolUseData {
  readonly toolName: string;
  readonly args: Record<string, unknown>;
  readonly result: unknown;
  readonly durationMs: number;
  readonly sessionId: string;
}

export interface PostModelCallData {
  readonly model: string;
  readonly response: unknown;
  readonly usage: Record<string, unknown>;
  readonly durationMs: number;
  readonly sessionId: string;
}

export interface PostMessageData {
  readonly message: Record<string, unknown>;
  readonly channelId: string;
  readonly messageId: string;
  readonly sessionId: string;
}

export interface SessionStartData {
  readonly sessionId: string;
  readonly agentId: string;
  readonly userId: string;
}

export interface SessionEndData {
  readonly sessionId: string;
  readonly agentId: string;
  readonly userId: string;
  readonly durationMs: number;
  readonly turnCount: number;
}

export interface BudgetWarningData {
  readonly budget: number;
  readonly spent: number;
  readonly remaining: number;
  readonly threshold: number;
  readonly agentId: string;
}

export interface ErrorOccurredData {
  readonly error: Error;
  readonly context?: string;
  readonly sessionId: string;
}

export interface ContextPressureData {
  readonly used: number;
  readonly total: number;
  readonly percentage: number;
  readonly sessionId: string;
}

export interface NodeConnectedData {
  readonly nodeId: string;
  readonly sessionId: string;
  readonly capabilities: Record<string, unknown>;
}

export interface NodeDisconnectedData {
  readonly nodeId: string;
  readonly sessionId: string;
  readonly reason: string;
}

export interface SubagentStartData {
  readonly subagentId: string;
  readonly parentSessionId: string;
  readonly sessionId: string;
  readonly task: string;
  readonly model: string;
}

export interface SubagentEndData {
  readonly subagentId: string;
  readonly parentSessionId: string;
  readonly sessionId: string;
  readonly task: string;
  readonly result: unknown;
  readonly durationMs: number;
  readonly exitReason: string;
}

// ---------------------------------------------------------------------------
// Execution Guard Events (#151 — Loop detection + max-iteration guards)
// ---------------------------------------------------------------------------

/** Interceptor: fired when loop detection triggers (can be overridden) */
export interface LoopDetectedData {
  readonly sessionId: string;
  /** Loop detection result details */
  readonly detection: {
    readonly type: "tool_cycle" | "output_repeat";
    readonly cyclePattern?: readonly string[];
    readonly repetitions: number;
    readonly windowSize: number;
  };
  readonly iterationCount: number;
  /** Configured action for this detection */
  readonly onDetected: "warn" | "stop" | "error";
}

/** Observer: fired when approaching the iteration limit */
export interface IterationWarningData {
  readonly sessionId: string;
  readonly iterationCount: number;
  readonly maxIterations: number;
  /** How close to the limit (0-100) */
  readonly percentage: number;
}

// ---------------------------------------------------------------------------
// Event Maps
// ---------------------------------------------------------------------------

/** Events that support block/modify (interceptor) semantics */
export interface InterceptorEventMap {
  readonly PreToolUse: PreToolUseData;
  readonly PreModelCall: PreModelCallData;
  readonly PreModelSelect: PreModelSelectData;
  readonly PreMessage: PreMessageData;
  readonly BudgetExhausted: BudgetExhaustedData;
  readonly PreCompact: PreCompactData;
  readonly LoopDetected: LoopDetectedData;
}

/** Events that are observe-only (no blocking or modification) */
export interface ObserverEventMap {
  readonly PostToolUse: PostToolUseData;
  readonly PostModelCall: PostModelCallData;
  readonly PostMessage: PostMessageData;
  readonly SessionStart: SessionStartData;
  readonly SessionEnd: SessionEndData;
  readonly BudgetWarning: BudgetWarningData;
  readonly ErrorOccurred: ErrorOccurredData;
  readonly ContextPressure: ContextPressureData;
  readonly NodeConnected: NodeConnectedData;
  readonly NodeDisconnected: NodeDisconnectedData;
  readonly SubagentStart: SubagentStartData;
  readonly SubagentEnd: SubagentEndData;
  readonly IterationWarning: IterationWarningData;
}

/** Combined event map — all 20 hook events */
export type HookEventMap = InterceptorEventMap & ObserverEventMap;

/** All hook event names */
export type HookEvent = keyof HookEventMap;

/** Interceptor event names (can block + modify) */
export type InterceptorEvent = keyof InterceptorEventMap;

/** Observer event names (observe only) */
export type ObserverEvent = keyof ObserverEventMap;

// ---------------------------------------------------------------------------
// Hook Result (interceptor return type)
// ---------------------------------------------------------------------------

/** Result returned by interceptor hook handlers */
export type HookResult<T> =
  | { readonly action: "continue" }
  | { readonly action: "block"; readonly reason: string }
  | { readonly action: "modify"; readonly data: T };

// ---------------------------------------------------------------------------
// Hook Context & Options
// ---------------------------------------------------------------------------

/** Context passed to every hook handler */
export interface HookContext {
  readonly signal: AbortSignal;
}

/** Options for hook registration */
export interface HookOptions<T = unknown> {
  readonly priority?: number;
  readonly timeout?: number;
  readonly match?: (data: T) => boolean;
}

// ---------------------------------------------------------------------------
// Handler Types
// ---------------------------------------------------------------------------

/** Handler for interceptor events — can block or modify the data pipeline */
export type InterceptorHandler<T> = (
  data: T,
  ctx: HookContext,
) => HookResult<T> | Promise<HookResult<T>>;

/** Handler for observer events — observe only, cannot block or modify */
export type ObserverHandler<T> = (data: T, ctx: HookContext) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Registry Configuration
// ---------------------------------------------------------------------------

/** Configuration for HookRegistry */
export interface HookRegistryConfig {
  /** Maximum re-entrancy depth for emit() calls (default: 10) */
  readonly maxDepth?: number;
  /** Default timeout for hook handlers in ms (default: 30_000) */
  readonly defaultTimeout?: number;
  /** Callback invoked when an observer handler throws (instead of console.warn) */
  readonly onObserverError?: (event: string, error: Error) => void;
}

// ---------------------------------------------------------------------------
// Internal Types (used by HookRegistry implementation)
// ---------------------------------------------------------------------------

/** Internal handler entry with metadata */
export interface HandlerEntry {
  readonly handler: InterceptorHandler<unknown> | ObserverHandler<unknown>;
  readonly priority: number;
  readonly timeout: number;
  readonly once: boolean;
  readonly match?: (data: unknown) => boolean;
}
