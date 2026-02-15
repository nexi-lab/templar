import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError, VoiceConnectionFailedError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceChannel } from "../../adapter.js";
import {
  createMockAgentsModule,
  createMockServerSdkModule,
  type MockAccessToken,
  type MockAgentSession,
  type MockRoomServiceClient,
} from "../helpers/mock-livekit.js";

// ---------------------------------------------------------------------------
// Mock the lazy loaders (channel-base lazyLoad)
// ---------------------------------------------------------------------------

vi.mock("@templar/channel-base", async () => {
  const actual = await vi.importActual("@templar/channel-base");
  return {
    ...actual,
    lazyLoad: (_name: string, moduleName: string, _extract: unknown) => {
      // Return a function that resolves mocked modules
      return async () => {
        if (moduleName === "@livekit/agents") {
          return createMockAgentsModule(sessionRef);
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

const sessionRef: { current: MockAgentSession | undefined } = { current: undefined };
const roomServiceRef: { current: MockRoomServiceClient | undefined } = { current: undefined };
const accessTokens: MockAccessToken[] = [];

const VALID_CONFIG = {
  livekitUrl: "wss://test.livekit.cloud",
  apiKey: "test-key",
  apiSecret: "test-secret",
  room: { name: "test-room" },
};

beforeEach(() => {
  sessionRef.current = undefined;
  roomServiceRef.current = undefined;
  accessTokens.length = 0;
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
});
