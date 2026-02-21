/**
 * @templar/collaboration/distillation — Post-conversation memory extraction
 */

export { resolveDistillationConfig } from "./config.js";
export {
  DEFAULT_EXTRACTION_TIMEOUT_MS,
  DEFAULT_MAX_TURNS,
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_SCOPE,
  PACKAGE_NAME,
} from "./constants.js";
export { DefaultMemoryExtractor } from "./default-extractor.js";
export { createDistillationMiddleware, DistillationMiddleware } from "./middleware.js";
export type {
  DistillationConfig,
  DistillationTrigger,
  ExtractedMemory,
  ExtractionContext,
  MemoryExtractor,
  ResolvedDistillationConfig,
  TurnSummary,
} from "./types.js";
