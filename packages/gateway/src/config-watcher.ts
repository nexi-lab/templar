import { readFile } from "node:fs/promises";
import type { GatewayConfig } from "./protocol/index.js";
import { GatewayConfigSchema, HOT_RELOADABLE_FIELDS } from "./protocol/index.js";
import { createEmitter, type Emitter } from "./utils/emitter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigUpdatedHandler = (
  newConfig: GatewayConfig,
  changedFields: readonly string[],
) => void;
export type ConfigErrorHandler = (error: Error) => void;
export type ConfigRestartRequiredHandler = (fields: readonly string[]) => void;

export interface ConfigWatcherDeps {
  /** File watcher (chokidar) — injectable for testing */
  readonly watch: (path: string) => {
    on: (event: string, handler: () => void) => void;
    close: () => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Config Watcher Events
// ---------------------------------------------------------------------------

type ConfigWatcherEvents = {
  updated: [newConfig: GatewayConfig, changedFields: readonly string[]];
  error: [error: Error];
  restartRequired: [fields: readonly string[]];
};

// ---------------------------------------------------------------------------
// ConfigWatcher
// ---------------------------------------------------------------------------

/**
 * Watches a config file for changes with debounce and Zod validation.
 *
 * Hot-reloadable fields are applied immediately.
 * Restart-required fields emit a warning.
 * Invalid configs are rejected (old config retained).
 */
export class ConfigWatcher {
  private currentConfig: GatewayConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private watcher: { close: () => Promise<void> } | undefined;
  private configPath: string | undefined;

  private readonly events: Emitter<ConfigWatcherEvents> = createEmitter();
  private readonly debounceMs: number;
  private readonly deps: ConfigWatcherDeps | undefined;

  constructor(initialConfig: GatewayConfig, debounceMs = 300, deps?: ConfigWatcherDeps) {
    this.currentConfig = initialConfig;
    this.debounceMs = debounceMs;
    this.deps = deps;
  }

  /**
   * Start watching a config file.
   */
  async watch(path: string): Promise<void> {
    this.configPath = path;

    if (this.deps) {
      const w = this.deps.watch(path);
      w.on("change", () => this.handleChange());
      this.watcher = w;
    } else {
      // Dynamic import chokidar only when needed (not in tests)
      const { watch } = await import("chokidar");
      const w = watch(path, { ignoreInitial: true });
      w.on("change", () => this.handleChange());
      this.watcher = w;
    }
  }

  /**
   * Stop watching.
   */
  async stop(): Promise<void> {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
    this.events.clear();
  }

  /**
   * Get the current config.
   */
  getConfig(): GatewayConfig {
    return this.currentConfig;
  }

  onUpdated(handler: ConfigUpdatedHandler): () => void {
    return this.events.on("updated", handler);
  }

  onError(handler: ConfigErrorHandler): () => void {
    return this.events.on("error", handler);
  }

  onRestartRequired(handler: ConfigRestartRequiredHandler): () => void {
    return this.events.on("restartRequired", handler);
  }

  // -------------------------------------------------------------------------
  // For testing: directly trigger a reload (bypasses debounce)
  // -------------------------------------------------------------------------

  /** @internal Exposed for testing — triggers reload immediately, returns when complete. */
  triggerReload(): Promise<void> {
    return this.reload();
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private handleChange(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.reload();
    }, this.debounceMs);
  }

  private async reload(): Promise<void> {
    if (!this.configPath) return;

    try {
      const content = await readFile(this.configPath, "utf-8");
      const parsed: unknown = JSON.parse(content);
      const result = GatewayConfigSchema.safeParse(parsed);

      if (!result.success) {
        const error = new Error(`Invalid config: ${result.error.message}`);
        this.events.emit("error", error);
        return;
      }

      const newConfig = result.data as GatewayConfig;
      const { hotReloadable, restartRequired } = this.diffConfig(newConfig);

      if (restartRequired.length > 0) {
        this.events.emit("restartRequired", restartRequired);
      }

      if (hotReloadable.length > 0) {
        // Build new config immutably from field picks (Issue 7)
        const patch: Partial<GatewayConfig> = {};
        for (const field of hotReloadable) {
          (patch as Record<string, unknown>)[field] = newConfig[field as keyof GatewayConfig];
        }
        this.currentConfig = { ...this.currentConfig, ...patch } as GatewayConfig;
        this.events.emit("updated", this.currentConfig, hotReloadable);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.events.emit("error", error);
    }
  }

  private diffConfig(newConfig: GatewayConfig): {
    hotReloadable: string[];
    restartRequired: string[];
  } {
    const hotReloadable: string[] = [];
    const restartRequired: string[] = [];
    const hotSet = new Set<string>(HOT_RELOADABLE_FIELDS);

    for (const key of Object.keys(newConfig) as (keyof GatewayConfig)[]) {
      if (newConfig[key] !== this.currentConfig[key]) {
        if (hotSet.has(key)) {
          hotReloadable.push(key);
        } else {
          restartRequired.push(key);
        }
      }
    }

    return { hotReloadable, restartRequired };
  }
}
