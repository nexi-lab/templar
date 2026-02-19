import type { ChannelModule } from "./channel-types.js";
import type { ToolConfig } from "./config-types.js";
import type { TemplarMiddleware } from "./middleware-types.js";

// ---------------------------------------------------------------------------
// Trust Tiers (TEMPLAR.md Section 8.4)
// ---------------------------------------------------------------------------

/** Trust tier determines which capabilities a plugin may use. */
export type PluginTrust = "bundled" | "verified" | "community";

// ---------------------------------------------------------------------------
// Capability Declarations
// ---------------------------------------------------------------------------

/**
 * Capabilities a plugin may declare.
 *
 * Fine-grained sub-capabilities (e.g. `middleware:wrapModel`) allow trust
 * enforcement to deny community plugins from wrapping model/tool calls
 * while still permitting observer-only middleware.
 */
export type PluginCapability =
  | "tools"
  | "channels"
  | "middleware"
  | "middleware:wrapModel"
  | "middleware:wrapTool"
  | "hooks"
  | "hooks:interceptor"
  | "skills"
  | "providers"
  | "nexus";

// ---------------------------------------------------------------------------
// Plugin Definition (what plugin authors implement)
// ---------------------------------------------------------------------------

/**
 * The shape every Templar plugin must implement.
 *
 * Plugin authors export a default conforming object from their package.
 */
export interface TemplarPluginDefinition {
  /** Unique plugin name (e.g. "@acme/weather-tools") */
  readonly name: string;
  /** Semver version string */
  readonly version: string;
  /** Capabilities this plugin needs (enforced at registration time) */
  readonly capabilities: readonly PluginCapability[];
  /** Called during assembly — use `api` to register tools, middleware, etc. */
  register(api: TemplarPluginApi, config?: Record<string, unknown>): Promise<void>;
  /** Optional cleanup hook called during shutdown */
  teardown?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Scoped Collector API (what plugins receive during register())
// ---------------------------------------------------------------------------

/**
 * Scoped API passed to each plugin's `register()` method.
 *
 * Each method validates the plugin's declared capabilities and trust tier
 * before accepting the registration.
 */
export interface TemplarPluginApi {
  /** Name of the owning plugin (for diagnostics and namespacing). */
  readonly pluginName: string;
  /** Trust tier assigned to this plugin. */
  readonly trust: PluginTrust;

  registerTool(tool: ToolConfig): void;
  registerChannel(channel: ChannelModule): void;
  registerMiddleware(middleware: TemplarMiddleware): void;
  registerHook(event: string, handler: (...args: readonly unknown[]) => unknown): void;
  registerSkillDir(path: string): void;
  registerProvider(name: string, provider: unknown): void;
}

// ---------------------------------------------------------------------------
// Plugin Config in Manifest
// ---------------------------------------------------------------------------

/** Per-plugin entry in the `plugins:` section of `templar.yaml`. */
export interface PluginConfig {
  /** Plugin package name or path */
  readonly name: string;
  /** Plugin-specific configuration passed to `register()` */
  readonly config?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Plugin Manifest Snapshot (retained after assembly for diagnostics)
// ---------------------------------------------------------------------------

/**
 * Slim metadata snapshot kept after the plugin registry is frozen.
 * Code references are released; only metadata is retained.
 */
export interface PluginManifestSnapshot {
  readonly name: string;
  readonly version: string;
  readonly trust: PluginTrust;
  readonly capabilities: readonly PluginCapability[];
  readonly registeredAt: number;
}

// ---------------------------------------------------------------------------
// Plugin Assembly Result (output of plugin loading, input to engine)
// ---------------------------------------------------------------------------

/**
 * Merged result from all plugin registrations.
 *
 * Produced by `assemblePlugins()` in `@templar/plugins`,
 * consumed by `createTemplar()` in `@templar/engine`.
 */
export interface PluginAssemblyResult {
  readonly tools: readonly ToolConfig[];
  readonly channels: readonly ChannelModule[];
  readonly middleware: readonly TemplarMiddleware[];
  readonly hooks: readonly {
    readonly event: string;
    readonly handler: (...args: readonly unknown[]) => unknown;
  }[];
  readonly skillDirs: readonly string[];
  readonly providers: ReadonlyMap<string, unknown>;
  readonly snapshots: readonly PluginManifestSnapshot[];
}
