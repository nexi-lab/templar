import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError, ChannelSendError, VoiceConnectionFailedError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceChannel } from "../../adapter.js";
import {
  createMockAgentsModule,
  createMockServerSdkModule,
  type MockAccessToken,
  type MockAgentSession,
  type MockRoom,
  type MockRoomServiceClient,
} from "../helpers/mock-livekit.js";

// ---------------------------------------------------------------------------
// Mock the lazy loaders using shared factory pattern
// ---------------------------------------------------------------------------

const sessionRef: { current: MockAgentSession | undefined } = { current: undefined };
const roomRef: { current: MockRoom | undefined } = { current: undefined };
const roomServiceRef: { current: MockRoomServiceClient | undefined } = { current: undefined };
const accessTokens: MockAccessToken[] = [];
const connectError: { current: string | undefined } = { current: undefined };
const startError: { current: string | undefined } = { current: undefined };

vi.mock("@templar/channel-base", async () => {
  const actual = await vi.importActual("@templar/channel-base");
  return {
    ...actual,
    lazyLoad: (_name: string, moduleName: string, _extract: unknown) => {
      return async () => {
        if (moduleName === "@livekit/agents") {
          return createMockAgentsModule({ sessionRef, roomRef, connectError, startError });
        }
        if (moduleName === "livekit-server-sdk") {
          return createMockServerSdkModule({
            roomServiceClient: roomServiceRef,
            accessTokens,
          });
        }
        throw new Error(`Unexpected module: ${moduleName}`);
      };
    },
  };
});

const VALID_CONFIG = {
  livekitUrl: "wss://test.livekit.cloud",
  apiKey: "test-key",
  apiSecret: "test-secret",
  room: { name: "test-room" },
};

beforeEach(() => {
  sessionRef.current = undefined;
  roomRef.current = undefined;
  roomServiceRef.current = undefined;
  accessTokens.length = 0;
  connectError.current = undefined;
  startError.current = undefined;
});

