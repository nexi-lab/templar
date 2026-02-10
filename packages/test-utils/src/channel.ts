import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { vi } from "vitest";

/**
 * Mock ChannelAdapter for testing
 *
 * Provides a spy-based implementation of ChannelAdapter interface.
 * All methods are vitest mock functions that can be asserted against.
 *
 * Capabilities use the grouped structure (Issue #15):
 * - Absent key = unsupported
 * - Present key = `{ supported: true, ...constraints }`
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
 * await mock.send({ channelId: 'test', blocks: [{ type: 'text', content: 'hello' }] });
 * expect(mock.send).toHaveBeenCalled();
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

  readonly send: (message: OutboundMessage) => Promise<void> = vi.fn<
    (message: OutboundMessage) => Promise<void>
  >(async (_message: OutboundMessage) => {
    // No-op mock implementation
  });

  readonly onMessage: (handler: MessageHandler) => void = vi.fn<(handler: MessageHandler) => void>(
    (_handler: MessageHandler) => {
      // No-op mock implementation
    },
  );

  constructor(name = "mock-channel", capabilities?: ChannelCapabilities) {
    this.name = name;
    this.capabilities = capabilities ?? {
      text: { supported: true, maxLength: 1000 },
    };
  }

  /**
   * Reset all spy function call history
   */
  reset(): void {
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.connect as any).mockClear();
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.disconnect as any).mockClear();
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.send as any).mockClear();
    // biome-ignore lint/suspicious/noExplicitAny: Vitest mock requires any cast
    (this.onMessage as any).mockClear();
  }
}
