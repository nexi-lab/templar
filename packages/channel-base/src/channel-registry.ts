import type { CapabilityKey, ChannelAdapter, ChannelCapabilities } from "@templar/core";
import { ChannelLoadError, ChannelNotFoundError } from "@templar/errors";
import { CapabilityGuard } from "./capability-guard.js";
import { hashConfig } from "./config-hash.js";
import { isChannelAdapter } from "./type-guards.js";

/**
 * Options for loading a channel adapter
 */
export interface ChannelLoadOptions {
  /** Explicit cache key override. When provided, config hashing is skipped. */
  readonly instanceKey?: string;
}

/**
 * Registry for lazy-loading channel adapters
 *
 * Manages dynamic loading of channel implementations using the registry pattern.
 * Channels are loaded on-demand, cached by type+config, and wrapped in a
 * CapabilityGuard for runtime enforcement.
 *
 * @example
 * ```typescript
 * const registry = new ChannelRegistry();
 *
 * // Register channel loaders with capabilities
 * registry.register('slack', () => import('@templar/channel-slack'), {
 *   text: { supported: true, maxLength: 4000 },
 *   images: { supported: true, maxSize: 10_000_000, formats: ['png', 'jpg'] },
 *   threads: { supported: true, nested: false },
 * });
 *
 * // Lazy load on first use (returns CapabilityGuard-wrapped adapter)
 * const adapter = await registry.load('slack', { token: '...' });
 * await adapter.connect();
 *
 * // Discover channels by required capabilities
 * const withThreads = registry.findByCapabilities({ threads: true });
 * ```
 */
export class ChannelRegistry {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic import returns unknown module shape
  private readonly loaders = new Map<string, () => Promise<any>>();
  private readonly registeredCapabilities = new Map<string, ChannelCapabilities>();
  private readonly cache = new Map<string, Promise<ChannelAdapter>>();

  /**
   * Register a channel type with its lazy loader and declared capabilities
   *
   * @param type - Channel type identifier (e.g., 'slack', 'discord')
   * @param loader - Function that dynamically imports the channel package
   * @param capabilities - Declared capabilities for discovery (before loading)
   */
  register(type: string, loader: () => Promise<unknown>, capabilities: ChannelCapabilities): void {
    if (this.loaders.has(type)) {
      throw new Error(`Channel type '${type}' is already registered`);
    }
    this.loaders.set(type, loader);
    this.registeredCapabilities.set(type, capabilities);
  }

  /**
   * Load a channel adapter (lazy, with config-aware caching)
   *
   * Cache key is `type:instanceKey` if instanceKey is provided,
   * otherwise `type:hash(config)` for deterministic deduplication.
   *
   * The returned adapter is wrapped in a CapabilityGuard that enforces
   * capability constraints on send().
   *
   * @param type - Channel type to load
   * @param config - Channel-specific configuration
   * @param options - Optional load options (instanceKey for explicit cache key)
   * @returns Promise resolving to the guarded channel adapter instance
   * @throws {ChannelNotFoundError} If channel type not registered
   * @throws {ChannelLoadError} If import fails or adapter is invalid
   */
  async load(
    type: string,
    config: Readonly<Record<string, unknown>>,
    options?: ChannelLoadOptions,
  ): Promise<ChannelAdapter> {
    const cacheKey = this.buildCacheKey(type, config, options);

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const loader = this.loaders.get(type);
    if (!loader) {
      throw new ChannelNotFoundError(type);
    }

    const loadingPromise = this.loadChannelAdapter(loader, type, config);
    this.cache.set(cacheKey, loadingPromise);

    try {
      return await loadingPromise;
    } catch (error) {
      this.cache.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Find channel types that support all required capabilities.
   *
   * Uses capabilities declared at registration time (no loading needed).
   * Linear scan with early exit on first missing capability.
   *
   * @param required - Map of capability keys that must be present
   * @returns Array of matching channel type identifiers
   */
  findByCapabilities(required: Partial<Record<CapabilityKey, true>>): string[] {
    const requiredKeys = Object.keys(required) as CapabilityKey[];
    const matches: string[] = [];

    for (const [type, caps] of this.registeredCapabilities) {
      let allMatch = true;
      for (const key of requiredKeys) {
        if (caps[key] === undefined) {
          allMatch = false;
          break; // early exit
        }
      }
      if (allMatch) {
        matches.push(type);
      }
    }

    return matches;
  }

  /**
   * Clear all cached adapters and disconnect them
   *
   * Uses Promise.allSettled to resolve all cache entries in parallel,
   * then disconnects all successfully loaded adapters.
   */
  async clear(): Promise<void> {
    const results = await Promise.allSettled(Array.from(this.cache.values()));

    const adapters = results
      .filter((r): r is PromiseFulfilledResult<ChannelAdapter> => r.status === "fulfilled")
      .map((r) => r.value);

    await Promise.allSettled(adapters.map((adapter) => adapter.disconnect()));

    this.cache.clear();
  }

  /**
   * Check if a channel type is registered
   */
  has(type: string): boolean {
    return this.loaders.has(type);
  }

  /**
   * Get all registered channel types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.loaders.keys());
  }

  /**
   * Get capabilities declared at registration time for a channel type
   */
  getCapabilities(type: string): ChannelCapabilities | undefined {
    return this.registeredCapabilities.get(type);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildCacheKey(
    type: string,
    config: Readonly<Record<string, unknown>>,
    options?: ChannelLoadOptions,
  ): string {
    if (options?.instanceKey !== undefined) {
      return `${type}:${options.instanceKey}`;
    }
    return `${type}:${hashConfig(config)}`;
  }

  private async loadChannelAdapter(
    loader: () => Promise<unknown>,
    type: string,
    config: Readonly<Record<string, unknown>>,
  ): Promise<ChannelAdapter> {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic import module shape
    let module: any;

    try {
      module = await loader();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ChannelLoadError(
        type,
        `Import failed: ${message}. Make sure @templar/channel-${type} is installed.`,
        { cause: error instanceof Error ? error : undefined },
      );
    }

    const AdapterClass = module.default;
    if (!AdapterClass) {
      throw new ChannelLoadError(type, "Package must export a default ChannelAdapter class");
    }

    // biome-ignore lint/suspicious/noExplicitAny: Adapter instantiated from dynamic import
    let adapter: any;
    try {
      adapter = new AdapterClass(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ChannelLoadError(type, `Failed to instantiate adapter: ${message}`, {
        cause: error instanceof Error ? error : undefined,
      });
    }

    if (!isChannelAdapter(adapter)) {
      throw new ChannelLoadError(
        type,
        "Invalid adapter: missing required methods (connect, disconnect, send, onMessage) or properties (name, capabilities)",
      );
    }

    return new CapabilityGuard(adapter);
  }
}
