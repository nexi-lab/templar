// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export { createGuardrailsMiddleware } from "./middleware.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  AggregatedGuardResult,
  ExecutionStrategy,
  Guard,
  GuardContext,
  GuardIssue,
  GuardResult,
  GuardrailsConfig,
  GuardTimingResult,
  OnFailureMode,
  ResolvedGuardrailsConfig,
  SchemaValidationResult,
  ValidationMetrics,
} from "./types.js";

// ---------------------------------------------------------------------------
// Built-in guards
// ---------------------------------------------------------------------------

export { createCustomGuard } from "./guards/custom-guard.js";
export { EvidenceGuard, type EvidenceGuardConfig } from "./guards/evidence-guard.js";
export { SchemaGuard } from "./guards/schema-guard.js";

// ---------------------------------------------------------------------------
// Internals (for advanced usage)
// ---------------------------------------------------------------------------

export { resolveGuardrailsConfig } from "./config.js";
export { buildFeedbackMessage, RetryExecutor } from "./retry.js";
export { GuardRunner } from "./runner.js";
export { SchemaValidator } from "./validator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export { PACKAGE_NAME } from "./constants.js";
