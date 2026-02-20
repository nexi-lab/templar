import { describe, expect, it } from "vitest";
import {
  A2aAgentConfigSchema,
  A2aClientConfigSchema,
  A2aMiddlewareConfigSchema,
  normalizeAgentUrl,
  validateMessage,
} from "../validation.js";

describe("normalizeAgentUrl", () => {
  it("trims whitespace", () => {
    expect(normalizeAgentUrl("  https://agent.com  ")).toBe("https://agent.com");
  });

  it("strips trailing slashes", () => {
    expect(normalizeAgentUrl("https://agent.com/")).toBe("https://agent.com");
    expect(normalizeAgentUrl("https://agent.com///")).toBe("https://agent.com");
  });

  it("returns empty string for invalid input", () => {
    expect(normalizeAgentUrl("")).toBe("");
    expect(normalizeAgentUrl("   ")).toBe("");
    expect(normalizeAgentUrl(null)).toBe("");
    expect(normalizeAgentUrl(undefined)).toBe("");
    expect(normalizeAgentUrl(42)).toBe("");
  });

  it("rejects non-http(s) schemes", () => {
    expect(normalizeAgentUrl("ftp://agent.com")).toBe("");
    expect(normalizeAgentUrl("javascript:alert(1)")).toBe("");
    expect(normalizeAgentUrl("file:///etc/passwd")).toBe("");
    expect(normalizeAgentUrl("not-a-url")).toBe("");
  });

  it("preserves valid URLs", () => {
    expect(normalizeAgentUrl("https://agent.example.com")).toBe("https://agent.example.com");
    expect(normalizeAgentUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("validateMessage", () => {
  it("returns trimmed message", () => {
    expect(validateMessage("  hello  ")).toBe("hello");
  });

  it("returns empty string for invalid input", () => {
    expect(validateMessage("")).toBe("");
    expect(validateMessage("   ")).toBe("");
    expect(validateMessage(null)).toBe("");
    expect(validateMessage(undefined)).toBe("");
    expect(validateMessage(123)).toBe("");
  });
});

describe("A2aClientConfigSchema", () => {
  it("accepts valid config", () => {
    const result = A2aClientConfigSchema.safeParse({
      discoveryTimeoutMs: 5000,
      taskTimeoutMs: 60000,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty config", () => {
    const result = A2aClientConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects invalid timeout values", () => {
    expect(A2aClientConfigSchema.safeParse({ discoveryTimeoutMs: 500 }).success).toBe(false); // min 1000
    expect(A2aClientConfigSchema.safeParse({ discoveryTimeoutMs: 100_000 }).success).toBe(false); // max 60000
  });
});

describe("A2aAgentConfigSchema", () => {
  it("accepts valid agent config", () => {
    const result = A2aAgentConfigSchema.safeParse({
      url: "https://agent.com",
      auth: { type: "bearer", credentials: "token-123" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts agent config without auth", () => {
    const result = A2aAgentConfigSchema.safeParse({
      url: "https://agent.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid URL", () => {
    expect(A2aAgentConfigSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  });

  it("rejects invalid auth type", () => {
    expect(
      A2aAgentConfigSchema.safeParse({
        url: "https://agent.com",
        auth: { type: "invalid", credentials: "token" },
      }).success,
    ).toBe(false);
  });
});

describe("A2aMiddlewareConfigSchema", () => {
  it("accepts valid middleware config", () => {
    const result = A2aMiddlewareConfigSchema.safeParse({
      agents: [
        {
          url: "https://agent.com",
          auth: { type: "apiKey", credentials: "key-123" },
        },
      ],
      toolPrefix: "custom",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal config", () => {
    const result = A2aMiddlewareConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
