import { describe, expect, it } from "vitest";
import {
  AgentManifestSchema,
  ChannelConfigSchema,
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
