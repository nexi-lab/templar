import { describe, expect, it } from "vitest";
import {
  AgentManifestSchema,
  BootstrapBudgetSchema,
  BootstrapPathConfigSchema,
  ChannelConfigSchema,
  ChannelIdentityConfigSchema,
  IdentityConfigSchema,
  ModelConfigSchema,
  PermissionConfigSchema,
  PromptSchema,
  ScheduleSchema,
  SessionScopingSchema,
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

describe("ScheduleSchema", () => {
  it("accepts a valid daily cron expression", () => {
    const result = ScheduleSchema.safeParse("0 8 * * *");
    expect(result.success).toBe(true);
  });

  it("accepts a weekday cron expression", () => {
    const result = ScheduleSchema.safeParse("0 9 * * 1-5");
    expect(result.success).toBe(true);
  });

  it("accepts every-30-minutes cron", () => {
    const result = ScheduleSchema.safeParse("*/30 * * * *");
    expect(result.success).toBe(true);
  });

  it("accepts every-6-hours cron", () => {
    const result = ScheduleSchema.safeParse("0 */6 * * *");
    expect(result.success).toBe(true);
  });

  it("rejects an invalid cron expression", () => {
    const result = ScheduleSchema.safeParse("not-a-cron");
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = ScheduleSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects a cron with too many fields", () => {
    const result = ScheduleSchema.safeParse("0 0 0 0 0 0 0");
    expect(result.success).toBe(false);
  });
});

describe("PromptSchema", () => {
  it("accepts a valid prompt string", () => {
    const result = PromptSchema.safeParse("You are a helpful assistant.");
    expect(result.success).toBe(true);
  });

  it("accepts a prompt at max length (10K)", () => {
    const result = PromptSchema.safeParse("A".repeat(10_000));
    expect(result.success).toBe(true);
  });

  it("rejects a prompt exceeding 10K characters", () => {
    const result = PromptSchema.safeParse("A".repeat(10_001));
    expect(result.success).toBe(false);
  });

  it("rejects an empty string", () => {
    const result = PromptSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

describe("AgentManifestSchema — schedule and prompt", () => {
  const minimal = {
    name: "test-agent",
    version: "1.0.0",
    description: "A test agent",
  };

  it("accepts manifest with valid schedule", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      schedule: "0 8 * * *",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schedule).toBe("0 8 * * *");
    }
  });

  it("rejects manifest with invalid schedule", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      schedule: "bad-cron",
    });
    expect(result.success).toBe(false);
  });

  it("accepts manifest without schedule (optional)", () => {
    const result = AgentManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.schedule).toBeUndefined();
    }
  });

  it("accepts manifest with valid prompt", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      prompt: "You are a helpful assistant.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBe("You are a helpful assistant.");
    }
  });

  it("rejects manifest with empty prompt", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      prompt: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts manifest without prompt (optional)", () => {
    const result = AgentManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prompt).toBeUndefined();
    }
  });
});

describe("BootstrapBudgetSchema", () => {
  it("accepts valid budget with all fields", () => {
    const result = BootstrapBudgetSchema.safeParse({
      instructions: 10_000,
      tools: 6_000,
      context: 4_000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial budget", () => {
    const result = BootstrapBudgetSchema.safeParse({ instructions: 5_000 });
    expect(result.success).toBe(true);
  });

  it("accepts empty object", () => {
    const result = BootstrapBudgetSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects budget below minimum (100)", () => {
    const result = BootstrapBudgetSchema.safeParse({ instructions: 50 });
    expect(result.success).toBe(false);
  });

  it("rejects budget above maximum (50_000)", () => {
    const result = BootstrapBudgetSchema.safeParse({ instructions: 100_000 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer budget", () => {
    const result = BootstrapBudgetSchema.safeParse({ instructions: 1000.5 });
    expect(result.success).toBe(false);
  });

  it("rejects negative budget", () => {
    const result = BootstrapBudgetSchema.safeParse({ instructions: -100 });
    expect(result.success).toBe(false);
  });
});

describe("BootstrapPathConfigSchema", () => {
  it("accepts valid config with all fields", () => {
    const result = BootstrapPathConfigSchema.safeParse({
      instructions: "CUSTOM.md",
      tools: "MY_TOOLS.md",
      context: "MY_CONTEXT.md",
      budget: { instructions: 5_000 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty object (all defaults)", () => {
    const result = BootstrapPathConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects empty string path", () => {
    const result = BootstrapPathConfigSchema.safeParse({ instructions: "" });
    expect(result.success).toBe(false);
  });

  it("rejects path traversal with ../", () => {
    const result = BootstrapPathConfigSchema.safeParse({
      instructions: "../../../etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects absolute path", () => {
    const result = BootstrapPathConfigSchema.safeParse({
      instructions: "/etc/shadow",
    });
    expect(result.success).toBe(false);
  });

  it("accepts nested relative path", () => {
    const result = BootstrapPathConfigSchema.safeParse({
      instructions: "bootstrap/TEMPLAR.md",
    });
    expect(result.success).toBe(true);
  });
});

describe("AgentManifestSchema — bootstrap", () => {
  const minimal = {
    name: "test-agent",
    version: "1.0.0",
    description: "A test agent",
  };

  it("accepts manifest with bootstrap config", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      bootstrap: { instructions: "TEMPLAR.md" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts manifest with empty bootstrap (all defaults)", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      bootstrap: {},
    });
    expect(result.success).toBe(true);
  });

  it("accepts manifest without bootstrap (optional)", () => {
    const result = AgentManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bootstrap).toBeUndefined();
    }
  });

  it("rejects manifest with traversal path in bootstrap", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      bootstrap: { instructions: "../../secret.md" },
    });
    expect(result.success).toBe(false);
  });
});

describe("SessionScopingSchema", () => {
  it("accepts 'main'", () => {
    expect(SessionScopingSchema.safeParse("main").success).toBe(true);
  });

  it("accepts 'per-peer'", () => {
    expect(SessionScopingSchema.safeParse("per-peer").success).toBe(true);
  });

  it("accepts 'per-channel-peer'", () => {
    expect(SessionScopingSchema.safeParse("per-channel-peer").success).toBe(true);
  });

  it("accepts 'per-account-channel-peer'", () => {
    expect(SessionScopingSchema.safeParse("per-account-channel-peer").success).toBe(true);
  });

  it("rejects unknown scope", () => {
    expect(SessionScopingSchema.safeParse("custom-scope").success).toBe(false);
  });

  it("rejects empty string", () => {
    expect(SessionScopingSchema.safeParse("").success).toBe(false);
  });
});

describe("AgentManifestSchema — sessionScoping", () => {
  const minimal = {
    name: "test-agent",
    version: "1.0.0",
    description: "A test agent",
  };

  it("accepts manifest with valid sessionScoping", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      sessionScoping: "per-channel-peer",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionScoping).toBe("per-channel-peer");
    }
  });

  it("accepts manifest without sessionScoping (optional, backward compat)", () => {
    const result = AgentManifestSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionScoping).toBeUndefined();
    }
  });

  it("rejects manifest with invalid sessionScoping", () => {
    const result = AgentManifestSchema.safeParse({
      ...minimal,
      sessionScoping: "invalid-scope",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all 4 scope modes", () => {
    for (const scope of ["main", "per-peer", "per-channel-peer", "per-account-channel-peer"]) {
      const result = AgentManifestSchema.safeParse({ ...minimal, sessionScoping: scope });
      expect(result.success).toBe(true);
    }
  });
});
