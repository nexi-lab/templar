/**
 * @templar/a2a — A2A Protocol Client (#126)
 *
 * Discover and call remote A2A agents from the Templar agent pipeline.
 *
 * Public API surface.
 */

// Client
export { A2AClient } from "./a2a-client.js";
// Cache
export { AgentCardCache, type AgentCardCacheConfig } from "./agent-card-cache.js";
// Middleware
export { A2AMiddleware, createA2aMiddleware } from "./middleware.js";
// Tools
export { buildA2aTools } from "./tools.js";
// Types
export type {
  A2aAgentConfig,
  A2aArtifact,
  A2aAuthConfig,
  A2aClientConfig,
  A2aMessage,
  A2aMessagePart,
  A2aMiddlewareConfig,
  A2aTaskResult,
  A2aTaskState,
  AgentCapabilitiesInfo,
  AgentInfo,
  AgentSkillInfo,
} from "./types.js";
export {
  AGENT_CARD_PATH,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_MAX_INTERVAL_MS,
  DEFAULT_TASK_TIMEOUT_MS,
  DEFAULT_TOOL_PREFIX,
  TERMINAL_STATES,
} from "./types.js";
// Validation schemas
export {
  A2aAgentConfigSchema,
  A2aAuthConfigSchema,
  A2aClientConfigSchema,
  A2aMiddlewareConfigSchema,
  normalizeAgentUrl,
  validateMessage,
} from "./validation.js";
