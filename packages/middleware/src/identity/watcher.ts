import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { IdentityConfig } from "@templar/core";
import { createEmitter, type Emitter } from "./emitter.js";
import { IdentityConfigSchema } from "./schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IdentityUpdatedHandler = (
  newIdentity: IdentityConfig | undefined,
  oldIdentity: IdentityConfig | undefined,
) => void;
export type IdentityErrorHandler = (error: Error) => void;

export interface IdentityConfigWatcherDeps {
  /** File watcher — injectable for testing. */
  readonly watch: (path: string) => {
    on: (event: string, handler: () => void) => void;
    close: () => Promise<void>;
  };
  /** YAML parser — injectable for testing. Defaults to `yaml` package. */
  readonly parseYaml?: (content: string) => unknown;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type IdentityWatcherEvents = {
  updated: [newIdentity: IdentityConfig | undefined, oldIdentity: IdentityConfig | undefined];
  error: [error: Error];
};

// ---------------------------------------------------------------------------
// IdentityConfigWatcher
// ---------------------------------------------------------------------------

/**
 * Watches a manifest YAML file for identity config changes.
 *
 * - Extracts the `identity` section from the manifest on each change.
 * - Validates with Zod schema (invalid configs are rejected, old config retained).
 * - Uses JSON.stringify comparison to avoid false-positive change events.
 * - Debounces rapid file changes (default 300ms).
 * - Emits typed events: `updated` (with old + new config) and `error`.
 */
export class IdentityConfigWatcher {
  private currentIdentity: IdentityConfig | undefined;
  private serializedIdentity: string;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private watcher: { close: () => Promise<void> } | undefined;
  private manifestPath: string | undefined;

  private readonly events: Emitter<IdentityWatcherEvents> = createEmitter();
  private readonly debounceMs: number;
  private readonly deps: IdentityConfigWatcherDeps | undefined;

  constructor(
    initialIdentity?: IdentityConfig,
    debounceMs = 300,
    deps?: IdentityConfigWatcherDeps,
  ) {
    this.currentIdentity =
      initialIdentity !== undefined ? Object.freeze(structuredClone(initialIdentity)) : undefined;
    this.serializedIdentity = JSON.stringify(this.currentIdentity);
    this.debounceMs = debounceMs;
    this.deps = deps;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Start watching a manifest file for identity changes.
   * Throws if already watching — call stop() first to re-watch.
   */
  async watch(manifestPath: string): Promise<void> {
    if (this.watcher) {
      throw new Error("Already watching. Call stop() before watching a new path.");
    }
    if (!isAbsolute(manifestPath)) {
      throw new Error("manifestPath must be an absolute path");
    }
    this.manifestPath = manifestPath;

    if (this.deps) {
      const w = this.deps.watch(manifestPath);
      w.on("change", () => this.handleChange());
      this.watcher = w;
    } else {
      // Dynamic import chokidar only when needed (not in tests)
      const { watch } = await import("chokidar");
      const w = watch(manifestPath, { ignoreInitial: true });
      w.on("change", () => this.handleChange());
      this.watcher = w;
    }
  }

  /**
   * Stop watching and clean up.
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
   * Get the current identity config.
   */
  getIdentity(): IdentityConfig | undefined {
    return this.currentIdentity;
  }

  /** Subscribe to identity config changes. Returns a disposer function to unsubscribe. */
  onUpdated(handler: IdentityUpdatedHandler): () => void {
    return this.events.on("updated", handler);
  }

  /** Subscribe to watcher errors. Returns a disposer function to unsubscribe. */
  onError(handler: IdentityErrorHandler): () => void {
    return this.events.on("error", handler);
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
    if (!this.manifestPath) return;

    try {
      const content = await readFile(this.manifestPath, "utf-8");

      // Parse YAML
      const parseYaml = this.deps?.parseYaml ?? (await this.loadYamlParser());
      const parsed = parseYaml(content);

      // Extract identity section
      const rawIdentity =
        parsed !== null && typeof parsed === "object" && "identity" in parsed
          ? (parsed as Record<string, unknown>).identity
          : undefined;

      // Validate — undefined (absent key) is valid (means "no identity")
      let newIdentity: IdentityConfig | undefined;
      if (rawIdentity !== undefined) {
        const result = IdentityConfigSchema.safeParse(rawIdentity);
        if (!result.success) {
          const error = new Error(`Invalid identity config: ${result.error.message}`);
          this.events.emit("error", error);
          return;
        }
        newIdentity = Object.freeze(structuredClone(result.data)) as IdentityConfig;
      }

      // Compare via JSON.stringify — avoids false positives from re-parsing
      const newSerialized = JSON.stringify(newIdentity);
      if (newSerialized === this.serializedIdentity) {
        return; // No-op: identity unchanged
      }

      // Apply change
      const oldIdentity = this.currentIdentity;
      this.currentIdentity = newIdentity;
      this.serializedIdentity = newSerialized;
      this.events.emit("updated", newIdentity, oldIdentity);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.events.emit("error", error);
    }
  }

  private async loadYamlParser(): Promise<(content: string) => unknown> {
    const { parse } = await import("yaml");
    // Explicit maxAliasCount to prevent YAML alias expansion bombs
    return (content: string) => parse(content, { maxAliasCount: 64 });
  }
}
