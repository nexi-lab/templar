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
  type MockRoomServiceClient,
} from "../helpers/mock-livekit.js";

// ---------------------------------------------------------------------------
// Mock lazy loaders
// ---------------------------------------------------------------------------

const sessionRef: { current: MockAgentSession | undefined } = { current: undefined };
const roomServiceRef: { current: MockRoomServiceClient | undefined } = { current: undefined };
const accessTokens: MockAccessToken[] = [];

vi.mock("@templar/channel-base", async () => {
  const actual = await vi.importActual("@templar/channel-base");
  return {
    ...actual,
    lazyLoad: (_name: string, moduleName: string, _extract: unknown) => {
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
  roomServiceRef.current = undefined;
  accessTokens.length = 0;
});

describe("E2E Lifecycle", () => {
  it("should complete full connect → receive → respond → disconnect cycle", async () => {
    const adapter = new VoiceChannel(VALID_CONFIG);
    const receivedMessages: InboundMessage[] = [];

    // 1. Register message handler before connect
    adapter.onMessage((msg) => {
      receivedMessages.push(msg);
      // Simulate agent response
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
    expect(roomServiceRef.current?.calls.some((c) => c.method === "createRoom")).toBe(true);

    // 3. Verify agent token was generated
    expect(accessTokens.length).toBeGreaterThan(0);

    // 4. Generate join token for a client
    const clientToken = await adapter.getJoinToken("browser-user");
    expect(clientToken).toMatch(/^mock-jwt-/);

    // 5. Simulate user speech event via the agent session
    const bridge = adapter.getLlmBridge();
    bridge.setMessageHandler(async (msg) => {
      receivedMessages.push(msg);
      // Respond through the bridge
      bridge.provideResponse(
        `Echo: ${msg.blocks[0]?.type === "text" ? msg.blocks[0].content : ""}`,
      );
    });

    const response = await bridge.processTranscription("Hello from user", "user-1", "e2e-room");
    expect(response).toBe("Echo: Hello from user");
    expect(receivedMessages).toHaveLength(1);
    expect(receivedMessages[0]?.senderId).toBe("user-1");
    expect(receivedMessages[0]?.channelType).toBe("voice");

    // 6. Disconnect
    await adapter.disconnect();
    expect(adapter.isConnected).toBe(false);
    expect(sessionRef.current?.closed).toBe(true);

    // 7. Room should be deleted (autoCreate=true)
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
    const adapter = new VoiceChannel({
      ...VALID_CONFIG,
      room: { name: "existing-room", autoCreate: false },
    });

    // Connect will create the mock RoomServiceClient via the factory.
    // We need to ensure the room exists in the mock before ensureRoom checks.
    // Override the mock factory's RoomServiceClient to pre-populate rooms.
    // The roomServiceRef gets set during connect, but listRooms is called
    // during the same connect. We use a workaround: the MockRoomServiceClient
    // constructor is called first, then ensureRoom. We hook into roomServiceRef
    // to add the room immediately after creation.
    const origCurrent = Object.getOwnPropertyDescriptor(roomServiceRef, "current");
    let intercepted = false;
    Object.defineProperty(roomServiceRef, "current", {
      configurable: true,
      get: () => origCurrent?.value,
      set: (v) => {
        if (origCurrent) origCurrent.value = v;
        if (v && !intercepted) {
          intercepted = true;
          v.addRoom("existing-room");
        }
      },
    });

    await adapter.connect();

    // Restore normal property
    Object.defineProperty(roomServiceRef, "current", {
      configurable: true,
      writable: true,
      value: roomServiceRef.current,
    });

    // Clear calls to check disconnect behavior
    if (roomServiceRef.current) {
      roomServiceRef.current.calls.length = 0;
    }

    await adapter.disconnect();

    // deleteRoom should NOT be called
    expect(roomServiceRef.current?.calls.some((c) => c.method === "deleteRoom")).toBeFalsy();
  });
});
