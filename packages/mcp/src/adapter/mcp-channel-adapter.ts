/**
 * McpChannelAdapter — Optional thin ChannelAdapter shim for ChannelRegistry.
 *
 * Delegates to McpBridge for actual MCP communication.
 * Consumers needing full MCP API access should use bridge.getBridge().
 */

import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { McpBridge } from "../bridge/mcp-bridge.js";
import { MCP_CAPABILITIES } from "./capabilities.js";
import { outboundToToolCall, toolResultToInbound } from "./mappers.js";

export class McpChannelAdapter implements ChannelAdapter {
  readonly name = "mcp" as const;
  readonly capabilities: ChannelCapabilities = MCP_CAPABILITIES;
  private readonly bridge: McpBridge;
  private messageHandler: MessageHandler | undefined;

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    this.bridge = new McpBridge(rawConfig);
  }

  async connect(): Promise<void> {
    await this.bridge.connect();
  }

  async disconnect(): Promise<void> {
    await this.bridge.disconnect();
  }

  async send(message: OutboundMessage): Promise<void> {
    const { name, args } = outboundToToolCall(message);
    const result = await this.bridge.callTool(name, args);

    if (this.messageHandler) {
      const inbound = toolResultToInbound(result, name);
      await this.messageHandler(inbound);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /** Escape hatch to access the full MCP bridge API */
  getBridge(): McpBridge {
    return this.bridge;
  }
}
