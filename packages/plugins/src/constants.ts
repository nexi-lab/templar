import type { PluginCapability, PluginTrust } from "@templar/core";

/**
 * Trust tier → allowed capabilities matrix.
 *
 * - bundled:   ALL capabilities (first-party plugins)
 * - verified:  ALL capabilities (audited third-party)
 * - community: tools, channels, hooks (observer-only), skills
 */
export const TRUST_CAPABILITIES: Readonly<Record<PluginTrust, ReadonlySet<PluginCapability>>> = {
  bundled: new Set<PluginCapability>([
    "tools",
    "channels",
    "middleware",
    "middleware:wrapModel",
    "middleware:wrapTool",
    "hooks",
    "hooks:interceptor",
    "skills",
    "providers",
    "nexus",
  ]),
  verified: new Set<PluginCapability>([
    "tools",
    "channels",
    "middleware",
    "middleware:wrapModel",
    "middleware:wrapTool",
    "hooks",
    "hooks:interceptor",
    "skills",
    "providers",
    "nexus",
  ]),
  community: new Set<PluginCapability>(["tools", "channels", "hooks", "skills"]),
};

/** Default timeout for a single plugin's register() call (ms). */
export const DEFAULT_REGISTER_TIMEOUT_MS = 5_000;
