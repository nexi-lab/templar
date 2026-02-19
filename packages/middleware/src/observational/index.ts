import type { NexusClient } from "@nexus/sdk";
import { LlmObservationExtractor } from "./extractor.js";
import { ObservationalMemoryMiddleware } from "./middleware.js";
import { LlmObservationReflector } from "./reflector.js";
import type { ModelCallFn, ObservationalMemoryConfig } from "./types.js";

/**
 * Create an ObservationalMemoryMiddleware instance with LLM-based extraction.
 *
 * @param client - Initialized NexusClient from @nexus/sdk
 * @param modelCall - Function to call an LLM (e.g., cheap model like Haiku or Gemini Flash)
 * @param config - Middleware configuration (all fields optional)
 * @returns A configured ObservationalMemoryMiddleware instance
 * @throws {ObservationalConfigurationError} if config is invalid
 *
 * @example
 * ```typescript
 * import { NexusClient } from '@nexus/sdk';
 * import { createObservationalMemoryMiddleware } from '@templar/middleware/observational';
 *
 * const client = new NexusClient({ apiKey: process.env.NEXUS_API_KEY });
 *
 * const middleware = createObservationalMemoryMiddleware(
 *   client,
 *   async (system, user) => callLLM({ system, user, model: 'haiku' }),
 *   {
 *     enabled: { observer: true, reflector: true },
 *     observerInterval: 3,
 *     reflectorInterval: 10,
 *   },
 * );
 * ```
 */
export function createObservationalMemoryMiddleware(
  client: NexusClient,
  modelCall: ModelCallFn,
  config: ObservationalMemoryConfig = {},
): ObservationalMemoryMiddleware {
  const extractor = new LlmObservationExtractor(modelCall);
  const reflector = config.enabled?.reflector ? new LlmObservationReflector(modelCall) : undefined;
  return new ObservationalMemoryMiddleware(client, extractor, config, reflector);
}

// Re-export types and classes
export { LlmObservationExtractor } from "./extractor.js";
export { ObservationalMemoryMiddleware, validateObservationalConfig } from "./middleware.js";
export { OBSERVER_SYSTEM_PROMPT, REFLECTOR_SYSTEM_PROMPT } from "./observer-prompt.js";
export { parseObservations, parseReflections } from "./parser.js";
export { LlmObservationReflector } from "./reflector.js";
export type {
  ExtractionContext,
  ModelCallFn,
  Observation,
  ObservationalFeatureFlags,
  ObservationalMemoryConfig,
  ObservationExtractor,
  ObservationPriority,
  ObservationReflector,
  Reflection,
  ReflectionInput,
  ResolvedObservationalConfig,
  TurnSummary,
} from "./types.js";
export {
  DEFAULT_OBSERVATIONAL_CONFIG,
  DEFAULT_OBSERVATIONAL_FEATURE_FLAGS,
} from "./types.js";
