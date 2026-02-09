import { vi } from "vitest";
import type { ChannelAdapter, ChannelCapabilities, MessageHandler, OutboundMessage } from "@templar/core";

/**
 * Mock ChannelAdapter for testing
 *
 * Provides a spy-based implementation of ChannelAdapter interface.
 * All methods are vitest mock functions that can be asserted against.
 *
 * @example
 * ```typescript
 * import { MockChannelAdapter } from '@templar/test-utils';
 *
 * const mock = new MockChannelAdapter('test-channel');
 *
 * await mock.connect();
 * expect(mock.connect).toHaveBeenCalled();
 *
 * await mock.send({ content: 'hello', channelId: 'test' });
 * expect(mock.send).toHaveBeenCalledWith({ content: 'hello', channelId: 'test' });
 * ```
 */
export class MockChannelAdapter implements ChannelAdapter {
  readonly name: string;
  readonly capabilities: ChannelCapabilities;

  readonly connect: () => Promise<void> = vi.fn<() => Promise<void>>(async () => {
    // No-op mock implementation
  });

  readonly disconnect: () => Promise<void> = vi.fn<() => Promise<void>>(async () => {
    // No-op mock implementation
  });

  readonly send: (message: OutboundMessage) => Promise<void> = vi.fn<(message: OutboundMessage) => Promise<void>>(async (_message: OutboundMessage) => {
    // No-op mock implementation
  });

  readonly onMessage: (handler: MessageHandler) => void = vi.fn<(handler: MessageHandler) => void>((_handler: MessageHandler) => {
    // No-op mock implementation
  });

  constructor(name = "mock-channel", capabilities?: Partial<ChannelCapabilities>) {
    this.name = name;
    this.capabilities = {
      text: true,
      richText: false,
      images: false,
      files: false,
      buttons: false,
      threads: false,
      reactions: false,
      typingIndicator: false,
      readReceipts: false,
      voiceMessages: false,
      groups: false,
      maxMessageLength: 1000,
      ...capabilities,
    };
  }

  /**
   * Reset all spy function call history
   */
  reset(): void {
    (this.connect as any).mockClear();
    (this.disconnect as any).mockClear();
    (this.send as any).mockClear();
    (this.onMessage as any).mockClear();
  }
}
