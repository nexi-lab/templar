import { describe, expect, it } from "vitest";
import { validateRouterConfig } from "../validation.js";

describe("validateRouterConfig", () => {
  const validConfig = {
    providers: {
      openai: { keys: [{ key: "sk-1" }] },
    },
    defaultModel: "openai:gpt-4o",
  };

  it("accepts a valid config with string ModelId", () => {
    const result = validateRouterConfig(validConfig);
    expect(result.defaultModel).toBe("openai:gpt-4o");
  });

  it("accepts a valid config with ModelRef", () => {
    const config = {
      ...validConfig,
      defaultModel: { provider: "openai", model: "gpt-4o" },
    };
    const result = validateRouterConfig(config);
    expect(result.defaultModel).toEqual({ provider: "openai", model: "gpt-4o" });
  });

  it("rejects config with zero providers", () => {
    expect(() => validateRouterConfig({ providers: {}, defaultModel: "openai:gpt-4o" })).toThrow();
  });

  it("rejects provider with zero keys", () => {
    expect(() =>
      validateRouterConfig({
        providers: { openai: { keys: [] } },
        defaultModel: "openai:gpt-4o",
      }),
    ).toThrow();
  });

  it("rejects invalid ModelId format", () => {
    expect(() =>
      validateRouterConfig({
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: "gpt-4o",
      }),
    ).toThrow();
  });

  it("rejects when defaultModel references unconfigured provider", () => {
    expect(() =>
      validateRouterConfig({
        providers: { openai: { keys: [{ key: "sk-1" }] } },
        defaultModel: "anthropic:claude-3",
      }),
    ).toThrow("not configured");
  });

  it("accepts optional fields", () => {
    const config = {
      ...validConfig,
      fallbackChain: ["openai:gpt-4o-mini"],
      circuitBreaker: { failureThreshold: 10 },
      thinkingDowngrade: false,
      maxRetries: 5,
      retryBaseDelayMs: 500,
      retryMaxDelayMs: 5000,
    };
    const result = validateRouterConfig(config);
    expect(result.maxRetries).toBe(5);
    expect(result.thinkingDowngrade).toBe(false);
  });

  it("rejects empty key string", () => {
    expect(() =>
      validateRouterConfig({
        providers: { openai: { keys: [{ key: "" }] } },
        defaultModel: "openai:gpt-4o",
      }),
    ).toThrow();
  });

  it("rejects negative retries", () => {
    expect(() =>
      validateRouterConfig({
        ...validConfig,
        maxRetries: -1,
      }),
    ).toThrow();
  });

  it("accepts config with ModelRef defaultModel referencing configured provider", () => {
    const config = {
      providers: {
        anthropic: { keys: [{ key: "ak-1" }] },
      },
      defaultModel: { provider: "anthropic", model: "claude-3" },
    };
    const result = validateRouterConfig(config);
    expect(result).toBeDefined();
  });

  it("accepts 'thinking' as a valid error category in failoverStrategy", () => {
    const config = {
      ...validConfig,
      failoverStrategy: { thinking: "thinking_downgrade" },
    };
    const result = validateRouterConfig(config);
    expect(result.failoverStrategy).toEqual({ thinking: "thinking_downgrade" });
  });

  it("accepts 'thinking_downgrade' as a valid failover action", () => {
    const config = {
      ...validConfig,
      failoverStrategy: { model_error: "thinking_downgrade" },
    };
    const result = validateRouterConfig(config);
    expect(result.failoverStrategy).toEqual({ model_error: "thinking_downgrade" });
  });

  it("accepts config with onPreModelSelect callback", () => {
    const config = {
      ...validConfig,
      onPreModelSelect: (candidates: unknown[]) => candidates,
    };
    const result = validateRouterConfig(config);
    expect(result).toBeDefined();
  });
});