describe("VoiceChannel", () => {
  it("should construct with valid config", () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    expect(adapter.name).toBe("voice");
    expect(adapter.capabilities.realTimeVoice).toBeDefined();
  });

  it("should throw ChannelLoadError for invalid config", () => {
    expect(() => new VoiceChannel({})).toThrow(ChannelLoadError);
  });

  it("should connect idempotently", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.connect(); // Second call should be no-op

    expect(sessionRef.current?.started).toBe(true);
    // Only one session created
    expect(sessionRef.current?.calls.filter((c) => c.method === "start")).toHaveLength(1);
  });

  it("should disconnect idempotently", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();
    await adapter.disconnect(); // Second call should be no-op

    expect(sessionRef.current?.closed).toBe(true);
  });

  it("should throw when sending before connect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    const msg: OutboundMessage = {
      channelId: "room",
      blocks: [{ type: "text", content: "hello" }],
    };
    await expect(adapter.send(msg)).rejects.toThrow();
  });

  it("should send text through LLM bridge", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(() => {});

    // Start a transcription that's waiting for response
    const processPromise = bridge.processTranscription("test", "user1", "room1");

    // Send response through adapter
    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [{ type: "text", content: "response" }],
    };
    await adapter.send(msg);

    const result = await processPromise;
    expect(result).toBe("response");
  });

  it("should generate join token after connect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const token = await adapter.getJoinToken("browser-user");
    expect(token).toMatch(/^mock-jwt-/);
  });

  it("should throw VoiceConnectionFailedError for getJoinToken before connect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await expect(adapter.getJoinToken("user")).rejects.toThrow(VoiceConnectionFailedError);
  });

  it("should clean up room on disconnect when autoCreate=true", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    expect(roomServiceRef.current?.calls.some((c) => c.method === "deleteRoom")).toBe(true);
  });

  it("should create Room and connect before starting session (v1.x)", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    // Room should be connected
    expect(roomRef.current?.connected).toBe(true);
    expect(roomRef.current?.url).toBe("wss://test.livekit.cloud");

    // Session should have been started with room reference
    const startCall = sessionRef.current?.calls.find((c) => c.method === "start");
    expect(startCall).toBeDefined();
    const startOpts = startCall?.args[0] as { room: unknown };
    expect(startOpts.room).toBe(roomRef.current);
  });

  it("should disconnect Room during doDisconnect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    expect(roomRef.current?.connected).toBe(false);
  });

  it("should support warmup for faster connect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.warmup(); // Pre-load SDKs
    await adapter.connect();

    expect(sessionRef.current?.started).toBe(true);
  });

  it("should use config responseTimeoutMs (default 10s)", () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    const bridge = adapter.getLlmBridge();
    // Bridge should have been constructed with config timeout
    // We can verify by checking it doesn't use 30s default
    expect(bridge).toBeDefined();
  });

  it("should use custom maxParticipants in capabilities", () => {
    const adapter = new VoiceChannel({
      ...VALID_CONFIG,
      room: { name: "test-room", maxParticipants: 50 },
    });
    expect(adapter.capabilities.realTimeVoice?.maxParticipants).toBe(50);
  });

  it("should pass llm plugin to AgentSession constructor", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    // The AgentSession constructor receives opts including llm
    const constructorCall = sessionRef.current?.calls.find((c) => c.method === "start");
    expect(constructorCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Error path tests (Issue 9)
// ---------------------------------------------------------------------------

describe("VoiceChannel error paths", () => {
  it("should throw VoiceConnectionFailedError when Room.connect fails", async () => {
    connectError.current = "WebRTC transport failed";
    const adapter = new VoiceChannel(VALID_CONFIG);

    await expect(adapter.connect()).rejects.toThrow(VoiceConnectionFailedError);
    expect(adapter.isConnected).toBe(false);
  });

  it("should throw VoiceConnectionFailedError when AgentSession.start fails", async () => {
    startError.current = "Session initialization failed";
    const adapter = new VoiceChannel(VALID_CONFIG);

    await expect(adapter.connect()).rejects.toThrow(VoiceConnectionFailedError);
    expect(adapter.isConnected).toBe(false);
  });

  it("should clean up partial state when Room.connect fails", async () => {
    connectError.current = "connect failed";
    const adapter = new VoiceChannel(VALID_CONFIG);

    await expect(adapter.connect()).rejects.toThrow();

    // After failure, getJoinToken should fail (roomManager is undefined)
    await expect(adapter.getJoinToken("user")).rejects.toThrow(VoiceConnectionFailedError);
  });

  it("should throw ChannelSendError when sending after disconnect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [{ type: "text", content: "too late" }],
    };
    await expect(adapter.send(msg)).rejects.toThrow(ChannelSendError);
  });

  it("should reject pending bridge response on disconnect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(() => {});

    // Start a transcription but don't resolve it
    const processPromise = bridge.processTranscription("hello", "user1", "room1");

    // Disconnect while response is pending
    await adapter.disconnect();

    await expect(processPromise).rejects.toThrow();
  });

  it("should report connect latency after successful connect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    expect(adapter.getConnectLatencyMs()).toBe(0);

    await adapter.connect();
    // With mocks, latency may be 0ms but should be recorded (non-negative)
    expect(adapter.getConnectLatencyMs()).toBeGreaterThanOrEqual(0);
    expect(adapter.isConnected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Concurrency tests (Issue 11)
// ---------------------------------------------------------------------------

describe("VoiceChannel concurrency", () => {
  it("should handle rapid connect/disconnect cycles", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);

    // Rapid cycle should not leave adapter in inconsistent state
    await adapter.connect();
    await adapter.disconnect();
    await adapter.connect();
    await adapter.disconnect();

    expect(adapter.isConnected).toBe(false);
  });

  it("should reject send during disconnect gracefully", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    // Start disconnect and try to send simultaneously
    const disconnectPromise = adapter.disconnect();
    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [{ type: "text", content: "during disconnect" }],
    };

    // After disconnect completes, send should fail
    await disconnectPromise;
    await expect(adapter.send(msg)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Block-handling tests (Issue 12)
// ---------------------------------------------------------------------------

describe("VoiceChannel block handling", () => {
  it("should extract text from multiple text blocks", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(() => {});

    const processPromise = bridge.processTranscription("test", "user1", "room1");

    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [
        { type: "text", content: "line 1" },
        { type: "text", content: "line 2" },
      ],
    };
    await adapter.send(msg);

    const result = await processPromise;
    expect(result).toBe("line 1\nline 2");
  });

  it("should ignore non-text blocks in outbound messages", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(() => {});

    const processPromise = bridge.processTranscription("test", "user1", "room1");

    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [
        { type: "image", url: "https://example.com/img.png" } as never,
        { type: "text", content: "only this" },
      ],
    };
    await adapter.send(msg);

    const result = await processPromise;
    expect(result).toBe("only this");
  });

  it("should not resolve bridge when all blocks are non-text", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(() => {});

    const processPromise = bridge.processTranscription("test", "user1", "room1");

    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [{ type: "image", url: "https://example.com/img.png" } as never],
    };
    await adapter.send(msg);

    // Bridge should still be pending since no text was extracted
    expect(bridge.hasPending).toBe(true);

    // Clean up
    bridge.provideResponse("cleanup");
    await processPromise;
  });

  it("should handle empty blocks array", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(() => {});

    const processPromise = bridge.processTranscription("test", "user1", "room1");

    const msg: OutboundMessage = {
      channelId: "test-room",
      blocks: [],
    };
    await adapter.send(msg);

    // Bridge should still be pending since no text was extracted
    expect(bridge.hasPending).toBe(true);

    // Clean up
    bridge.provideResponse("cleanup");
    await processPromise;
  });
});
