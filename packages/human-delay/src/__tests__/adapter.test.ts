import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { HumanDelayAdapter } from "../adapter.js";
import type { HumanDelayConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(capabilities: ChannelCapabilities = {}): ChannelAdapter & {
  send: MockInstance<(message: OutboundMessage) => Promise<void>>;
  connect: MockInstance<() => Promise<void>>;
  disconnect: MockInstance<() => Promise<void>>;
  onMessage: MockInstance<(handler: MessageHandler) => void>;
} {
  return {
    name: "mock-channel",
    capabilities,
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    send: vi.fn<(message: OutboundMessage) => Promise<void>>().mockResolvedValue(undefined),
    onMessage: vi.fn<(handler: MessageHandler) => void>(),
  };
}

function textMessage(text: string, metadata?: Record<string, unknown>): OutboundMessage {
  return {
    channelId: "ch-1",
    blocks: [{ type: "text" as const, content: text }],
    ...(metadata ? { metadata } : {}),
  };
}

function imageMessage(): OutboundMessage {
  return {
    channelId: "ch-1",
    blocks: [{ type: "image" as const, url: "https://example.com/img.png" }],
  };
}

function fileMessage(): OutboundMessage {
  return {
    channelId: "ch-1",
    blocks: [
      {
        type: "file" as const,
        url: "https://example.com/doc.pdf",
        filename: "doc.pdf",
        mimeType: "application/pdf",
      },
    ],
  };
}

function mixedMessage(): OutboundMessage {
  return {
    channelId: "ch-1",
    blocks: [
      { type: "text" as const, content: "hello" },
      { type: "image" as const, url: "https://example.com/img.png" },
    ],
  };
}

const FAST_CONFIG: HumanDelayConfig = {
  wpm: 40,
  jitterFactor: 0,
  minDelay: 100,
  maxDelay: 200,
  punctuationPause: false,
  random: () => 0.5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HumanDelayAdapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("delegation", () => {
    it("connect() delegates to inner adapter", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner);
      await adapter.connect();
      expect(inner.connect).toHaveBeenCalledOnce();
    });

    it("disconnect() delegates to inner adapter", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner);
      await adapter.disconnect();
      expect(inner.disconnect).toHaveBeenCalledOnce();
    });

    it("onMessage() delegates to inner adapter", () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner);
      const handler = vi.fn();
      adapter.onMessage(handler);
      expect(inner.onMessage).toHaveBeenCalledWith(handler);
    });

    it("name mirrors inner adapter", () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner);
      expect(adapter.name).toBe("mock-channel");
    });

    it("capabilities mirrors inner adapter", () => {
      const caps: ChannelCapabilities = {
        text: { supported: true, maxLength: 4096 },
        typingIndicator: { supported: true },
      };
      const inner = createMockAdapter(caps);
      const adapter = new HumanDelayAdapter(inner);
      expect(adapter.capabilities).toBe(caps);
    });
  });

  describe("delay behavior", () => {
    it("delays before sending text message", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = textMessage("hello world");

      const sendPromise = adapter.send(msg);

      // Before timer fires, inner.send should not have been called with the actual message
      expect(inner.send).not.toHaveBeenCalledWith(msg);

      await vi.advanceTimersByTimeAsync(200);
      await sendPromise;

      expect(inner.send).toHaveBeenCalledWith(msg);
    });

    it("bypasses delay for image message", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = imageMessage();

      await adapter.send(msg);
      expect(inner.send).toHaveBeenCalledWith(msg);
    });

    it("bypasses delay for file message", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = fileMessage();

      await adapter.send(msg);
      expect(inner.send).toHaveBeenCalledWith(msg);
    });

    it("bypasses delay for mixed block types (not all text)", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = mixedMessage();

      await adapter.send(msg);
      expect(inner.send).toHaveBeenCalledWith(msg);
    });

    it("bypasses delay with skipDelay: true metadata", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = textMessage("hello world", { skipDelay: true });

      await adapter.send(msg);
      expect(inner.send).toHaveBeenCalledWith(msg);
    });

    it("bypasses delay for empty blocks", async () => {
      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg: OutboundMessage = { channelId: "ch-1", blocks: [] };

      await adapter.send(msg);
      expect(inner.send).toHaveBeenCalledWith(msg);
    });
  });

  describe("typing indicator", () => {
    it("sends typing indicator before delay when channel supports it", async () => {
      const inner = createMockAdapter({ typingIndicator: { supported: true } });
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = textMessage("hello world");

      const sendPromise = adapter.send(msg);

      // Typing indicator should be sent immediately
      expect(inner.send).toHaveBeenCalledWith({
        channelId: "ch-1",
        blocks: [],
        metadata: { typingIndicator: true },
      });

      await vi.advanceTimersByTimeAsync(200);
      await sendPromise;
    });

    it("does NOT send typing indicator when channel lacks support", async () => {
      const inner = createMockAdapter({});
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = textMessage("hello world");

      const sendPromise = adapter.send(msg);
      await vi.advanceTimersByTimeAsync(200);
      await sendPromise;

      // Only the actual message should have been sent (no typing indicator)
      expect(inner.send).toHaveBeenCalledTimes(1);
      expect(inner.send).toHaveBeenCalledWith(msg);
    });

    it("repeats typing indicator during long delay", async () => {
      const inner = createMockAdapter({ typingIndicator: { supported: true } });
      const adapter = new HumanDelayAdapter(inner, {
        ...FAST_CONFIG,
        minDelay: 5000,
        maxDelay: 5000,
        typingRepeatMs: 2000,
      });
      const msg = textMessage("hello");

      const sendPromise = adapter.send(msg);

      // Initial typing indicator sent immediately
      expect(inner.send).toHaveBeenCalledTimes(1);

      // Advance 2s — first repeat
      await vi.advanceTimersByTimeAsync(2000);
      expect(inner.send).toHaveBeenCalledTimes(2);

      // Advance another 2s — second repeat
      await vi.advanceTimersByTimeAsync(2000);
      expect(inner.send).toHaveBeenCalledTimes(3);

      // Advance remaining 1s — message sent, total = 4
      await vi.advanceTimersByTimeAsync(1000);
      await sendPromise;

      expect(inner.send).toHaveBeenCalledTimes(4);
    });

    it("clears typing interval after send completes", async () => {
      const inner = createMockAdapter({ typingIndicator: { supported: true } });
      const adapter = new HumanDelayAdapter(inner, {
        ...FAST_CONFIG,
        minDelay: 1000,
        maxDelay: 1000,
        typingRepeatMs: 500,
      });
      const msg = textMessage("hello");

      const sendPromise = adapter.send(msg);

      // 1 (initial typing) + 1 (repeat at 500ms) = 2 before timer fires
      await vi.advanceTimersByTimeAsync(1000);
      await sendPromise;

      const callCountAfterSend = inner.send.mock.calls.length;

      // Advance more time — should NOT produce additional typing sends
      await vi.advanceTimersByTimeAsync(5000);
      expect(inner.send.mock.calls.length).toBe(callCountAfterSend);
    });

    it("clears typing interval if inner.send() throws (try/finally)", async () => {
      const inner = createMockAdapter({ typingIndicator: { supported: true } });
      inner.send.mockImplementation(async (msg: OutboundMessage) => {
        // Only throw for the actual message, not typing indicators
        if (msg.blocks.length > 0) {
          throw new Error("send failed");
        }
      });

      const adapter = new HumanDelayAdapter(inner, {
        ...FAST_CONFIG,
        minDelay: 1000,
        maxDelay: 1000,
        typingRepeatMs: 500,
      });
      const msg = textMessage("hello");

      const sendPromise = adapter.send(msg);
      // Attach rejection handler before advancing timers to avoid unhandled rejection warning
      const assertionPromise = expect(sendPromise).rejects.toThrow("send failed");
      await vi.advanceTimersByTimeAsync(1000);
      await assertionPromise;

      const callCountAfterError = inner.send.mock.calls.length;

      // Advance more time — interval should be cleared
      await vi.advanceTimersByTimeAsync(5000);
      expect(inner.send.mock.calls.length).toBe(callCountAfterError);
    });

    it("typing indicator failure doesn't break send", async () => {
      const inner = createMockAdapter({ typingIndicator: { supported: true } });
      inner.send.mockImplementation(async (msg: OutboundMessage) => {
        if (msg.blocks.length === 0 && msg.metadata?.typingIndicator) {
          throw new Error("typing failed");
        }
      });

      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = textMessage("hello world");

      const sendPromise = adapter.send(msg);
      await vi.advanceTimersByTimeAsync(200);

      // Should complete without error despite typing indicator failure
      await expect(sendPromise).resolves.toBeUndefined();
    });
  });

  describe("performance", () => {
    it("bypassed messages have negligible overhead", async () => {
      vi.useRealTimers();

      const inner = createMockAdapter();
      const adapter = new HumanDelayAdapter(inner, FAST_CONFIG);
      const msg = imageMessage();

      const iterations = 1000;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await adapter.send(msg);
      }
      const elapsed = performance.now() - start;

      // Average < 1ms per call
      expect(elapsed / iterations).toBeLessThan(1);
    });
  });
});
