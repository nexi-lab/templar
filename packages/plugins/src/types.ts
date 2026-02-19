import type { TemplarPluginDefinition } from "@templar/core";

/**
 * Configuration for the plugin loader.
 */
export interface PluginLoaderConfig {
  /** Directory for project-local plugins (default: cwd + "/templar/plugins") */
  readonly projectDir?: string;
  /** Directory for user-global plugins (default: homedir + "/.templar/plugins") */
  readonly userDir?: string;
  /** Statically imported bundled plugins */
  readonly bundledPlugins?: readonly TemplarPluginDefinition[];
  /** Timeout per-plugin register() call in ms (default: 5000) */
  readonly registerTimeoutMs?: number;
  /** Error callback — non-fatal plugin errors are reported here */
  readonly onPluginError?: (plugin: string, error: Error) => void;
}

/**
 * Resolved configuration with all defaults applied.
 */
export interface ResolvedPluginLoaderConfig {
  readonly projectDir: string;
  readonly userDir: string;
  readonly bundledPlugins: readonly TemplarPluginDefinition[];
  readonly registerTimeoutMs: number;
  readonly onPluginError: (plugin: string, error: Error) => void;
}

/** Source tier from which a plugin was discovered. */
export type PluginSource = "project" | "user" | "bundled";

/** Result of the discovery phase — a plugin path + metadata. */
export interface DiscoveredPlugin {
  readonly name: string;
  readonly path: string;
  readonly source: PluginSource;
}
