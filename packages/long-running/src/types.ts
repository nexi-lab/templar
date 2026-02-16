/**
 * @templar/long-running — Type definitions
 *
 * All interfaces for the multi-session agent harness.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configuration for the long-running middleware.
 */
export interface LongRunningConfig {
  /** Absolute path to the agent workspace directory */
  readonly workspace: string;
  /** Maximum features an agent can mark as passing per session (default: 1) */
  readonly maxActiveFeatures?: number;
  /** Number of recent progress entries to keep in the active file (default: 10) */
  readonly progressWindowSize?: number;
  /** Timeout for git operations in milliseconds (default: 30_000) */
  readonly gitTimeoutMs?: number;
  /** Relative path to the feature list file (default: "feature-list.json") */
  readonly featureListPath?: string;
  /** Relative path to the progress file (default: "progress.json") */
  readonly progressFilePath?: string;
  /** Relative path to the progress archive file (default: "progress-archive.json") */
  readonly progressArchivePath?: string;
  /** Relative path to the init script (default: "init.sh") */
  readonly initScriptPath?: string;
}

/**
 * Resolved config with all defaults applied.
 */
export interface ResolvedLongRunningConfig {
  readonly workspace: string;
  readonly maxActiveFeatures: number;
  readonly progressWindowSize: number;
  readonly gitTimeoutMs: number;
  readonly featureListPath: string;
  readonly progressFilePath: string;
  readonly progressArchivePath: string;
  readonly initScriptPath: string;
}

// ============================================================================
// FEATURE LIST
// ============================================================================

/** Feature category */
export type FeatureCategory = "functional" | "non-functional" | "infrastructure";

/**
 * A single feature in the feature list.
 */
export interface Feature {
  readonly id: string;
  readonly category: FeatureCategory;
  readonly description: string;
  readonly priority: number;
  readonly steps: readonly string[];
  readonly passes: boolean;
}

/**
 * The full feature list document persisted to disk.
 */
export interface FeatureListDocument {
  readonly features: readonly Feature[];
  readonly createdAt: string;
  readonly lastUpdatedAt: string;
}

// ============================================================================
// PROGRESS
// ============================================================================

/**
 * A single progress entry written after each session.
 */
export interface ProgressEntry {
  readonly sessionNumber: number;
  readonly timestamp: string;
  readonly whatWasDone: string;
  readonly currentState: string;
  readonly nextSteps: string;
  readonly gitCommits: readonly string[];
  readonly featuresCompleted: readonly string[];
}

/**
 * The full progress document persisted to disk.
 */
export interface ProgressDocument {
  readonly entries: readonly ProgressEntry[];
}

// ============================================================================
// SESSION BOOTSTRAP
// ============================================================================

/** Session mode: initializer (first session) or coder (subsequent) */
export type SessionMode = "initializer" | "coder";

/**
 * Bootstrap context loaded at the start of each session.
 */
export interface SessionBootstrapContext {
  readonly mode: SessionMode;
  readonly featureList: FeatureListDocument | null;
  readonly recentProgress: readonly ProgressEntry[];
  readonly gitLog: readonly string[];
  readonly totalFeatures: number;
  readonly completedFeatures: number;
  readonly nextFeatures: readonly Feature[];
}

// ============================================================================
// TOOL CALL TYPES
// ============================================================================

/**
 * Request to mark a feature as passing.
 */
export interface FeatureStatusUpdate {
  readonly featureId: string;
  /** Required: description of how the feature was verified */
  readonly testEvidence: string;
}

/**
 * Request to commit specific files via git.
 */
export interface GitCommitRequest {
  readonly files: readonly string[];
  readonly message: string;
}

// ============================================================================
// TOOL INTERFACE
// ============================================================================

/**
 * Tools exposed to the agent for interacting with the harness.
 */
export interface LongRunningTools {
  /** Read the full feature list */
  getFeatureList(): Promise<FeatureListDocument>;

  /** Mark a feature as passing (requires test evidence) */
  updateFeatureStatus(update: FeatureStatusUpdate): Promise<void>;

  /** Update progress file with session summary */
  updateProgress(entry: Omit<ProgressEntry, "sessionNumber" | "timestamp">): Promise<void>;

  /** Get current session context */
  getSessionContext(): SessionBootstrapContext;

  /** Git commit specific files */
  gitCommit(request: GitCommitRequest): Promise<string>;

  /** Git revert a commit */
  gitRevert(commitSha: string): Promise<void>;
}
