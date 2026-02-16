/**
 * E2E lifecycle test — exercises the full VoiceChannel adapter
 * through connect → message flow → disconnect with mocked LiveKit.
 */
import type { InboundMessage, OutboundMessage } from "@templar/core";
import { ChannelSendError, VoiceConnectionFailedError } from "@templar/errors";
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
// Mock lazy loaders
// ---------------------------------------------------------------------------

const sessionRef: { current: MockAgentSession | undefined } = { current: undefined };
const roomRef: { current: MockRoom | undefined } = { current: undefined };
const roomServiceRef: { current: MockRoomServiceClient | undefined } = { current: undefined };
const accessTokens: MockAccessToken[] = [];

/** Server SDK refs — reset per test. May include prePopulatedRooms. */
let serverSdkRefs: {
  roomServiceClient: typeof roomServiceRef;
  accessTokens: typeof accessTokens;
  prePopulatedRooms?: string[];
} = { roomServiceClient: roomServiceRef, accessTokens };

vi.mock("@templar/channel-base", async () => {
  const actual = await vi.importActual("@templar/channel-base");
  return {
    ...actual,
    lazyLoad: (_name: string, moduleName: string, _extract: unknown) => {
      return async () => {
        if (moduleName === "@livekit/agents") {
          return createMockAgentsModule({ sessionRef, roomRef });
        }
        if (moduleName === "livekit-server-sdk") {
          return createMockServerSdkModule(serverSdkRefs);
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
  room: { name: "e2e-room", autoCreate: true },
  sttModel: "deepgram/nova-3",
  ttsModel: "openai/tts-1",
  ttsVoice: "alloy",
};

beforeEach(() => {
  sessionRef.current = undefined;
  roomRef.current = undefined;
  roomServiceRef.current = undefined;
  accessTokens.length = 0;
  serverSdkRefs = { roomServiceClient: roomServiceRef, accessTokens };
});

describe("E2E Lifecycle", () => {
  it("should complete full connect → receive → respond → disconnect cycle", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    const receivedMessages: InboundMessage[] = [];

    // 1. Register message handler before connect
    adapter.onMessage((msg) => {
      receivedMessages.push(msg);
      const response: OutboundMessage = {
        channelId: msg.channelId,
        blocks: [
          {
            type: "text",
            content: `Echo: ${msg.blocks[0]?.type === "text" ? msg.blocks[0].content : ""}`,
          },
        ],
      };
      void adapter.send(response);
    });

    // 2. Connect
    await adapter.connect();
    expect(adapter.isConnected).toBe(true);
    expect(sessionRef.current?.started).toBe(true);
    expect(roomRef.current?.connected).toBe(true);
    expect(roomServiceRef.current?.calls.some((c) => c.method === "createRoom")).toBe(true);

    // 3. Verify agent was passed to session.start()
    const startCall = sessionRef.current?.calls.find((c) => c.method === "start");
    expect(startCall).toBeDefined();
    const startOpts = startCall?.args[0] as { agent: unknown; room: unknown };
    expect(startOpts.agent).toBeDefined();
    expect(startOpts.room).toBe(roomRef.current);

    // 4. Verify agent token was generated
    expect(accessTokens.length).toBeGreaterThan(0);

    // 5. Generate join token for a client
    const clientToken = await adapter.getJoinToken("browser-user");
    expect(clientToken).toMatch(/^mock-jwt-/);

    // 6. Simulate user speech via the LLM bridge
    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(async (msg) => {
      receivedMessages.push(msg);
      bridge.provideResponse(
        `Echo: ${msg.blocks[0]?.type === "text" ? msg.blocks[0].content : ""}`,
      );
    });

    const response = await bridge.processTranscription("Hello from user", "user-1", "e2e-room");
    expect(response).toBe("Echo: Hello from user");
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.senderId).toBe("user-1");
    expect(receivedMessages[0]?.channelType).toBe("voice");

    // 7. Disconnect
    await adapter.disconnect();
    expect(adapter.isConnected).toBe(false);
    expect(sessionRef.current?.closed).toBe(true);
    expect(roomRef.current?.connected).toBe(false);

    // 8. Room should be deleted (autoCreate=true)
    expect(roomServiceRef.current?.calls.some((c) => c.method === "deleteRoom")).toBe(true);
  });

  it("should reject send after disconnect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    const msg: OutboundMessage = {
      channelId: "e2e-room",
      blocks: [{ type: "text", content: "too late" }],
    };
    await expect(adapter.send(msg)).rejects.toThrow(ChannelSendError);
  });

  it("should reject getJoinToken after disconnect", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    await expect(adapter.getJoinToken("user")).rejects.toThrow(VoiceConnectionFailedError);
  });

  it("should handle multiple sequential transcriptions", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    await adapter.connect();

    const bridge = adapter.getLlmBridge();
    const responses: string[] = [];

    bridge.setMessageHandler(async (msg) => {
      const text = msg.blocks[0]?.type === "text" ? msg.blocks[0].content : "";
      bridge.provideResponse(`Reply to: ${text}`);
    });

    for (const input of ["first", "second", "third"]) {
      const resp = await bridge.processTranscription(input, "user-1", "e2e-room");
      responses.push(resp);
    }

    expect(responses).toEqual(["Reply to: first", "Reply to: second", "Reply to: third"]);

    await adapter.disconnect();
  });

  it("should not delete room on disconnect when autoCreate=false", async () => {
    // Use prePopulatedRooms to avoid Object.defineProperty hack
    serverSdkRefs = {
      roomServiceClient: roomServiceRef,
      accessTokens,
      prePopulatedRooms: ["existing-room"],
    };

    const adapter = new VoiceChannel({
      ...VALID_CONFIG,
      room: { name: "existing-room", autoCreate: false },
    });

    await adapter.connect();

    // Clear calls to check disconnect behavior
    if (roomServiceRef.current) {
      roomServiceRef.current.calls.length = 0;
    }

    await adapter.disconnect();

    // deleteRoom should NOT be called
    expect(roomServiceRef.current?.calls.some((c) => c.method === "deleteRoom")).toBeFalsy();
  });
});
