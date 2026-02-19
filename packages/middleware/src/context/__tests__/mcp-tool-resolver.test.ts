import { describe, expect, it } from "vitest";
import { McpToolResolver } from "../resolvers/mcp-tool-resolver.js";
import { createMockToolExecutor } from "./helpers.js";

describe("McpToolResolver", () => {
  it("should resolve a tool call and return stringified result", async () => {
    const { executor, executeFn } = createMockToolExecutor();
    executeFn.mockResolvedValue({ data: "tool output" });
    const resolver = new McpToolResolver(executor);

    const result = await resolver.resolve({ tool: "my-tool", args: {} }, {});

    expect(result.type).toBe("mcp_tool");
    expect(result.content).toBe('{"data":"tool output"}');
    expect(result.truncated).toBe(false);
    expect(result.resolvedInMs).toBeGreaterThanOrEqual(0);
    expect(executeFn).toHaveBeenCalledWith("my-tool", {});
  });

  it("should return string content directly without JSON.stringify", async () => {
    const { executor, executeFn } = createMockToolExecutor();
    executeFn.mockResolvedValue("plain text result");
    const resolver = new McpToolResolver(executor);

    const result = await resolver.resolve({ tool: "text-tool", args: {} }, {});

    expect(result.content).toBe("plain text result");
  });

  it("should interpolate template variables in args", async () => {
    const { executor, executeFn } = createMockToolExecutor();
    executeFn.mockResolvedValue("ok");
    const resolver = new McpToolResolver(executor);

    await resolver.resolve(
      { tool: "search", args: { query: "{{task.description}}" } },
      { task: { description: "find bugs" } },
    );

    expect(executeFn).toHaveBeenCalledWith("search", { query: "find bugs" });
  });

  it("should truncate when maxChars is exceeded", async () => {
    const { executor, executeFn } = createMockToolExecutor();
    executeFn.mockResolvedValue("a".repeat(100));
    const resolver = new McpToolResolver(executor);

    const result = await resolver.resolve({ tool: "big-tool", args: {}, maxChars: 10 }, {});

    expect(result.content).toBe("a".repeat(10));
    expect(result.truncated).toBe(true);
    expect(result.originalChars).toBe(100);
  });

  it("should throw when tool executor throws", async () => {
    const { executor, executeFn } = createMockToolExecutor();
    executeFn.mockRejectedValue(new Error("Tool not found"));
    const resolver = new McpToolResolver(executor);

    await expect(resolver.resolve({ tool: "missing-tool", args: {} }, {})).rejects.toThrow(
      "Tool not found",
    );
  });

  it("should throw when abort signal is already aborted", async () => {
    const { executor } = createMockToolExecutor();
    const resolver = new McpToolResolver(executor);
    const controller = new AbortController();
    controller.abort();

    await expect(resolver.resolve({ tool: "t", args: {} }, {}, controller.signal)).rejects.toThrow(
      "Aborted",
    );
  });
});
