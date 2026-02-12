import type { OutboundMessage } from "@templar/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_CAPABILITIES } from "../../adapter/capabilities.js";
import { McpChannelAdapter } from "../../adapter/mcp-channel-adapter.js";

// Mock McpBridge as a class so it can be instantiated with `new`
vi.mock("../../bridge/mcp-bridge.js", () => {
  class MockMcpBridge {
    name = "test-bridge";
    connect = vi.fn().mockResolvedValue({
      name: "test-server",
      version: "1.0.0",
      capabilities: { tools: true },
    });
    disconnect = vi.fn().mockResolvedValue(undefined);
    callTool = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "tool result" }],
    });
    isConnected = vi.fn().mockReturnValue(false);
  }
  return { McpBridge: MockMcpBridge };
});

describe("McpChannelAdapter", () => {
  let adapter: McpChannelAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new McpChannelAdapter({
      transport: "stdio",
      command: "node",
    });
  });

  it("has name 'mcp'", () => {
    expect(adapter.name).toBe("mcp");
  });

  it("has MCP_CAPABILITIES", () => {
    expect(adapter.capabilities).toBe(MCP_CAPABILITIES);
  });

  it("connects via bridge", async () => {
    await adapter.connect();
    const bridge = adapter.getBridge();
    expect(bridge.connect).toHaveBeenCalledOnce();
  });

  it("disconnects via bridge", async () => {
    await adapter.disconnect();
    const bridge = adapter.getBridge();
    expect(bridge.disconnect).toHaveBeenCalledOnce();
  });

  it("send() extracts tool call from metadata and calls bridge.callTool()", async () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [{ type: "text", content: "call tool" }],
      metadata: { mcpTool: "get_weather", mcpArgs: { city: "NYC" } },
    };
    await adapter.send(message);
    const bridge = adapter.getBridge();
    expect(bridge.callTool).toHaveBeenCalledWith("get_weather", {
      city: "NYC",
    });
  });

  it("send() calls message handler with inbound result", async () => {
    const handler = vi.fn();
    adapter.onMessage(handler);

    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: { mcpTool: "test_tool" },
    };
    await adapter.send(message);

    expect(handler).toHaveBeenCalledOnce();
    const inbound = handler.mock.calls[0]?.[0];
    expect(inbound.channelType).toBe("mcp");
    expect(inbound.blocks[0]?.content).toBe("tool result");
  });

  it("send() without handler does not throw", async () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: { mcpTool: "test_tool" },
    };
    await expect(adapter.send(message)).resolves.toBeUndefined();
  });

  it("send() throws when mcpTool is missing", async () => {
    const message: OutboundMessage = {
      channelId: "test",
      blocks: [],
      metadata: {},
    };
    await expect(adapter.send(message)).rejects.toThrow("mcpTool");
  });

  it("getBridge() returns the bridge instance", () => {
    const bridge = adapter.getBridge();
    expect(bridge).toBeDefined();
    expect(bridge.name).toBe("test-bridge");
  });
});
