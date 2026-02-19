import type { ChannelIdentityConfig, IdentityConfig } from "@templar/core";
import { describe, expect, it } from "vitest";
import {
  mergeIdentityConfig,
  resolveChannelIdentity,
  resolveIdentity,
  resolveIdentityWithSession,
} from "../resolver.js";

describe("resolveIdentity", () => {
  // #1 — No config (undefined)
  it("returns undefined when config is undefined", () => {
    expect(resolveIdentity(undefined, "slack")).toBeUndefined();
  });

  // #2 — Empty config
  it("returns undefined for empty config", () => {
    expect(resolveIdentity({}, "slack")).toBeUndefined();
  });

  // #3 — Default only
  it("returns default when no channel override", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://a.png", bio: "A bot" },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      name: "Bot",
      avatar: "https://a.png",
      bio: "A bot",
    });
  });

  // #4 — Channel override exists
  it("returns channel override when present", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
      channels: {
        slack: { name: "Slack Bot", avatar: "https://slack.png" },
      },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      name: "Slack Bot",
      avatar: "https://slack.png",
    });
  });

  // #5 — Partial channel + full default merges field-level
  it("merges partial channel override with full default", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://default.png", bio: "Default bio" },
      channels: {
        slack: { name: "Slack Bot" },
      },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      name: "Slack Bot",
      avatar: "https://default.png",
      bio: "Default bio",
    });
  });

  // #6 — Channel has all fields — channel wins entirely
  it("returns channel identity when it has all fields", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://default.png", bio: "Default" },
      channels: {
        slack: { name: "Slack Bot", avatar: "https://slack.png", bio: "Slack bio" },
      },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      name: "Slack Bot",
      avatar: "https://slack.png",
      bio: "Slack bio",
    });
  });

  // #7 — Unknown channel type falls back to default
  it("falls back to default for unknown channel type", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
      channels: { slack: { name: "Slack Bot" } },
    };
    expect(resolveIdentity(config, "telegram")).toEqual({ name: "Bot" });
  });

  // #8 — Empty string name on channel is intentional override
  it("treats empty string as intentional override", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
      channels: { slack: { name: "" } },
    };
    expect(resolveIdentity(config, "slack")).toEqual({ name: "" });
  });

  // #9 — Default has systemPromptPrefix, channel doesn't
  it("returns default systemPromptPrefix when channel has none", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", systemPromptPrefix: "You are a helpful bot." },
      channels: { slack: { name: "Slack Bot" } },
    };
    const result = resolveIdentity(config, "slack");
    expect(result).toEqual({
      name: "Slack Bot",
      systemPromptPrefix: "You are a helpful bot.",
    });
  });

  // #10 — Both have systemPromptPrefix, channel wins
  it("uses channel systemPromptPrefix over default", () => {
    const config: IdentityConfig = {
      default: { systemPromptPrefix: "Default prefix" },
      channels: { slack: { systemPromptPrefix: "Slack prefix" } },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      systemPromptPrefix: "Slack prefix",
    });
  });

  // #11 — Channel has prefix, no default
  it("returns channel systemPromptPrefix when no default exists", () => {
    const config: IdentityConfig = {
      channels: { slack: { systemPromptPrefix: "Slack prefix" } },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      systemPromptPrefix: "Slack prefix",
    });
  });

  // #12 — Input config is frozen, returns new object (no mutation)
  it("returns a new frozen object, does not mutate input", () => {
    const config: IdentityConfig = Object.freeze({
      default: Object.freeze({ name: "Bot", avatar: "https://a.png" }),
    });
    const result = resolveIdentity(config, "slack");
    expect(result).toEqual({ name: "Bot", avatar: "https://a.png" });
    expect(result).not.toBe(config.default);
    expect(Object.isFrozen(result)).toBe(true);
  });

  // #14 — Multiple channels resolve independently
  it("resolves different identities per channel type", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", bio: "Default" },
      channels: {
        slack: { name: "Slack Bot" },
        whatsapp: { name: "WA Bot", bio: "WhatsApp bio" },
      },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      name: "Slack Bot",
      bio: "Default",
    });
    expect(resolveIdentity(config, "whatsapp")).toEqual({
      name: "WA Bot",
      bio: "WhatsApp bio",
    });
  });

  // #16 — Undefined fields fall through to default
  it("skips undefined channel fields and uses default", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://default.png" },
      channels: {
        slack: { avatar: "https://slack.png" },
      },
    };
    expect(resolveIdentity(config, "slack")).toEqual({
      name: "Bot",
      avatar: "https://slack.png",
    });
  });

  // #17 — Config with channels but no matching channel falls back to default
  it("falls back to default when channels exist but none match", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
      channels: { discord: { name: "Discord Bot" } },
    };
    expect(resolveIdentity(config, "slack")).toEqual({ name: "Bot" });
  });

  // #18 — Config with channels but no default and no match
  it("returns undefined when channels exist but no match and no default", () => {
    const config: IdentityConfig = {
      channels: { discord: { name: "Discord Bot" } },
    };
    expect(resolveIdentity(config, "slack")).toBeUndefined();
  });

  // #19 — Both default and channel override are empty objects
  it("returns undefined when both default and channel are empty objects", () => {
    const config: IdentityConfig = {
      default: {},
      channels: { slack: {} },
    };
    expect(resolveIdentity(config, "slack")).toBeUndefined();
  });
});

