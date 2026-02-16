import type { InboundMessage } from "@templar/core";
import { VoicePipelineError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { TemplarLLMBridge } from "../../llm-bridge.js";

describe("TemplarLLMBridge", () => {
  it("should start with no handler and no pending response", () => {
    const bridge = new TemplarLLMBridge();
    expect(bridge.hasHandler).toBe(false);
    expect(bridge.hasPending).toBe(false);
  });

  it("should register a message handler", () => {
    const bridge = new TemplarLLMBridge();
    bridge.setMessageHandler(vi.fn());
    expect(bridge.hasHandler).toBe(true);
  });

  it("should throw VoicePipelineError when no handler registered", async () => {
    const bridge = new TemplarLLMBridge();
    await expect(bridge.processTranscription("hello", "user1", "room1")).rejects.toThrow(
      VoicePipelineError,
    );
  });

  it("should convert transcription to InboundMessage and call handler", async () => {
    const bridge = new TemplarLLMBridge();
    let receivedMessage: InboundMessage | undefined;

    bridge.setMessageHandler((msg) => {
      receivedMessage = msg;
      // Simulate async response from adapter.send()
      bridge.provideResponse("response text");
    });

    const result = await bridge.processTranscription("hello world", "user1", "room1");

    expect(receivedMessage).toBeDefined();
    expect(receivedMessage?.channelType).toBe("voice");
    expect(receivedMessage?.channelId).toBe("room1");
    expect(receivedMessage?.senderId).toBe("user1");
    expect(receivedMessage?.blocks).toHaveLength(1);
    expect(receivedMessage?.blocks[0]).toEqual({ type: "text", content: "hello world" });
    expect(result).toBe("response text");
  });

  it("should resolve pending promise when provideResponse is called", async () => {
    const bridge = new TemplarLLMBridge();

    bridge.setMessageHandler(() => {
      // Handler does nothing — response comes later
    });

    const resultPromise = bridge.processTranscription("test", "user1", "room1");
    expect(bridge.hasPending).toBe(true);

    bridge.provideResponse("delayed response");
    expect(bridge.hasPending).toBe(false);

    const result = await resultPromise;
    expect(result).toBe("delayed response");
  });

  it("should reject pending promise on timeout", async () => {
    const bridge = new TemplarLLMBridge({ responseTimeoutMs: 50 });

    bridge.setMessageHandler(() => {
      // Never provides a response
    });

    await expect(bridge.processTranscription("test", "user1", "room1")).rejects.toThrow(
      VoicePipelineError,
    );
  });

  it("should reject concurrent processTranscription calls", async () => {
    const bridge = new TemplarLLMBridge();

    bridge.setMessageHandler(() => {
      // Slow handler — never provides response
    });

    // First call starts processing
    const first = bridge.processTranscription("first", "user1", "room1");

    // Second call should throw immediately
    await expect(bridge.processTranscription("second", "user1", "room1")).rejects.toThrow(
      VoicePipelineError,
    );

    // Clean up first call
    bridge.provideResponse("done");
    await first;
  });

  it("should handle rejectPending", async () => {
    const bridge = new TemplarLLMBridge();

    bridge.setMessageHandler(() => {});

    const resultPromise = bridge.processTranscription("test", "user1", "room1");

    bridge.rejectPending(new Error("cancelled"));

    await expect(resultPromise).rejects.toThrow("cancelled");
    expect(bridge.hasPending).toBe(false);
  });

  it("should silently ignore provideResponse when no pending", () => {
    const bridge = new TemplarLLMBridge();
    // Should not throw
    bridge.provideResponse("no one listening");
  });
});
