import type { SessionContext, TemplarMiddleware } from "@templar/core";
import { FeatureList } from "./feature-list.js";
import { ProgressFile } from "./progress-file.js";
import { buildCoderPrompt, buildInitializerPrompt } from "./prompts.js";
import { bootstrap } from "./session-bootstrap.js";
import { createLongRunningTools } from "./tools.js";
import type {
  LongRunningConfig,
  LongRunningTools,
  ResolvedLongRunningConfig,
  SessionBootstrapContext,
} from "./types.js";
import { resolveConfig, validateLongRunningConfig } from "./validation.js";

/**
 * LongRunningMiddleware — Multi-session agent harness.
 *
 * Implements the TemplarMiddleware interface to enforce incremental
 * progress across context windows. Prevents one-shotting and premature
 * victory by:
 *
 * 1. Detecting session mode (initializer vs coder)
 * 2. Loading workspace state in parallel
 * 3. Exposing tools with harness invariants
 * 4. Auto-saving progress on session end
 */
export class LongRunningMiddleware implements TemplarMiddleware {
  readonly name = "@templar/long-running";

  private readonly resolvedConfig: ResolvedLongRunningConfig;
  private bootstrapContext: SessionBootstrapContext | null = null;
  private featureList: FeatureList | null = null;
  private progressFile: ProgressFile | null = null;
  private tools: LongRunningTools | null = null;

  constructor(config: LongRunningConfig) {
    const validated = validateLongRunningConfig(config);
    this.resolvedConfig = resolveConfig(validated);
  }

  async onSessionStart(_context: SessionContext): Promise<void> {
    // 1. Bootstrap: parallel reads, mode detection
    this.bootstrapContext = await bootstrap(this.resolvedConfig);

    // 2. Load state
    this.featureList =
      this.bootstrapContext.featureList !== null
        ? FeatureList.fromDocument(this.bootstrapContext.featureList)
        : null;

    // Reconstruct ProgressFile from already-loaded entries (avoids redundant disk read)
    this.progressFile = ProgressFile.fromEntries(this.bootstrapContext.recentProgress);

    // 3. Create tools (bound to current state)
    this.tools = createLongRunningTools(
      this.resolvedConfig,
      this.bootstrapContext,
      this.featureList,
      this.progressFile,
    );
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    // Auto-save is handled by tools when they modify state.
    // This hook is available for future extensions (logging, cleanup).
  }

  /**
   * Get the tools for the current session.
   * Must be called after onSessionStart.
   */
  getTools(): LongRunningTools {
    if (!this.tools) {
      throw new Error("Tools not available. Call onSessionStart() first.");
    }
    return this.tools;
  }

  /**
   * Get the system prompt for the current session mode.
   * Must be called after onSessionStart.
   */
  getSystemPrompt(): string {
    if (!this.bootstrapContext) {
      throw new Error("Bootstrap context not available. Call onSessionStart() first.");
    }
    return this.bootstrapContext.mode === "initializer"
      ? buildInitializerPrompt(this.resolvedConfig)
      : buildCoderPrompt(this.bootstrapContext);
  }

  /**
   * Get the resolved config.
   */
  getConfig(): ResolvedLongRunningConfig {
    return this.resolvedConfig;
  }

  /**
   * Get the current bootstrap context.
   */
  getBootstrapContext(): SessionBootstrapContext | null {
    return this.bootstrapContext;
  }
}
