import type { InboundMessage } from "@templar/core";
import { VoicePipelineError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { splitSentences, TemplarLLMBridge } from "../../llm-bridge.js";

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

  it("should track response latency", async () => {
    const bridge = new TemplarLLMBridge();
    expect(bridge.getLastResponseLatencyMs()).toBe(0);

    bridge.setMessageHandler(() => {
      // Small delay to ensure measurable latency
      bridge.provideResponse("fast response");
    });

    await bridge.processTranscription("test", "user1", "room1");
    expect(bridge.getLastResponseLatencyMs()).toBeGreaterThanOrEqual(0);
  });

  it("should yield sentence chunks via asLlmPlugin", async () => {
    const bridge = new TemplarLLMBridge();

    bridge.setMessageHandler(() => {
      bridge.provideResponse("Hello there! How are you? I am fine.");
    });

    const plugin = bridge.asLlmPlugin();
    const chunks: string[] = [];

    for await (const chunk of plugin.chat("hi", "user1", "room1")) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Hello there!", "How are you?", "I am fine."]);
  });

  it("should yield single chunk for single sentence via asLlmPlugin", async () => {
    const bridge = new TemplarLLMBridge();

    bridge.setMessageHandler(() => {
      bridge.provideResponse("Just one sentence");
    });

    const plugin = bridge.asLlmPlugin();
    const chunks: string[] = [];

    for await (const chunk of plugin.chat("hi", "user1", "room1")) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(["Just one sentence"]);
  });
});

describe("splitSentences", () => {
  it("should split text at sentence boundaries", () => {
    expect(splitSentences("Hello. World.")).toEqual(["Hello.", "World."]);
    expect(splitSentences("First! Second? Third.")).toEqual(["First!", "Second?", "Third."]);
  });

  it("should return single-element array for one sentence", () => {
    expect(splitSentences("Just one sentence")).toEqual(["Just one sentence"]);
    expect(splitSentences("With period.")).toEqual(["With period."]);
  });

  it("should return empty array for empty/whitespace input", () => {
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("should handle sentences with no trailing punctuation", () => {
    expect(splitSentences("First sentence. No trailing punct")).toEqual([
      "First sentence.",
      "No trailing punct",
    ]);
  });
});
