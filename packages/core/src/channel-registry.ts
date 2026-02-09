import { ChannelLoadError, ChannelNotFoundError } from "@templar/errors";
import type { ChannelAdapter } from "./types.js";
import { isChannelAdapter } from "./type-guards.js";

/**
 * Registry for lazy-loading channel adapters
 *
 * Manages dynamic loading of channel implementations using the registry pattern.
 * Channels are loaded on-demand and cached for performance.
 *
 * @example
 * ```typescript
 * const registry = new ChannelRegistry();
 *
 * // Register channel loaders
 * registry.register('slack', () => import('@templar/channel-slack'));
 * registry.register('discord', () => import('@templar/channel-discord'));
 *
 * // Lazy load on first use
 * const adapter = await registry.load('slack', { token: '...' });
 * await adapter.connect();
 * ```
 */
export class ChannelRegistry {
  private loaders = new Map<string, () => Promise<any>>();
  private cache = new Map<string, Promise<ChannelAdapter>>();
  private instances = new WeakMap<ChannelAdapter, true>();

  /**
   * Register a channel type with its lazy loader
   *
   * @param type - Channel type identifier (e.g., 'slack', 'discord')
   * @param loader - Function that dynamically imports the channel package
   *
   * @example
   * ```typescript
   * registry.register('slack', () => import('@templar/channel-slack'));
   * ```
   */
  register(type: string, loader: () => Promise<any>): void {
    if (this.loaders.has(type)) {
      throw new Error(`Channel type '${type}' is already registered`);
    }
    this.loaders.set(type, loader);
  }

  /**
   * Load a channel adapter (lazy, with caching)
   *
   * On first call: Dynamically imports the package, validates it, caches the promise.
   * On subsequent calls: Returns cached promise (deduplicates concurrent loads).
   *
   * @param type - Channel type to load
   * @param config - Channel-specific configuration
   * @returns Promise resolving to the channel adapter instance
   * @throws {ChannelNotFoundError} If channel type not registered
   * @throws {ChannelLoadError} If import fails or adapter is invalid
   */
  async load(type: string, config: Record<string, unknown>): Promise<ChannelAdapter> {
    // Check if already cached (promise deduplication)
    const cached = this.cache.get(type);
    if (cached) {
      return cached;
    }

    // Get loader for this type
    const loader = this.loaders.get(type);
    if (!loader) {
      throw new ChannelNotFoundError(type);
    }

    // Create loading promise and cache it immediately (handles concurrent requests)
    const loadingPromise = this.loadChannelAdapter(loader, type, config);
    this.cache.set(type, loadingPromise);

    try {
      const adapter = await loadingPromise;
      this.instances.set(adapter, true);
      return adapter;
    } catch (error) {
      // Remove failed load from cache so it can be retried
      this.cache.delete(type);
      throw error;
    }
  }

  /**
   * Internal method to load and validate channel adapter
   */
  private async loadChannelAdapter(
    loader: () => Promise<any>,
    type: string,
    config: Record<string, unknown>,
  ): Promise<ChannelAdapter> {
    let module: any;

    // Step 1: Dynamic import
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

    // Step 2: Extract default export
    const AdapterClass = module.default;
    if (!AdapterClass) {
      throw new ChannelLoadError(
        type,
        `Package must export a default ChannelAdapter class`,
      );
    }

    // Step 3: Instantiate adapter
    let adapter: any;
    try {
      adapter = new AdapterClass(config);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ChannelLoadError(
        type,
        `Failed to instantiate adapter: ${message}`,
        { cause: error instanceof Error ? error : undefined },
      );
    }

    // Step 4: Runtime type validation
    if (!isChannelAdapter(adapter)) {
      throw new ChannelLoadError(
        type,
        `Invalid adapter: missing required methods (connect, disconnect, send, onMessage) or properties (name, capabilities)`,
      );
    }

    return adapter;
  }

  /**
   * Clear all cached adapters and disconnect them
   *
   * Calls disconnect() on all loaded adapters and clears the cache.
   * Use this when shutting down the agent to clean up resources.
   */
  async clear(): Promise<void> {
    const adapters: ChannelAdapter[] = [];

    // Collect all loaded adapters
    for (const promise of this.cache.values()) {
      try {
        const adapter = await promise;
        adapters.push(adapter);
      } catch {
        // Ignore failed loads
      }
    }

    // Disconnect all adapters
    await Promise.allSettled(
      adapters.map(adapter => adapter.disconnect()),
    );

    // Clear caches
    this.cache.clear();
    // Note: WeakMap automatically cleans up when adapters are GC'd
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
}
