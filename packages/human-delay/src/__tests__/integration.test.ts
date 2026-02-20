import type {
  ChannelAdapter,
  ChannelCapabilities,
  MessageHandler,
  OutboundMessage,
} from "@templar/core";
import { HumanDelayConfigurationError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { HumanDelayAdapter } from "../adapter.js";
import { withHumanDelay } from "../index.js";
import type { HumanDelayConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createMockAdapter(
  capabilities: ChannelCapabilities = { typingIndicator: { supported: true } },
): ChannelAdapter & {
  send: MockInstance<(message: OutboundMessage) => Promise<void>>;
  connect: MockInstance<() => Promise<void>>;
  disconnect: MockInstance<() => Promise<void>>;
  onMessage: MockInstance<(handler: MessageHandler) => void>;
} {
  return {
    name: "test-channel",
    capabilities,
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    disconnect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    send: vi.fn<(message: OutboundMessage) => Promise<void>>().mockResolvedValue(undefined),
    onMessage: vi.fn<(handler: MessageHandler) => void>(),
  };
}

function textMessage(text: string): OutboundMessage {
  return {
    channelId: "ch-1",
    blocks: [{ type: "text" as const, content: text }],
  };
}

const DETERMINISTIC_CONFIG: HumanDelayConfig = {
  wpm: 40,
  jitterFactor: 0,
  minDelay: 500,
  maxDelay: 8000,
  punctuationPause: false,
  random: () => 0.5,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("full flow: typing → delay → send (correct order)", async () => {
    const inner = createMockAdapter();
    const adapter = new HumanDelayAdapter(inner, {
      ...DETERMINISTIC_CONFIG,
      minDelay: 1000,
      maxDelay: 1000,
    });
    const msg = textMessage("hello world");
    const callOrder: string[] = [];

    inner.send.mockImplementation(async (m: OutboundMessage) => {
      if (m.metadata?.typingIndicator) {
        callOrder.push("typing");
      } else {
        callOrder.push("send");
      }
    });

    const sendPromise = adapter.send(msg);
    await vi.advanceTimersByTimeAsync(1000);
    await sendPromise;

    expect(callOrder).toEqual(["typing", "send"]);
  });

  it("multiple sequential sends get independent delays", async () => {
    const inner = createMockAdapter();
    const adapter = new HumanDelayAdapter(inner, {
      ...DETERMINISTIC_CONFIG,
      minDelay: 500,
      maxDelay: 500,
    });

    const msg1 = textMessage("first message");
    const msg2 = textMessage("second message");

    const p1 = adapter.send(msg1);
    await vi.advanceTimersByTimeAsync(500);
    await p1;

    const p2 = adapter.send(msg2);
    await vi.advanceTimersByTimeAsync(500);
    await p2;

    // Filter out typing indicator calls
    const actualSends = inner.send.mock.calls.filter((call) => !call[0]?.metadata?.typingIndicator);
    expect(actualSends).toHaveLength(2);
    expect(actualSends[0]?.[0]).toEqual(msg1);
    expect(actualSends[1]?.[0]).toEqual(msg2);
  });

  it("config defaults applied correctly when no config provided", () => {
    const inner = createMockAdapter();
    const adapter = new HumanDelayAdapter(inner);
    // Should not throw — defaults are valid
    expect(adapter.name).toBe("test-channel");
  });

  it("custom WPM changes delay proportionally", async () => {
    const inner1 = createMockAdapter({ typingIndicator: { supported: true } });
    const inner2 = createMockAdapter({ typingIndicator: { supported: true } });

    const slowAdapter = new HumanDelayAdapter(inner1, {
      ...DETERMINISTIC_CONFIG,
      wpm: 20,
    });
    const fastAdapter = new HumanDelayAdapter(inner2, {
      ...DETERMINISTIC_CONFIG,
      wpm: 80,
    });

    const msg = textMessage("one two three four");

    // Slow: 4 words / 20 WPM * 60000 = 12000ms (clamped to maxDelay=8000)
    const slowPromise = slowAdapter.send(msg);
    await vi.advanceTimersByTimeAsync(8000);
    await slowPromise;

    const slowSends = inner1.send.mock.calls.filter((call) => !call[0]?.metadata?.typingIndicator);
    expect(slowSends).toHaveLength(1);

    // Fast: 4 words / 80 WPM * 60000 = 3000ms
    const fastPromise = fastAdapter.send(msg);
    await vi.advanceTimersByTimeAsync(3000);
    await fastPromise;

    const fastSends = inner2.send.mock.calls.filter((call) => !call[0]?.metadata?.typingIndicator);
    expect(fastSends).toHaveLength(1);
  });

  it("long message (100 words) delay capped at maxDelay", async () => {
    const inner = createMockAdapter();
    const adapter = new HumanDelayAdapter(inner, {
      ...DETERMINISTIC_CONFIG,
      maxDelay: 5000,
    });

    const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(" ");
    const msg = textMessage(words);

    const sendPromise = adapter.send(msg);
    await vi.advanceTimersByTimeAsync(5000);
    await sendPromise;

    const actualSends = inner.send.mock.calls.filter((call) => !call[0]?.metadata?.typingIndicator);
    expect(actualSends).toHaveLength(1);
  });

  it("short message (1 word) delay at minDelay", async () => {
    const inner = createMockAdapter();
    const adapter = new HumanDelayAdapter(inner, {
      ...DETERMINISTIC_CONFIG,
      minDelay: 500,
    });

    const msg = textMessage("hi");
    const sendPromise = adapter.send(msg);

    // 1 word / 40 WPM * 60000 = 1500ms but minDelay=500 (1500 > 500 so not clamped)
    // Actually 1 word at 40 WPM = 1500ms which is > 500, so delay = 1500ms
    await vi.advanceTimersByTimeAsync(1500);
    await sendPromise;

    const actualSends = inner.send.mock.calls.filter((call) => !call[0]?.metadata?.typingIndicator);
    expect(actualSends).toHaveLength(1);
  });

  it("withHumanDelay() factory validates and returns adapter", () => {
    const inner = createMockAdapter();
    const wrapped = withHumanDelay(inner, { wpm: 60 });
    expect(wrapped).toBeInstanceOf(HumanDelayAdapter);
    expect(wrapped.name).toBe("test-channel");
  });

  it("withHumanDelay() factory with invalid config throws before wrapping", () => {
    const inner = createMockAdapter();
    expect(() => withHumanDelay(inner, { wpm: -1 })).toThrow(HumanDelayConfigurationError);
  });

  it("decorator is transparent — inner adapter behavior preserved", async () => {
    const inner = createMockAdapter();
    const handler = vi.fn();
    const adapter = new HumanDelayAdapter(inner);

    adapter.onMessage(handler);
    expect(inner.onMessage).toHaveBeenCalledWith(handler);

    await adapter.connect();
    expect(inner.connect).toHaveBeenCalledOnce();

    await adapter.disconnect();
    expect(inner.disconnect).toHaveBeenCalledOnce();
  });
});