describe("resolveChannelIdentity", () => {
  // #13 — Excludes systemPromptPrefix
  it("excludes systemPromptPrefix from result", () => {
    const config: IdentityConfig = {
      default: {
        name: "Bot",
        avatar: "https://a.png",
        bio: "A bot",
        systemPromptPrefix: "You are helpful.",
      },
    };
    const result = resolveChannelIdentity(config, "slack");
    expect(result).toEqual({
      name: "Bot",
      avatar: "https://a.png",
      bio: "A bot",
    });
    expect(result).not.toHaveProperty("systemPromptPrefix");
  });

  // #15 — Default only, resolveChannelIdentity returns visual fields
  it("returns only visual fields from default", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", systemPromptPrefix: "Prefix" },
    };
    const result = resolveChannelIdentity(config, "slack");
    expect(result).toEqual({ name: "Bot" });
    expect(result).not.toHaveProperty("systemPromptPrefix");
  });

  it("returns undefined when config is undefined", () => {
    expect(resolveChannelIdentity(undefined, "slack")).toBeUndefined();
  });

  it("returns undefined when only systemPromptPrefix exists", () => {
    const config: IdentityConfig = {
      default: { systemPromptPrefix: "Prefix only" },
    };
    expect(resolveChannelIdentity(config, "slack")).toBeUndefined();
  });

  it("returns frozen result", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
    };
    const result = resolveChannelIdentity(config, "slack");
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("mergeIdentityConfig", () => {
  it("returns override when base is undefined", () => {
    const override: ChannelIdentityConfig = { name: "Session Bot" };
    expect(mergeIdentityConfig(override, undefined)).toEqual({ name: "Session Bot" });
  });

  it("returns base when override is undefined", () => {
    const base: ChannelIdentityConfig = { name: "Default Bot" };
    expect(mergeIdentityConfig(undefined, base)).toEqual({ name: "Default Bot" });
  });

  it("returns undefined when both are undefined", () => {
    expect(mergeIdentityConfig(undefined, undefined)).toBeUndefined();
  });

  it("override field wins over base field", () => {
    const override: ChannelIdentityConfig = { name: "Override" };
    const base: ChannelIdentityConfig = { name: "Base", avatar: "https://base.png" };
    expect(mergeIdentityConfig(override, base)).toEqual({
      name: "Override",
      avatar: "https://base.png",
    });
  });

  it("returns frozen result", () => {
    const result = mergeIdentityConfig({ name: "A" }, { avatar: "https://b.png" });
    expect(Object.isFrozen(result)).toBe(true);
  });
});

