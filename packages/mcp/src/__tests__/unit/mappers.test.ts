import type { OutboundMessage } from "@templar/core";
import { describe, expect, it } from "vitest";
import { outboundToToolCall, toolResultToInbound } from "../../adapter/mappers.js";
import type { McpToolResult } from "../../bridge/types.js";

describe("outboundToToolCall", () => {
  it("extracts tool name and args from metadata", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [{ type: "text", content: "call tool" }],
      metadata: { mcpTool: "get_weather", mcpArgs: { city: "NYC" } },
    };
    const result = outboundToToolCall(message);
    expect(result.name).toBe("get_weather");
    expect(result.args).toEqual({ city: "NYC" });
  });

  it("extracts tool name without args", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [{ type: "text", content: "call tool" }],
      metadata: { mcpTool: "list_files" },
    };
    const result = outboundToToolCall(message);
    expect(result.name).toBe("list_files");
    expect(result.args).toBeUndefined();
  });

  it("throws when mcpTool is missing from metadata", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [{ type: "text", content: "no tool" }],
      metadata: {},
    };
    expect(() => outboundToToolCall(message)).toThrow(
      "OutboundMessage metadata must include 'mcpTool'",
    );
  });

  it("throws when metadata is undefined", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [{ type: "text", content: "no metadata" }],
    };
    expect(() => outboundToToolCall(message)).toThrow();
  });

  it("throws when mcpTool is empty string", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: { mcpTool: "" },
    };
    expect(() => outboundToToolCall(message)).toThrow();
  });

  it("throws when mcpTool is not a string", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: { mcpTool: 42 },
    };
    expect(() => outboundToToolCall(message)).toThrow();
  });

  it("ignores non-object mcpArgs", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: { mcpTool: "test", mcpArgs: "not-an-object" },
    };
    const result = outboundToToolCall(message);
    expect(result.args).toBeUndefined();
  });

  it("ignores null mcpArgs", () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: { mcpTool: "test", mcpArgs: null },
    };
    const result = outboundToToolCall(message);
    expect(result.args).toBeUndefined();
  });
});

describe("toolResultToInbound", () => {
  it("maps text content to TextBlocks", () => {
    const result: McpToolResult = {
      content: [
        { type: "text", text: "Hello" },
        { type: "text", text: "World" },
      ],
    };
    const inbound = toolResultToInbound(result, "test_tool");
    expect(inbound.blocks).toHaveLength(2);
    expect(inbound.blocks[0]).toEqual({ type: "text", content: "Hello" });
    expect(inbound.blocks[1]).toEqual({ type: "text", content: "World" });
  });

  it("sets channelType to mcp", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "ok" }],
    };
    const inbound = toolResultToInbound(result, "tool");
    expect(inbound.channelType).toBe("mcp");
  });

  it("uses tool name as channelId", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "ok" }],
    };
    const inbound = toolResultToInbound(result, "my_tool");
    expect(inbound.channelId).toBe("my_tool");
  });

  it("sets senderId to mcp-server", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "ok" }],
    };
    const inbound = toolResultToInbound(result, "tool");
    expect(inbound.senderId).toBe("mcp-server");
  });

  it("preserves raw result", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "ok" }],
      isError: true,
    };
    const inbound = toolResultToInbound(result, "tool");
    expect(inbound.raw).toBe(result);
  });

  it("handles empty content array", () => {
    const result: McpToolResult = { content: [] };
    const inbound = toolResultToInbound(result, "tool");
    expect(inbound.blocks).toHaveLength(0);
  });

  it("filters out non-text content", () => {
    const result: McpToolResult = {
      content: [
        { type: "text", text: "visible" },
        { type: "image", data: "base64data", mimeType: "image/png" },
        { type: "text", text: "also visible" },
      ],
    };
    const inbound = toolResultToInbound(result, "tool");
    expect(inbound.blocks).toHaveLength(2);
    expect(inbound.blocks[0]).toEqual({ type: "text", content: "visible" });
    expect(inbound.blocks[1]).toEqual({
      type: "text",
      content: "also visible",
    });
  });

  it("generates messageId with tool name prefix", () => {
    const result: McpToolResult = {
      content: [{ type: "text", text: "ok" }],
    };
    const inbound = toolResultToInbound(result, "get_weather");
    expect(inbound.messageId).toMatch(/^mcp-get_weather-/);
  });
});
