import type { ChannelIdentity, ChannelIdentityConfig, IdentityConfig } from "@templar/core";

/**
 * Remove keys with undefined values and freeze the result.
 * Accepts a Record where values may be undefined (from pick()),
 * strips them, and returns a frozen object typed as T.
 */
function freezeWithoutUndefined<T extends object>(obj: Record<string, unknown>): T {
  return Object.freeze(
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)),
  ) as T;
}

/**
 * Pick the channel-level value if defined, otherwise fall back to default.
 * Empty strings are intentional overrides (not fallback triggers).
 */
function pick<T>(channelVal: T | undefined, defaultVal: T | undefined): T | undefined {
  return channelVal !== undefined ? channelVal : defaultVal;
}

/**
 * Merge channel override and default into a ChannelIdentityConfig.
 * Returns undefined if all fields are absent.
 *
 * Exported for use in 3-level cascade (session → channel → default).
 */
export function mergeIdentityConfig(
  channelOverride: ChannelIdentityConfig | undefined,
  defaultIdentity: ChannelIdentityConfig | undefined,
): ChannelIdentityConfig | undefined {
  const name = pick(channelOverride?.name, defaultIdentity?.name);
  const avatar = pick(channelOverride?.avatar, defaultIdentity?.avatar);
  const bio = pick(channelOverride?.bio, defaultIdentity?.bio);
  const systemPromptPrefix = pick(
    channelOverride?.systemPromptPrefix,
    defaultIdentity?.systemPromptPrefix,
  );

  if (
    name === undefined &&
    avatar === undefined &&
    bio === undefined &&
    systemPromptPrefix === undefined
  ) {
    return undefined;
  }

  return freezeWithoutUndefined<ChannelIdentityConfig>({
    name,
    avatar,
    bio,
    systemPromptPrefix,
  });
}

/**
 * Resolve identity for a specific channel type.
 * 2-level cascade: channel override -> default.
 * Returns a new frozen object (never mutates input).
 * Returns undefined if no identity configured.
 */
export function resolveIdentity(
  config: IdentityConfig | undefined,
  channelType: string,
): ChannelIdentityConfig | undefined {
  if (config === undefined) return undefined;

  const channelOverride = config.channels?.[channelType];
  const defaultIdentity = config.default;

  if (channelOverride === undefined && defaultIdentity === undefined) {
    return undefined;
  }

  return mergeIdentityConfig(channelOverride, defaultIdentity);
}

/**
 * Resolve identity with a 3-level cascade: session → channel → default.
 *
 * Session-level override takes precedence over channel, which takes precedence
 * over default. Each level merges field-by-field (most specific wins per field).
 * Returns a new frozen object (never mutates input).
 */
export function resolveIdentityWithSession(
  config: IdentityConfig | undefined,
  channelType: string,
  sessionOverride?: ChannelIdentityConfig,
): ChannelIdentityConfig | undefined {
  const baseResolved = resolveIdentity(config, channelType);
  if (sessionOverride === undefined) return baseResolved;
  return mergeIdentityConfig(sessionOverride, baseResolved);
}

/**
 * Resolve only the visual identity (name, avatar, bio) — no systemPromptPrefix.
 * Used when attaching to OutboundMessage.
 */
export function resolveChannelIdentity(
  config: IdentityConfig | undefined,
  channelType: string,
): ChannelIdentity | undefined {
  const full = resolveIdentity(config, channelType);
  if (full === undefined) return undefined;

  if (full.name === undefined && full.avatar === undefined && full.bio === undefined) {
    return undefined;
  }

  return freezeWithoutUndefined<ChannelIdentity>({
    name: full.name,
    avatar: full.avatar,
    bio: full.bio,
  });
}
