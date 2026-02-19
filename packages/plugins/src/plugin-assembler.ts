import type {
  ChannelModule,
  PluginAssemblyResult,
  TemplarMiddleware,
  ToolConfig,
} from "@templar/core";
import type { HookRegistration } from "./plugin-api.js";
import type { PluginRegistry } from "./plugin-registry.js";

// ---------------------------------------------------------------------------
// Trust ordering for middleware merge
// ---------------------------------------------------------------------------

const TRUST_ORDER: Record<string, number> = {
  bundled: 0,
  verified: 1,
  community: 2,
};

// ---------------------------------------------------------------------------
// assemblePlugins
// ---------------------------------------------------------------------------

/**
 * Merge all plugin registrations into a single `PluginAssemblyResult`.
 *
 * Middleware is ordered: bundled first, then verified, then community.
 * All other collections are simply concatenated.
 */
export function assemblePlugins(registry: PluginRegistry): PluginAssemblyResult {
  const allRegistrations = registry.getAllRegistrations();
  const snapshots = registry.getSnapshots();

  const tools: ToolConfig[] = [];
  const channels: ChannelModule[] = [];
  const hooks: HookRegistration[] = [];
  const skillDirs: string[] = [];
  const providers = new Map<string, unknown>();

  // Middleware needs trust-based ordering
  const middlewareEntries: Array<{ trust: string; middleware: TemplarMiddleware }> = [];

  for (const [pluginName, registrations] of allRegistrations) {
    tools.push(...registrations.tools);
    channels.push(...registrations.channels);
    hooks.push(...registrations.hooks);
    skillDirs.push(...registrations.skillDirs);

    for (const [name, provider] of registrations.providers) {
      providers.set(`${pluginName}/${name}`, provider);
    }

    const trust = registry.getTrust(pluginName) ?? "community";
    for (const mw of registrations.middleware) {
      middlewareEntries.push({ trust, middleware: mw });
    }
  }

  // Sort middleware: bundled → verified → community
  middlewareEntries.sort((a, b) => (TRUST_ORDER[a.trust] ?? 99) - (TRUST_ORDER[b.trust] ?? 99));

  return {
    tools,
    channels,
    middleware: middlewareEntries.map((e) => e.middleware),
    hooks,
    skillDirs,
    providers,
    snapshots,
  };
}
