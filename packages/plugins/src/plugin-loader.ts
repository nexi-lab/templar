import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AgentManifest,
  PluginCapability,
  PluginTrust,
  TemplarPluginDefinition,
} from "@templar/core";
import { PluginLoadError } from "@templar/errors";
import { DEFAULT_REGISTER_TIMEOUT_MS, TRUST_CAPABILITIES } from "./constants.js";
import {
  discoverBundledPlugins,
  discoverProjectPlugins,
  discoverUserPlugins,
} from "./plugin-discovery.js";
import { PluginRegistry } from "./plugin-registry.js";
import type { DiscoveredPlugin, PluginLoaderConfig, ResolvedPluginLoaderConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Config resolution
// ---------------------------------------------------------------------------

function resolveConfig(config: PluginLoaderConfig): ResolvedPluginLoaderConfig {
  return {
    projectDir: config.projectDir ?? join(process.cwd(), "templar", "plugins"),
    userDir: config.userDir ?? join(homedir(), ".templar", "plugins"),
    bundledPlugins: config.bundledPlugins ?? [],
    registerTimeoutMs: config.registerTimeoutMs ?? DEFAULT_REGISTER_TIMEOUT_MS,
    onPluginError: config.onPluginError ?? defaultErrorHandler,
  };
}

function defaultErrorHandler(plugin: string, error: Error): void {
  console.warn(`[plugin] Error in "${plugin}": ${error.message}`);
}

// ---------------------------------------------------------------------------
// Trust assignment
// ---------------------------------------------------------------------------

/**
 * Map discovery source to trust tier.
 *
 * Note: `verified` tier is not reachable via FS discovery — verified plugins
 * must be explicitly registered as bundled with `trust: "verified"` overrides.
 */
function trustForSource(source: DiscoveredPlugin["source"]): PluginTrust {
  const s = source;
  switch (s) {
    case "bundled":
      return "bundled";
    case "user":
      return "community";
    case "project":
      return "community";
    default: {
      const _exhaustive: never = s;
      throw new Error(`Unknown plugin source: ${_exhaustive}`);
    }
  }
}

// ---------------------------------------------------------------------------
// loadPlugins — main entry point
// ---------------------------------------------------------------------------

/**
 * Full plugin loading pipeline:
 *
 * 1. DISCOVER — parallel scan of project, user, and bundled tiers
 * 2. DEDUP    — project overrides user overrides bundled (by name)
 * 3. LOAD     — dynamic import() each discovered plugin
 * 4. VALIDATE — check definition shape (name, version, register function)
 * 5. REGISTER — sequential register() calls with per-plugin timeout
 * 6. FREEZE   — lock registry, return frozen result
 */
export async function loadPlugins(
  config: PluginLoaderConfig = {},
  manifest?: AgentManifest,
): Promise<PluginRegistry> {
  const resolved = resolveConfig(config);
  const registry = new PluginRegistry();

  // 1. DISCOVER — parallel scan
  const [projectPlugins, userPlugins] = await Promise.all([
    discoverProjectPlugins(resolved.projectDir),
    discoverUserPlugins(resolved.userDir),
  ]);
  const bundledPlugins = discoverBundledPlugins(resolved.bundledPlugins);

  // 2. DEDUP — project > user > bundled
  const dedupMap = new Map<string, DiscoveredPlugin>();

  // Add bundled first (lowest priority)
  for (const p of bundledPlugins) {
    dedupMap.set(p.name, p);
  }
  // User overrides bundled
  for (const p of userPlugins) {
    dedupMap.set(p.name, p);
  }
  // Project overrides all
  for (const p of projectPlugins) {
    dedupMap.set(p.name, p);
  }

  // If manifest has a plugins section, only load those that are declared
  const manifestPluginConfigs = manifest?.plugins;
  const pluginConfigMap = new Map<string, Record<string, unknown>>();
  if (manifestPluginConfigs) {
    for (const pc of manifestPluginConfigs) {
      if (pc.config) {
        pluginConfigMap.set(pc.name, pc.config);
      }
    }
  }

  // Determine which plugins to load
  const toLoad = manifestPluginConfigs
    ? [...dedupMap.values()].filter((p) => manifestPluginConfigs.some((mc) => mc.name === p.name))
    : [...dedupMap.values()];

  // 3-5. LOAD → VALIDATE → REGISTER (sequential per plugin)
  for (const discovered of toLoad) {
    try {
      const definition = await importPlugin(discovered, resolved.bundledPlugins);
      validateDefinition(definition, discovered.name);

      const trust = trustForSource(discovered.source);
      const pluginConfig = pluginConfigMap.get(discovered.name);

      await registry.add(definition, trust, pluginConfig, resolved.registerTimeoutMs);
    } catch (error) {
      resolved.onPluginError(
        discovered.name,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  // 6. FREEZE
  registry.freeze();
  return registry;
}

// ---------------------------------------------------------------------------
// Import helper
// ---------------------------------------------------------------------------

async function importPlugin(
  discovered: DiscoveredPlugin,
  bundled: readonly TemplarPluginDefinition[],
): Promise<TemplarPluginDefinition> {
  // Bundled plugins are already loaded
  if (discovered.source === "bundled") {
    const found = bundled.find((p) => p.name === discovered.name);
    if (!found) {
      throw new PluginLoadError(discovered.name, "import", "bundled plugin not found in array");
    }
    return found;
  }

  // Dynamic import for project/user plugins
  try {
    const mod = (await import(discovered.path)) as Record<string, unknown>;
    const def = (mod.default ?? mod) as TemplarPluginDefinition;
    return def;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new PluginLoadError(discovered.name, "import", msg);
  }
}

// ---------------------------------------------------------------------------
// Validation helper
// ---------------------------------------------------------------------------

function validateDefinition(
  definition: unknown,
  name: string,
): asserts definition is TemplarPluginDefinition {
  if (!definition || typeof definition !== "object") {
    throw new PluginLoadError(name, "validate", "plugin must export an object");
  }

  const def = definition as Record<string, unknown>;

  if (typeof def.name !== "string" || def.name.length === 0) {
    throw new PluginLoadError(name, "validate", "plugin must have a non-empty 'name' string");
  }

  if (typeof def.version !== "string" || def.version.length === 0) {
    throw new PluginLoadError(name, "validate", "plugin must have a non-empty 'version' string");
  }

  if (!Array.isArray(def.capabilities)) {
    throw new PluginLoadError(name, "validate", "plugin must have a 'capabilities' array");
  }

  // Validate each capability is a known value
  const knownCapabilities = TRUST_CAPABILITIES.bundled; // bundled has all capabilities
  for (const cap of def.capabilities as string[]) {
    if (!knownCapabilities.has(cap as PluginCapability)) {
      throw new PluginLoadError(name, "validate", `unknown capability declared: "${cap}"`);
    }
  }

  if (typeof def.register !== "function") {
    throw new PluginLoadError(name, "validate", "plugin must have a 'register' function");
  }
}
