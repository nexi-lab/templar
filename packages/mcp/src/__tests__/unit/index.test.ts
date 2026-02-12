import { describe, expect, it } from "vitest";
import {
  createTransport,
  MCP_CAPABILITIES,
  McpBridge,
  McpChannelAdapter,
  McpServerConfigSchema,
  outboundToToolCall,
  PACKAGE_NAME,
  PACKAGE_VERSION,
  parseMcpConfig,
  toolResultToInbound,
} from "../../index.js";

describe("@templar/mcp public API", () => {
  it("exports PACKAGE_NAME", () => {
    expect(PACKAGE_NAME).toBe("@templar/mcp");
  });

  it("exports PACKAGE_VERSION", () => {
    expect(PACKAGE_VERSION).toBe("0.0.0");
  });

  it("exports McpBridge class", () => {
    expect(McpBridge).toBeDefined();
    expect(typeof McpBridge).toBe("function");
  });

  it("exports McpChannelAdapter class", () => {
    expect(McpChannelAdapter).toBeDefined();
    expect(typeof McpChannelAdapter).toBe("function");
  });

  it("exports MCP_CAPABILITIES", () => {
    expect(MCP_CAPABILITIES).toBeDefined();
    expect(MCP_CAPABILITIES.text?.supported).toBe(true);
  });

  it("exports McpServerConfigSchema", () => {
    expect(McpServerConfigSchema).toBeDefined();
    expect(typeof McpServerConfigSchema.parse).toBe("function");
  });

  it("exports parseMcpConfig", () => {
    expect(typeof parseMcpConfig).toBe("function");
  });

  it("exports outboundToToolCall", () => {
    expect(typeof outboundToToolCall).toBe("function");
  });

  it("exports toolResultToInbound", () => {
    expect(typeof toolResultToInbound).toBe("function");
  });

  it("exports createTransport", () => {
    expect(typeof createTransport).toBe("function");
  });
});
