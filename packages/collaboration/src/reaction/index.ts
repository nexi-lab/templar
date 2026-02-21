/**
 * @templar/collaboration/reaction — Event-triggered agent responses
 */

export { resolveReactionConfig } from "./config.js";
export { DEFAULT_POLL_INTERVAL_MS, PACKAGE_NAME } from "./constants.js";
export { InMemoryEventSource, PollingEventSource } from "./event-source.js";
export { createEventMatcher, matchesFilters } from "./matcher.js";
export { createReactionMiddleware, ReactionMiddleware } from "./middleware.js";
export type {
  EventSource,
  NexusEvent,
  ReactionConfig,
  ReactionPattern,
  ResolvedReactionConfig,
} from "./types.js";
