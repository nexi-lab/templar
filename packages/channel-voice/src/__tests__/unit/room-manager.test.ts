import { VoiceConnectionFailedError, VoiceRoomError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { RoomManager, type RoomManagerDeps } from "../../room-manager.js";
import { MockAccessToken, MockRoomServiceClient } from "../helpers/mock-livekit.js";

function createMockDeps(): {
  deps: RoomManagerDeps;
  roomClient: MockRoomServiceClient;
  tokens: MockAccessToken[];
} {
  const roomClient = new MockRoomServiceClient();
  const tokens: MockAccessToken[] = [];

  const deps: RoomManagerDeps = {
    RoomServiceClient: class {
      constructor(_url: string, _key: string, _secret: string) {
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return roomClient;
      }
    } as unknown as RoomManagerDeps["RoomServiceClient"],
    AccessToken: class {
      constructor(apiKey: string, apiSecret: string) {
        const token = new MockAccessToken(apiKey, apiSecret);
        tokens.push(token);
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return token;
      }
    } as unknown as RoomManagerDeps["AccessToken"],
  };

  return { deps, roomClient, tokens };
}

describe("RoomManager", () => {
  it("should create room with autoCreate=true", async () => {
    const { deps, roomClient } = createMockDeps();
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret", deps);

    await manager.ensureRoom({
      name: "test-room",
      autoCreate: true,
      emptyTimeout: 300,
      maxParticipants: 10,
    });

    expect(roomClient.calls).toHaveLength(1);
    expect(roomClient.calls[0]?.method).toBe("createRoom");
  });

  it("should verify existing room with autoCreate=false", async () => {
    const { deps, roomClient } = createMockDeps();
    roomClient.addRoom("existing-room");
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret", deps);

    await manager.ensureRoom({
      name: "existing-room",
      autoCreate: false,
      emptyTimeout: 300,
      maxParticipants: 10,
    });

    expect(roomClient.calls).toHaveLength(1);
    expect(roomClient.calls[0]?.method).toBe("listRooms");
  });

  it("should throw VoiceRoomError when room not found and autoCreate=false", async () => {
    const { deps } = createMockDeps();
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret", deps);

    await expect(
      manager.ensureRoom({
        name: "missing-room",
        autoCreate: false,
        emptyTimeout: 300,
        maxParticipants: 10,
      }),
    ).rejects.toThrow(VoiceRoomError);
  });

  it("should generate a JWT token", async () => {
    const { deps, tokens } = createMockDeps();
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret", deps);

    const jwt = await manager.generateToken("user-1", "test-room");

    expect(jwt).toMatch(/^mock-jwt-/);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.grants).toEqual(
      expect.arrayContaining([expect.objectContaining({ roomJoin: true, room: "test-room" })]),
    );
  });

  it("should delete room", async () => {
    const { deps, roomClient } = createMockDeps();
    roomClient.addRoom("to-delete");
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret", deps);

    await manager.deleteRoom("to-delete");

    expect(roomClient.calls).toHaveLength(1);
    expect(roomClient.calls[0]?.method).toBe("deleteRoom");
  });

  it("should throw VoiceConnectionFailedError when deps not set", async () => {
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret");

    await expect(manager.generateToken("user", "room")).rejects.toThrow(VoiceConnectionFailedError);
  });

  it("should wrap createRoom errors in VoiceRoomError", async () => {
    const { deps, roomClient } = createMockDeps();
    roomClient.shouldFail = "network error";
    const manager = new RoomManager("wss://test.livekit.cloud", "key", "secret", deps);

    await expect(
      manager.ensureRoom({
        name: "test",
        autoCreate: true,
        emptyTimeout: 300,
        maxParticipants: 10,
      }),
    ).rejects.toThrow(VoiceRoomError);
  });
});
