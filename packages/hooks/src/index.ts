export const PACKAGE_NAME = "@templar/hooks" as const;

// Bridge
export { createHookMiddleware } from "./bridge.js";
// Constants
export {
  CONTINUE_RESULT,
  DEFAULT_HOOK_TIMEOUT,
  DEFAULT_MAX_DEPTH,
  HOOK_PRIORITY,
  INTERCEPTOR_EVENTS,
} from "./constants.js";
// Registry
export { HookRegistry } from "./registry.js";
// Types
export type {
  BudgetExhaustedData,
  BudgetWarningData,
  ContextPressureData,
  ErrorOccurredData,
  HandlerEntry,
  HookContext,
  HookEvent,
  HookEventMap,
  HookOptions,
  HookRegistryConfig,
  HookResult,
  InterceptorEvent,
  InterceptorEventMap,
  InterceptorHandler,
  IterationWarningData,
  LoopDetectedData,
  NodeConnectedData,
  NodeDisconnectedData,
  ObserverEvent,
  ObserverEventMap,
  ObserverHandler,
  PostMessageData,
  PostModelCallData,
  PostToolUseData,
  PreCompactData,
  PreMessageData,
  PreModelCallData,
  PreModelSelectData,
  PreSubagentSpawnData,
  PreToolUseData,
  SessionEndData,
  SessionStartData,
  SubagentEndData,
  SubagentStartData,
} from "./types.js";
