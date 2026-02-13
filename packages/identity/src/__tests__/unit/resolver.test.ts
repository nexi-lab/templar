import type { IdentityConfig } from "@templar/core";
import { describe, expect, it } from "vitest";
import { resolveChannelIdentity, resolveIdentity } from "../../resolver.js";

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
