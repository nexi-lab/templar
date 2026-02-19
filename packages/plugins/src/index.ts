// ---------------------------------------------------------------------------
// @templar/plugins — Three-tier plugin discovery & registration (#108)
// ---------------------------------------------------------------------------

export type { PluginAssemblyResult } from "@templar/core";
// Constants
export { DEFAULT_REGISTER_TIMEOUT_MS, TRUST_CAPABILITIES } from "./constants.js";
// Plugin API (scoped collector)
export { type HookRegistration, PluginApiImpl, type PluginRegistrations } from "./plugin-api.js";
// Assembler
export { assemblePlugins } from "./plugin-assembler.js";
// Discovery
export {
  discoverBundledPlugins,
  discoverProjectPlugins,
  discoverUserPlugins,
} from "./plugin-discovery.js";
// Loader (main entry point)
export { loadPlugins } from "./plugin-loader.js";
// Plugin Registry
export { PluginRegistry } from "./plugin-registry.js";
// Types
export type {
  DiscoveredPlugin,
  PluginLoaderConfig,
  PluginSource,
  ResolvedPluginLoaderConfig,
} from "./types.js";

// Package metadata
export const PACKAGE_NAME = "@templar/plugins";
