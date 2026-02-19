import type { PluginManifestSnapshot, PluginTrust, TemplarPluginDefinition } from "@templar/core";
import { PluginLifecycleError, PluginRegistrationError } from "@templar/errors";
import { DEFAULT_REGISTER_TIMEOUT_MS } from "./constants.js";
import { PluginApiImpl, type PluginRegistrations } from "./plugin-api.js";

// ---------------------------------------------------------------------------
// Registry Entry (internal)
// ---------------------------------------------------------------------------

interface RegistryEntry {
  readonly definition: TemplarPluginDefinition;
  readonly trust: PluginTrust;
  readonly api: PluginApiImpl;
  readonly snapshot: PluginManifestSnapshot;
}

// ---------------------------------------------------------------------------
// PluginRegistry
// ---------------------------------------------------------------------------

/**
 * Accumulates registered plugins and their contributions.
 *
 * After all plugins are registered, call `freeze()` to lock the registry
 * and release code references, retaining only slim metadata snapshots.
 */
export class PluginRegistry {
  private readonly entries: RegistryEntry[] = [];
  private frozen = false;

  /**
   * Register a single plugin: create its scoped API, call `register()`,
   * and store the result.
   */
  async add(
    definition: TemplarPluginDefinition,
    trust: PluginTrust,
    config?: Record<string, unknown>,
    timeoutMs: number = DEFAULT_REGISTER_TIMEOUT_MS,
  ): Promise<void> {
    if (this.frozen) {
      throw new PluginRegistrationError(definition.name, "registry is frozen");
    }

    // Detect duplicate names
    const existing = this.entries.find((e) => e.definition.name === definition.name);
    if (existing) {
      throw new PluginRegistrationError(
        definition.name,
        `duplicate plugin name (already registered from ${existing.trust} tier)`,
      );
    }

    const api = new PluginApiImpl(definition.name, trust, definition.capabilities);

    // Call register() with timeout (timer is cleaned up on success or failure)
    let timerId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error(`register() timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      });
      await Promise.race([definition.register(api, config), timeoutPromise]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new PluginLifecycleError(definition.name, "register", msg);
    } finally {
      clearTimeout(timerId);
    }

    const snapshot: PluginManifestSnapshot = {
      name: definition.name,
      version: definition.version,
      trust,
      capabilities: [...definition.capabilities],
      registeredAt: Date.now(),
    };

    this.entries.push({ definition, trust, api, snapshot });
  }

  /**
   * Freeze the registry — no more plugins can be added.
   * Returns the metadata snapshots.
   */
  freeze(): readonly PluginManifestSnapshot[] {
    this.frozen = true;
    return this.entries.map((e) => e.snapshot);
  }

  /** Whether the registry has been frozen. */
  get isFrozen(): boolean {
    return this.frozen;
  }

  /** Returns metadata snapshots for all registered plugins. */
  getSnapshots(): readonly PluginManifestSnapshot[] {
    return this.entries.map((e) => e.snapshot);
  }

  /** Returns all registrations from all plugins (for assembly). */
  getAllRegistrations(): ReadonlyMap<string, PluginRegistrations> {
    const map = new Map<string, PluginRegistrations>();
    for (const entry of this.entries) {
      map.set(entry.definition.name, entry.api.getRegistrations());
    }
    return map;
  }

  /** Returns the trust tier for a given plugin. */
  getTrust(pluginName: string): PluginTrust | undefined {
    return this.entries.find((e) => e.definition.name === pluginName)?.trust;
  }

  /** Number of registered plugins. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Dispose all plugins: call teardown() on each, then dispose the API.
   * Errors are collected but do not halt the process.
   */
  async dispose(): Promise<void> {
    const errors: Error[] = [];

    for (const entry of this.entries) {
      if (entry.definition.teardown) {
        try {
          await entry.definition.teardown();
        } catch (error) {
          errors.push(
            new PluginLifecycleError(
              entry.definition.name,
              "teardown",
              error instanceof Error ? error.message : String(error),
            ),
          );
        }
      }
      entry.api.dispose();
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} plugin(s) failed during teardown`);
    }
  }
}
