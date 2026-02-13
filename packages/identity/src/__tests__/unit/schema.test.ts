import { describe, expect, it } from "vitest";
import { ChannelIdentityConfigSchema, IdentityConfigSchema } from "../../schema.js";

describe("ChannelIdentityConfigSchema", () => {
  it("accepts valid identity config", () => {
    const result = ChannelIdentityConfigSchema.parse({
      name: "Bot",
      avatar: "https://cdn.example.com/bot.png",
      bio: "A helpful assistant",
      systemPromptPrefix: "You are a friendly bot.",
    });
    expect(result.name).toBe("Bot");
    expect(result.avatar).toBe("https://cdn.example.com/bot.png");
  });

  it("accepts empty object (all fields optional)", () => {
    const result = ChannelIdentityConfigSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts partial fields", () => {
    const result = ChannelIdentityConfigSchema.parse({ name: "Bot" });
    expect(result).toEqual({ name: "Bot" });
  });

  it("rejects name exceeding 80 characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      name: "a".repeat(81),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.at(0)?.message).toContain("80");
    }
  });

  it("accepts name at exactly 80 characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      name: "a".repeat(80),
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid avatar URL", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "not-a-url",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.at(0)?.message).toContain("URL");
    }
  });

  it("rejects javascript: avatar URL", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("rejects data: avatar URL", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "data:image/png;base64,iVBORw0KGgo=",
    });
    expect(result.success).toBe(false);
  });

  it("rejects ftp: avatar URL", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "ftp://example.com/avatar.png",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid HTTPS avatar URL", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "https://cdn.example.com/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects bio exceeding 512 characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      bio: "a".repeat(513),
    });
    expect(result.success).toBe(false);
  });

  it("rejects systemPromptPrefix exceeding 4096 characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      systemPromptPrefix: "a".repeat(4097),
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown fields (strict mode)", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      name: "Bot",
      unknownField: "value",
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty string name (intentional override)", () => {
    const result = ChannelIdentityConfigSchema.safeParse({ name: "" });
    expect(result.success).toBe(true);
  });
});

describe("IdentityConfigSchema", () => {
  it("accepts full identity config with default and channels", () => {
    const result = IdentityConfigSchema.parse({
      default: { name: "Bot", avatar: "https://a.png" },
      channels: {
        slack: { name: "Slack Bot", avatar: "https://slack.png" },
        whatsapp: { name: "WA Bot", bio: "Hello from WhatsApp" },
      },
    });
    expect(result.default?.name).toBe("Bot");
    expect(result.channels?.slack?.name).toBe("Slack Bot");
  });

  it("accepts empty object", () => {
    const result = IdentityConfigSchema.parse({});
    expect(result).toEqual({});
  });

  it("accepts default only", () => {
    const result = IdentityConfigSchema.parse({
      default: { name: "Bot" },
    });
    expect(result.default?.name).toBe("Bot");
  });

  it("accepts channels only", () => {
    const result = IdentityConfigSchema.parse({
      channels: { slack: { name: "Slack Bot" } },
    });
    expect(result.channels?.slack?.name).toBe("Slack Bot");
  });

  it("rejects invalid channel identity config", () => {
    const result = IdentityConfigSchema.safeParse({
      channels: { slack: { avatar: "not-a-url" } },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown top-level fields (strict mode)", () => {
    const result = IdentityConfigSchema.safeParse({
      default: { name: "Bot" },
      extra: "field",
    });
    expect(result.success).toBe(false);
  });
});
