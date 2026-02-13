import { describe, expect, it } from "vitest";
import {
  AgentManifestSchema,
  ChannelConfigSchema,
  ChannelIdentityConfigSchema,
  IdentityConfigSchema,
  ModelConfigSchema,
  PermissionConfigSchema,
  ToolConfigSchema,
} from "../../schema.js";

describe("AgentManifestSchema", () => {
  const minimal = {
    name: "test-agent",
    version: "1.0.0",
    description: "A test agent",
  };

  it("accepts a minimal valid manifest", () => {
    const result = AgentManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("accepts a full valid manifest", () => {
    const full = {
      ...minimal,
      model: { provider: "anthropic", name: "claude-3", temperature: 0.7, maxTokens: 4096 },
      tools: [{ name: "search", description: "Search the web" }],
      channels: [{ type: "slack", config: { token: "xoxb" } }],
      middleware: [{ name: "memory", config: { scope: "user" } }],
      permissions: { allowed: ["search"], denied: ["delete"] },
    };
    const result = AgentManifestSchema.safeParse(full);
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const { name: _, ...noName } = minimal;
    const result = AgentManifestSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects missing version", () => {
    const { version: _, ...noVersion } = minimal;
    const result = AgentManifestSchema.safeParse(noVersion);
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const { description: _, ...noDesc } = minimal;
    const result = AgentManifestSchema.safeParse(noDesc);
    expect(result.success).toBe(false);
  });

  it("rejects invalid version format", () => {
    const result = AgentManifestSchema.safeParse({ ...minimal, version: "not-semver" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = AgentManifestSchema.safeParse({ ...minimal, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects empty description", () => {
    const result = AgentManifestSchema.safeParse({ ...minimal, description: "" });
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const result = AgentManifestSchema.safeParse({ ...minimal, extra: "field" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect("extra" in result.data).toBe(false);
    }
  });
});

describe("ModelConfigSchema", () => {
  it("rejects temperature below 0", () => {
    const result = ModelConfigSchema.safeParse({
      provider: "a",
      name: "b",
      temperature: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects temperature above 2", () => {
    const result = ModelConfigSchema.safeParse({
      provider: "a",
      name: "b",
      temperature: 2.1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-number temperature", () => {
    const result = ModelConfigSchema.safeParse({
      provider: "a",
      name: "b",
      temperature: "hot",
    });
    expect(result.success).toBe(false);
  });

  it("rejects float maxTokens", () => {
    const result = ModelConfigSchema.safeParse({
      provider: "a",
      name: "b",
      maxTokens: 1.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative maxTokens", () => {
    const result = ModelConfigSchema.safeParse({
      provider: "a",
      name: "b",
      maxTokens: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero maxTokens", () => {
    const result = ModelConfigSchema.safeParse({
      provider: "a",
      name: "b",
      maxTokens: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("ToolConfigSchema", () => {
  it("rejects missing name", () => {
    const result = ToolConfigSchema.safeParse({ description: "desc" });
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const result = ToolConfigSchema.safeParse({ name: "tool" });
    expect(result.success).toBe(false);
  });
});

describe("ChannelConfigSchema", () => {
  it("rejects missing type", () => {
    const result = ChannelConfigSchema.safeParse({ config: {} });
    expect(result.success).toBe(false);
  });

  it("rejects missing config", () => {
    const result = ChannelConfigSchema.safeParse({ type: "slack" });
    expect(result.success).toBe(false);
  });
});

describe("PermissionConfigSchema", () => {
  it("rejects empty allowed array", () => {
    const result = PermissionConfigSchema.safeParse({ allowed: [] });
    expect(result.success).toBe(false);
  });
});

describe("ChannelIdentityConfigSchema", () => {
  it("accepts full identity config", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      name: "Bot",
      avatar: "https://example.com/avatar.png",
      bio: "A helpful bot",
      systemPromptPrefix: "You are helpful.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts identity with only name", () => {
    const result = ChannelIdentityConfigSchema.safeParse({ name: "Bot" });
    expect(result.success).toBe(true);
  });

  it("accepts avatar as relative path ./avatar.png", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "./avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts avatar as https URL", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "https://cdn.example.com/bot.jpg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts avatar as parent-relative path ../assets/avatar.png", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "../assets/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts avatar as root-relative path /assets/avatar.png", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "/assets/avatar.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects avatar as plain string", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects avatar with path traversal", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "../../../../../../etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects avatar with http:// (only https allowed)", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      avatar: "http://example.com/avatar.png",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name exceeding 100 characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      name: "A".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects bio exceeding 500 characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      bio: "A".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects systemPromptPrefix exceeding 10K characters", () => {
    const result = ChannelIdentityConfigSchema.safeParse({
      systemPromptPrefix: "A".repeat(10_001),
    });
    expect(result.success).toBe(false);
  });
});

describe("IdentityConfigSchema", () => {
  it("accepts default only, no channels", () => {
    const result = IdentityConfigSchema.safeParse({
      default: { name: "Bot" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts channels only, no default", () => {
    const result = IdentityConfigSchema.safeParse({
      channels: { slack: { name: "Slack Bot" } },
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentManifestSchema — identity", () => {
  const minimal = {
    name: "test-agent",
    version: "1.0.0",
    description: "A test agent",
  };

  it("accepts manifest with full identity (default + 2 channels)", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      identity: {
        default: { name: "Bot", avatar: "https://cdn.example.com/avatar.png", bio: "Default" },
        channels: {
          slack: { name: "Slack Bot", avatar: "https://cdn.example.com/slack.png" },
          whatsapp: { name: "WA Bot" },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts manifest without identity field (backwards compat)", () => {
    const result = AgentManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("includes identity in parsed output", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      identity: { default: { name: "Bot" } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.identity).toEqual({ default: { name: "Bot" } });
    }
  });
});