describe("resolveIdentityWithSession", () => {
  // #S1 — No session override, delegates to 2-level resolve
  it("returns 2-level result when no session override", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
      channels: { slack: { name: "Slack Bot" } },
    };
    expect(resolveIdentityWithSession(config, "slack")).toEqual({ name: "Slack Bot" });
  });

  // #S2 — Session override wins over channel
  it("session override wins over channel override", () => {
    const config: IdentityConfig = {
      default: { name: "Bot" },
      channels: { slack: { name: "Slack Bot" } },
    };
    const session: ChannelIdentityConfig = { name: "Session Bot" };
    expect(resolveIdentityWithSession(config, "slack", session)).toEqual({
      name: "Session Bot",
    });
  });

  // #S3 — Session override wins over default
  it("session override wins over default", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://default.png" },
    };
    const session: ChannelIdentityConfig = { name: "Session Bot" };
    expect(resolveIdentityWithSession(config, "slack", session)).toEqual({
      name: "Session Bot",
      avatar: "https://default.png",
    });
  });

  // #S4 — Session merges with channel + default field-by-field
  it("session merges field-by-field across all three levels", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://default.png", bio: "Default bio" },
      channels: { slack: { avatar: "https://slack.png" } },
    };
    const session: ChannelIdentityConfig = { bio: "Session bio" };
    expect(resolveIdentityWithSession(config, "slack", session)).toEqual({
      name: "Bot",
      avatar: "https://slack.png",
      bio: "Session bio",
    });
  });

  // #S5 — Session with systemPromptPrefix overrides
  it("session systemPromptPrefix overrides channel and default", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", systemPromptPrefix: "Default prefix" },
      channels: { slack: { systemPromptPrefix: "Slack prefix" } },
    };
    const session: ChannelIdentityConfig = { systemPromptPrefix: "Session prefix" };
    expect(resolveIdentityWithSession(config, "slack", session)).toEqual({
      name: "Bot",
      systemPromptPrefix: "Session prefix",
    });
  });

  // #S6 — Session override with empty string is intentional
  it("session empty string overrides non-empty values", () => {
    const config: IdentityConfig = { default: { name: "Bot" } };
    const session: ChannelIdentityConfig = { name: "" };
    expect(resolveIdentityWithSession(config, "slack", session)).toEqual({ name: "" });
  });

  // #S7 — Session override when config is undefined
  it("session override works when config is undefined", () => {
    const session: ChannelIdentityConfig = { name: "Session Bot" };
    expect(resolveIdentityWithSession(undefined, "slack", session)).toEqual({
      name: "Session Bot",
    });
  });

  // #S8 — All three levels empty → undefined
  it("returns undefined when all three levels are empty", () => {
    expect(resolveIdentityWithSession({}, "slack", {})).toBeUndefined();
  });

  // #S9 — Session override only (no config, no channel)
  it("returns session identity when only session override exists", () => {
    const session: ChannelIdentityConfig = {
      name: "Session Bot",
      avatar: "https://session.png",
    };
    expect(resolveIdentityWithSession(undefined, "slack", session)).toEqual({
      name: "Session Bot",
      avatar: "https://session.png",
    });
  });

  // #S10 — Returns frozen result
  it("returns frozen result", () => {
    const config: IdentityConfig = { default: { name: "Bot" } };
    const session: ChannelIdentityConfig = { avatar: "https://s.png" };
    const result = resolveIdentityWithSession(config, "slack", session);
    expect(Object.isFrozen(result)).toBe(true);
  });

  // #S11 — Does not mutate input config
  it("does not mutate input config", () => {
    const config: IdentityConfig = Object.freeze({
      default: Object.freeze({ name: "Bot" }),
    });
    const session: ChannelIdentityConfig = Object.freeze({ avatar: "https://s.png" });
    const result = resolveIdentityWithSession(config, "slack", session);
    expect(result).toEqual({ name: "Bot", avatar: "https://s.png" });
    expect(result).not.toBe(config.default);
  });

  // #S12 — Unknown channel with session override
  it("unknown channel with session override uses default + session", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", bio: "Default" },
      channels: { slack: { name: "Slack Bot" } },
    };
    const session: ChannelIdentityConfig = { avatar: "https://session.png" };
    expect(resolveIdentityWithSession(config, "telegram", session)).toEqual({
      name: "Bot",
      bio: "Default",
      avatar: "https://session.png",
    });
  });

  // #S13 — Session overrides all fields completely
  it("session overrides all fields when fully specified", () => {
    const config: IdentityConfig = {
      default: { name: "Bot", avatar: "https://d.png", bio: "D" },
      channels: { slack: { name: "Slack", avatar: "https://s.png", bio: "S" } },
    };
    const session: ChannelIdentityConfig = {
      name: "Session",
      avatar: "https://sess.png",
      bio: "Sess bio",
    };
    expect(resolveIdentityWithSession(config, "slack", session)).toEqual({
      name: "Session",
      avatar: "https://sess.png",
      bio: "Sess bio",
    });
  });
});
