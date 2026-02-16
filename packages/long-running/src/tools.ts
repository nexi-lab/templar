import type { FeatureList } from "./feature-list.js";
import * as gitOps from "./git-ops.js";
import type { ProgressFile } from "./progress-file.js";
import type {
  FeatureListDocument,
  FeatureStatusUpdate,
  GitCommitRequest,
  LongRunningTools,
  ProgressEntry,
  ResolvedLongRunningConfig,
  SessionBootstrapContext,
} from "./types.js";

/**
 * State container for tools — mutable internal state wrapped in immutable interface.
 */
interface ToolState {
  featureList: FeatureList | null;
  progressFile: ProgressFile;
  featuresMarkedThisSession: number;
}

/**
 * Create the agent tools bound to the current session state.
 *
 * Enforces harness invariants:
 * - Cannot update feature status in initializer mode
 * - Cannot mark more than maxActiveFeatures per session
 * - Requires non-empty testEvidence
 * - Uses selective git add (never git add -A)
 */
export function createLongRunningTools(
  config: ResolvedLongRunningConfig,
  bootstrapContext: SessionBootstrapContext,
  featureList: FeatureList | null,
  progressFile: ProgressFile,
): LongRunningTools {
  const state: ToolState = {
    featureList,
    progressFile,
    featuresMarkedThisSession: 0,
  };

  return {
    async getFeatureList(): Promise<FeatureListDocument> {
      if (!state.featureList) {
        throw new Error("Feature list has not been created yet. Run initializer first.");
      }
      return state.featureList.toDocument();
    },

    async updateFeatureStatus(update: FeatureStatusUpdate): Promise<void> {
      if (bootstrapContext.mode === "initializer") {
        throw new Error(
          "Cannot update feature status in initializer mode. Features can only be marked as passing in coder mode.",
        );
      }

      if (!state.featureList) {
        throw new Error("Feature list has not been created yet.");
      }

      if (state.featuresMarkedThisSession >= config.maxActiveFeatures) {
        throw new Error(
          `Cannot mark more than ${config.maxActiveFeatures} feature(s) per session. ` +
            "Commit your progress and continue in the next session.",
        );
      }

      if (!update.testEvidence || update.testEvidence.trim().length === 0) {
        throw new Error("testEvidence is required. Describe how the feature was verified.");
      }

      // Validate and mark (validateAgainst enforces immutability invariants)
      const previous = state.featureList;
      const updated = state.featureList.markPassing(update.featureId);
      updated.validateAgainst(previous);
      state.featureList = updated;
      state.featuresMarkedThisSession++;

      // Persist
      await state.featureList.save(config.workspace, config.featureListPath);
    },

    async updateProgress(entry: Omit<ProgressEntry, "sessionNumber" | "timestamp">): Promise<void> {
      const sessionNumber = state.progressFile.sessionCount + 1;
      const fullEntry: ProgressEntry = {
        ...entry,
        sessionNumber,
        timestamp: new Date().toISOString(),
      };

      state.progressFile = state.progressFile.append(fullEntry);
      await state.progressFile.save(config.workspace, config);
    },

    getSessionContext(): SessionBootstrapContext {
      return bootstrapContext;
    },

    async gitCommit(request: GitCommitRequest): Promise<string> {
      return gitOps.gitCommit(config.workspace, request, {
        timeoutMs: config.gitTimeoutMs,
      });
    },

    async gitRevert(commitSha: string): Promise<void> {
      return gitOps.gitRevert(config.workspace, commitSha, {
        timeoutMs: config.gitTimeoutMs,
      });
    },
  };
}
