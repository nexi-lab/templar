import type { ChannelIdentity, ChannelIdentityConfig, IdentityConfig } from "@templar/core";

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
 */
function mergeIdentityConfig(
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

  const result: Record<string, unknown> = {};
  if (name !== undefined) result.name = name;
  if (avatar !== undefined) result.avatar = avatar;
  if (bio !== undefined) result.bio = bio;
  if (systemPromptPrefix !== undefined) result.systemPromptPrefix = systemPromptPrefix;

  return Object.freeze(result) as ChannelIdentityConfig;
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

  const result: Record<string, unknown> = {};
  if (full.name !== undefined) result.name = full.name;
  if (full.avatar !== undefined) result.avatar = full.avatar;
  if (full.bio !== undefined) result.bio = full.bio;

  return Object.freeze(result) as ChannelIdentity;
}
