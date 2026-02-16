/**
 * @templar/long-running
 *
 * Multi-session agent harness that prevents one-shotting and premature
 * victory by enforcing incremental progress across context windows.
 *
 * Based on Anthropic's two-phase pattern: an Initializer mode (first session
 * scaffolds feature list + progress tracking) and a Coder mode (subsequent
 * sessions make incremental progress one feature at a time).
 */

// ============================================================================
// MIDDLEWARE
// ============================================================================

export { LongRunningMiddleware } from "./middleware.js";

// ============================================================================
// CORE CLASSES
// ============================================================================

export { FeatureList } from "./feature-list.js";
export { ProgressFile } from "./progress-file.js";

// ============================================================================
// FUNCTIONS
// ============================================================================

export { buildCoderPrompt, buildInitializerPrompt } from "./prompts.js";
export { bootstrap } from "./session-bootstrap.js";
export { createLongRunningTools } from "./tools.js";

// ============================================================================
// GIT OPERATIONS
// ============================================================================

export {
  gitCommit,
  gitLog,
  gitRevert,
  gitShowFile,
  gitStatus,
  isGitAvailable,
  isGitRepo,
} from "./git-ops.js";

// ============================================================================
// VALIDATION
// ============================================================================

export { resolveConfig, validateLongRunningConfig } from "./validation.js";

// ============================================================================
// TYPES
// ============================================================================

export type {
  Feature,
  FeatureCategory,
  FeatureListDocument,
  FeatureStatusUpdate,
  GitCommitRequest,
  LongRunningConfig,
  LongRunningTools,
  ProgressDocument,
  ProgressEntry,
  ResolvedLongRunningConfig,
  SessionBootstrapContext,
  SessionMode,
} from "./types.js";

// ============================================================================
// PACKAGE METADATA
// ============================================================================

export const PACKAGE_NAME = "@templar/long-running" as const;
export const PACKAGE_VERSION = "0.0.0" as const;
