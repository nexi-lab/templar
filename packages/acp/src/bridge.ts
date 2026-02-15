import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { ACP_CAPABILITIES } from "./capabilities.js";
import type { ACPContext, ACPStopReason, SessionUpdate } from "./handler.js";
import { mapOutboundToUpdates } from "./mappers/to-acp.js";
import { ACPServer } from "./server.js";
import type { ACPTransport } from "./transport.js";

/**
 * Thin ChannelAdapter bridge wrapping ACPServer for ChannelRegistry compatibility.
 *
 * Implements the standard ChannelAdapter interface so ACP can be registered
 * alongside Telegram, Slack, etc. Delegates all real work to ACPServer.
 */
export class ACPChannelBridge implements ChannelAdapter {
  readonly name = "acp" as const;
  readonly capabilities: ChannelCapabilities = ACP_CAPABILITIES;

  private readonly server: ACPServer;
  private messageHandler: MessageHandler | undefined;

  constructor(rawConfig: Readonly<Record<string, unknown>>, transport?: ACPTransport) {
    this.server = new ACPServer({
      handler: (input, context, emit, signal) => this.bridgeHandler(input, context, emit, signal),
      config: rawConfig,
      ...(transport ? { transport } : {}),
    });
  }

  async connect(): Promise<void> {
    return this.server.connect();
  }

  async disconnect(): Promise<void> {
    return this.server.disconnect();
  }

  async send(message: OutboundMessage): Promise<void> {
    // Convert outbound blocks to ACP session updates.
    // In the bridge model, outbound messages are buffered and sent
    // back as text chunks to the IDE. The sessionId is on the message's channelId.
    const _updates = mapOutboundToUpdates(message);
    // Updates are sent during the handler's emit cycle, not here.
    // This method exists for ChannelAdapter interface compliance.
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  /**
   * Bridge handler: converts ACP prompt → InboundMessage, calls stored
   * message handler, and returns end_turn.
   */
  private async bridgeHandler(
    input: {
      readonly sessionId: string;
      readonly prompt: readonly import("@templar/core").ContentBlock[];
    },
    _context: ACPContext,
    emit: (event: SessionUpdate) => void,
    _signal: AbortSignal,
  ): Promise<ACPStopReason> {
    if (!this.messageHandler) {
      emit({
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "No message handler registered.",
        },
      });
      return "end_turn";
    }

    // Create InboundMessage from the prompt blocks
    const inbound = {
      channelType: "acp" as const,
      channelId: input.sessionId,
      senderId: "ide-client",
      blocks: input.prompt,
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
      raw: input.prompt,
    };

    await this.messageHandler(inbound);
    return "end_turn";
  }
}
