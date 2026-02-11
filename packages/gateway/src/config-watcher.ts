import { readFile } from "node:fs/promises";
import type { GatewayConfig } from "@templar/gateway-protocol";
import { GatewayConfigSchema, HOT_RELOADABLE_FIELDS } from "@templar/gateway-protocol";

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

  private onUpdatedHandlers: readonly ConfigUpdatedHandler[] = [];
  private onErrorHandlers: readonly ConfigErrorHandler[] = [];
  private onRestartRequiredHandlers: readonly ConfigRestartRequiredHandler[] = [];

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
  }

  /**
   * Get the current config.
   */
  getConfig(): GatewayConfig {
    return this.currentConfig;
  }

  onUpdated(handler: ConfigUpdatedHandler): void {
    this.onUpdatedHandlers = [...this.onUpdatedHandlers, handler];
  }

  onError(handler: ConfigErrorHandler): void {
    this.onErrorHandlers = [...this.onErrorHandlers, handler];
  }

  onRestartRequired(handler: ConfigRestartRequiredHandler): void {
    this.onRestartRequiredHandlers = [...this.onRestartRequiredHandlers, handler];
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
        for (const handler of this.onErrorHandlers) {
          handler(error);
        }
        return;
      }

      const newConfig = result.data as GatewayConfig;
      const { hotReloadable, restartRequired } = this.diffConfig(newConfig);

      if (restartRequired.length > 0) {
        for (const handler of this.onRestartRequiredHandlers) {
          handler(restartRequired);
        }
      }

      if (hotReloadable.length > 0) {
        // Apply only hot-reloadable fields
        const updated = { ...this.currentConfig };
        for (const field of hotReloadable) {
          (updated as Record<string, unknown>)[field] = newConfig[field as keyof GatewayConfig];
        }
        this.currentConfig = updated as GatewayConfig;
        for (const handler of this.onUpdatedHandlers) {
          handler(this.currentConfig, hotReloadable);
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const handler of this.onErrorHandlers) {
        handler(error);
      }
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
