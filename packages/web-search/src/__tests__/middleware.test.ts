import type { ToolRequest, ToolResponse } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { createWebSearchMiddleware, WebSearchMiddleware } from "../middleware.js";

vi.mock("../router.js", () => {
  class MockWebSearchRouter {
    search = vi
      .fn()
      .mockResolvedValue([{ title: "Test", url: "https://example.com", snippet: "Snippet" }]);
  }
  return { WebSearchRouter: MockWebSearchRouter };
});

describe("WebSearchMiddleware", () => {
  const config = {
    providers: [{ provider: "serper", apiKey: "test-key" }],
  };

  it("intercepts web_search tool calls", async () => {
    const middleware = new WebSearchMiddleware(config);
    const req: ToolRequest = {
      toolName: "web_search",
      input: { query: "test query" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall?.(req, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.output).toEqual([
      { title: "Test", url: "https://example.com", snippet: "Snippet" },
    ]);
    expect(response.metadata).toEqual({
      provider: "web-search",
      resultCount: 1,
    });
  });

  it("passes through non-matching tool calls", async () => {
    const middleware = new WebSearchMiddleware(config);
    const req: ToolRequest = {
      toolName: "other_tool",
      input: { data: "something" },
    };
    const expectedResponse: ToolResponse = {
      output: "other result",
    };
    const next = vi.fn().mockResolvedValue(expectedResponse);

    const response = await middleware.wrapToolCall?.(req, next);

    expect(next).toHaveBeenCalledWith(req);
    expect(response).toBe(expectedResponse);
  });

  it("uses custom tool name from config", async () => {
    const middleware = new WebSearchMiddleware({
      ...config,
      toolName: "custom_search",
    });

    const req: ToolRequest = {
      toolName: "custom_search",
      input: { query: "test" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall?.(req, next);
    expect(next).not.toHaveBeenCalled();
    expect(response.metadata?.provider).toBe("web-search");
  });

  it("has correct name", () => {
    const middleware = new WebSearchMiddleware(config);
    expect(middleware.name).toBe("web-search");
  });
});

describe("createWebSearchMiddleware", () => {
  it("throws on invalid config", () => {
    expect(() => createWebSearchMiddleware({ providers: [] } as never)).toThrow();
  });
});
