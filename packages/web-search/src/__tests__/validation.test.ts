import { describe, expect, it } from "vitest";
import {
  SearchOptionsSchema,
  SearchProviderConfigSchema,
  validateQuery,
  WebSearchMiddlewareConfigSchema,
  WebSearchRouterConfigSchema,
} from "../validation.js";

describe("validateQuery", () => {
  it("returns trimmed string for valid query", () => {
    expect(validateQuery("  hello world  ")).toBe("hello world");
  });

  it("returns empty string for empty query", () => {
    expect(validateQuery("")).toBe("");
  });

  it("returns empty string for whitespace-only query", () => {
    expect(validateQuery("   ")).toBe("");
  });

  it("returns empty string for non-string input", () => {
    expect(validateQuery(123)).toBe("");
    expect(validateQuery(null)).toBe("");
    expect(validateQuery(undefined)).toBe("");
  });
});

describe("SearchOptionsSchema", () => {
  it("accepts valid options", () => {
    const result = SearchOptionsSchema.parse({
      maxResults: 10,
      timeRange: "week",
      language: "en",
      includeDomains: ["example.com"],
      excludeDomains: ["spam.com"],
    });
    expect(result.maxResults).toBe(10);
    expect(result.timeRange).toBe("week");
  });

  it("accepts empty object", () => {
    const result = SearchOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it("rejects invalid timeRange", () => {
    expect(() => SearchOptionsSchema.parse({ timeRange: "century" })).toThrow();
  });

  it("rejects maxResults out of range", () => {
    expect(() => SearchOptionsSchema.parse({ maxResults: 0 })).toThrow();
    expect(() => SearchOptionsSchema.parse({ maxResults: 101 })).toThrow();
  });
});

describe("SearchProviderConfigSchema", () => {
  it("accepts valid config", () => {
    const result = SearchProviderConfigSchema.parse({
      provider: "serper",
      apiKey: "test-key",
    });
    expect(result.provider).toBe("serper");
  });

  it("accepts config with optional fields", () => {
    const result = SearchProviderConfigSchema.parse({
      provider: "brave",
      apiKey: "test-key",
      baseUrl: "https://proxy.example.com/search",
      timeoutMs: 5000,
    });
    expect(result.baseUrl).toBe("https://proxy.example.com/search");
    expect(result.timeoutMs).toBe(5000);
  });

  it("rejects empty provider", () => {
    expect(() => SearchProviderConfigSchema.parse({ provider: "", apiKey: "key" })).toThrow();
  });

  it("rejects empty apiKey", () => {
    expect(() => SearchProviderConfigSchema.parse({ provider: "serper", apiKey: "" })).toThrow();
  });
});

describe("WebSearchRouterConfigSchema", () => {
  it("accepts valid config", () => {
    const result = WebSearchRouterConfigSchema.parse({
      providers: [{ provider: "serper", apiKey: "key" }],
    });
    expect(result.providers).toHaveLength(1);
  });

  it("rejects empty providers array", () => {
    expect(() => WebSearchRouterConfigSchema.parse({ providers: [] })).toThrow();
  });
});

describe("WebSearchMiddlewareConfigSchema", () => {
  it("accepts config with toolName", () => {
    const result = WebSearchMiddlewareConfigSchema.parse({
      providers: [{ provider: "serper", apiKey: "key" }],
      toolName: "custom_search",
    });
    expect(result.toolName).toBe("custom_search");
  });
});
