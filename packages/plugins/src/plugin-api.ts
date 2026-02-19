import type {
  ChannelModule,
  PluginCapability,
  PluginTrust,
  TemplarMiddleware,
  TemplarPluginApi,
  ToolConfig,
} from "@templar/core";
import { PluginCapabilityError } from "@templar/errors";
import { TRUST_CAPABILITIES } from "./constants.js";

// ---------------------------------------------------------------------------
// Registration Snapshot (returned after register phase)
// ---------------------------------------------------------------------------

/** All items collected by a single plugin during register(). */
export interface PluginRegistrations {
  readonly tools: readonly ToolConfig[];
  readonly channels: readonly ChannelModule[];
  readonly middleware: readonly TemplarMiddleware[];
  readonly hooks: readonly HookRegistration[];
  readonly skillDirs: readonly string[];
  readonly providers: ReadonlyMap<string, unknown>;
}

export interface HookRegistration {
  readonly event: string;
  readonly handler: (...args: readonly unknown[]) => unknown;
}

// ---------------------------------------------------------------------------
// PluginApiImpl — Scoped Collector
// ---------------------------------------------------------------------------

/**
 * Scoped collector implementing `TemplarPluginApi`.
 *
 * Each plugin gets its own instance. The `validateAndCollect` helper
 * ensures capability + trust checks are applied uniformly for all
 * registration methods.
 */
export class PluginApiImpl implements TemplarPluginApi {
  readonly pluginName: string;
  readonly trust: PluginTrust;

  private readonly declaredCapabilities: ReadonlySet<PluginCapability>;
  private readonly allowedCapabilities: ReadonlySet<PluginCapability>;

  private readonly _tools: ToolConfig[] = [];
  private readonly _channels: ChannelModule[] = [];
  private readonly _middleware: TemplarMiddleware[] = [];
  private readonly _hooks: HookRegistration[] = [];
  private readonly _skillDirs: string[] = [];
  private readonly _providers: Map<string, unknown> = new Map();

  constructor(pluginName: string, trust: PluginTrust, capabilities: readonly PluginCapability[]) {
    this.pluginName = pluginName;
    this.trust = trust;
    this.declaredCapabilities = new Set(capabilities);
    this.allowedCapabilities = TRUST_CAPABILITIES[trust];
  }

  registerTool(tool: ToolConfig): void {
    this.validateAndCollect("tools");
    this._tools.push(tool);
  }

  registerChannel(channel: ChannelModule): void {
    this.validateAndCollect("channels");
    this._channels.push(channel);
  }

  registerMiddleware(middleware: TemplarMiddleware): void {
    this.validateAndCollect("middleware");
    // Additionally check wrapModel / wrapTool sub-capabilities
    if (middleware.wrapModelCall) {
      this.validateAndCollect("middleware:wrapModel");
    }
    if (middleware.wrapToolCall) {
      this.validateAndCollect("middleware:wrapTool");
    }
    this._middleware.push(middleware);
  }

  registerHook(event: string, handler: (...args: readonly unknown[]) => unknown): void {
    this.validateAndCollect("hooks");
    this._hooks.push({ event, handler });
  }

  registerSkillDir(path: string): void {
    this.validateAndCollect("skills");
    this._skillDirs.push(path);
  }

  registerProvider(name: string, provider: unknown): void {
    this.validateAndCollect("providers");
    this._providers.set(name, provider);
  }

  /** Returns an immutable snapshot of everything this plugin registered. */
  getRegistrations(): PluginRegistrations {
    return {
      tools: [...this._tools],
      channels: [...this._channels],
      middleware: [...this._middleware],
      hooks: [...this._hooks],
      skillDirs: [...this._skillDirs],
      providers: new Map(this._providers),
    };
  }

  /** Clears internal references (called after assembly to free memory). */
  dispose(): void {
    this._tools.length = 0;
    this._channels.length = 0;
    this._middleware.length = 0;
    this._hooks.length = 0;
    this._skillDirs.length = 0;
    this._providers.clear();
  }

  // -------------------------------------------------------------------------
  // Private helper — DRY capability + trust validation
  // -------------------------------------------------------------------------

  private validateAndCollect(capability: PluginCapability): void {
    // 1. Plugin must declare the capability
    if (!this.declaredCapabilities.has(capability)) {
      throw new PluginCapabilityError(
        this.pluginName,
        capability,
        `capability not declared in plugin definition`,
      );
    }
    // 2. Trust tier must allow the capability
    if (!this.allowedCapabilities.has(capability)) {
      throw new PluginCapabilityError(
        this.pluginName,
        capability,
        `trust tier "${this.trust}" does not allow this capability`,
      );
    }
  }
}
