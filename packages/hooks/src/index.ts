export const PACKAGE_NAME = "@templar/hooks" as const;

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
  NodeConnectedData,
  NodeDisconnectedData,
  ObserverEvent,
  ObserverEventMap,
  ObserverHandler,
  PostMessageData,
  PostModelCallData,
  PostToolUseData,
  PreMessageData,
  PreModelCallData,
  PreModelSelectData,
  PreToolUseData,
  SessionEndData,
  SessionStartData,
} from "./types.js";
