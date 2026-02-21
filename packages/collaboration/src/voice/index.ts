/**
 * @templar/collaboration/voice — Memory-derived personality drift
 */

export { resolveVoiceEvolutionConfig } from "./config.js";
export {
  DEFAULT_MAX_DRIFT,
  DEFAULT_MEMORY_QUERY_SCOPE,
  DEFAULT_QUERY_TIMEOUT_MS,
  DEFAULT_UPDATE_INTERVAL_MS,
  PACKAGE_NAME,
} from "./constants.js";
export { createVoiceEvolutionMiddleware, VoiceEvolutionMiddleware } from "./middleware.js";
export { ModifierCache } from "./modifier-cache.js";
export type {
  ModifierBuilder,
  PersonalityModifier,
  ResolvedVoiceEvolutionConfig,
  VoiceEvolutionConfig,
} from "./types.js";
