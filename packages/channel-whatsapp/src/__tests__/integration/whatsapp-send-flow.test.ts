import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryAuthState } from "../helpers/in-memory-auth.js";
import { createMockMessage, createMockSocket, type MockWASocket } from "../helpers/mock-baileys.js";

// ---------------------------------------------------------------------------
// Module mock — stable references that survive lazyLoad memoization
// ---------------------------------------------------------------------------

let mockSocket: MockWASocket;

const mockMakeWASocket = vi.fn((..._args: unknown[]) => mockSocket);
const mockMakeCacheableSignalKeyStore = vi.fn((keys: unknown) => keys);
const mockFetchLatestBaileysVersion = vi.fn(async () => ({ version: [2, 2412, 1] }));

vi.mock("@whiskeysockets/baileys", () => ({
  default: mockMakeWASocket,
  makeCacheableSignalKeyStore: mockMakeCacheableSignalKeyStore,
  fetchLatestBaileysVersion: mockFetchLatestBaileysVersion,
  downloadMediaMessage: vi.fn(async () => Buffer.from("mock-media-content")),
  Browsers: {
    macOS: (browser: string) => ["Templar", browser, "22.0"] as const,
  },
}));

const { WhatsAppChannel } = await import("../../adapter.js");

// ---------------------------------------------------------------------------
// Integration test: full connect → message → send → disconnect lifecycle
// ---------------------------------------------------------------------------

describe("WhatsApp send flow (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = createMockSocket();
    mockMakeWASocket.mockImplementation((..._args: unknown[]) => mockSocket);
    mockMakeCacheableSignalKeyStore.mockImplementation((keys: unknown) => keys);
    mockFetchLatestBaileysVersion.mockImplementation(async () => ({ version: [2, 2412, 1] }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should handle full lifecycle: connect → onMessage → send → disconnect", async () => {
    const authState = new InMemoryAuthState();
    const onConnectionUpdate = vi.fn();

    const adapter = new WhatsAppChannel({
      authStateProvider: authState,
      onConnectionUpdate,
      connectTimeoutMs: 5000,
    });

    // --- Step 1: Register message handler ---
    const handler = vi.fn();
    adapter.onMessage(handler);

    // --- Step 2: Connect ---
    const connectPromise = adapter.connect();

    await vi.waitFor(() => {
      const handlers = mockSocket.ev.handlers.get("connection.update") ?? [];
      if (handlers.length === 0) throw new Error("Waiting for handlers");
    });

    mockSocket.ev.emit("connection.update", {
      connection: "open",
    });
    await connectPromise;

    expect(onConnectionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "open" }));

    // --- Step 3: Receive incoming text message ---
    const textMsg = createMockMessage({
      text: "Hello from user",
      remoteJid: "5511888@s.whatsapp.net",
    });

    mockSocket.ev.emit("messages.upsert", {
      type: "notify",
      messages: [textMsg],
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        channelType: "whatsapp",
        channelId: "5511888@s.whatsapp.net",
        blocks: [{ type: "text", content: "Hello from user" }],
      }),
    );

    // --- Step 4: Receive incoming image message ---
    const imageMsg = createMockMessage({
      imageMimetype: "image/png",
      imageCaption: "Check this",
      remoteJid: "5511888@s.whatsapp.net",
      id: "img-msg-1",
    });

    mockSocket.ev.emit("messages.upsert", {
      type: "notify",
      messages: [imageMsg],
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "text", content: "Check this" }),
          expect.objectContaining({
            type: "image",
            url: "whatsapp://media/img-msg-1",
          }),
        ]),
      }),
    );

    // --- Step 5: Send outbound message (text + image) ---
    await adapter.send({
      channelId: "5511888@s.whatsapp.net",
      blocks: [
        { type: "text", content: "Here is a reply with a photo" },
        { type: "image", url: "https://example.com/response.jpg" },
      ],
    });

    expect(mockSocket.sendMessage).toHaveBeenCalledWith(
      "5511888@s.whatsapp.net",
      {
        image: { url: "https://example.com/response.jpg" },
        caption: "Here is a reply with a photo",
      },
      {},
    );

    // --- Step 6: Disconnect ---
    await adapter.disconnect();

    expect(mockSocket.end).toHaveBeenCalled();
    expect(onConnectionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "closed" }));
  });

  it("should handle reconnection during active session", async () => {
    const authState = new InMemoryAuthState();
    const onConnectionUpdate = vi.fn();

    const adapter = new WhatsAppChannel({
      authStateProvider: authState,
      onConnectionUpdate,
      connectTimeoutMs: 5000,
      maxReconnectAttempts: 3,
      reconnectBaseDelay: 100,
    });

    // Connect
    const connectPromise = adapter.connect();

    await vi.waitFor(() => {
      const handlers = mockSocket.ev.handlers.get("connection.update") ?? [];
      if (handlers.length === 0) throw new Error("Waiting for handlers");
    });

    mockSocket.ev.emit("connection.update", {
      connection: "open",
    });
    await connectPromise;

    // Simulate connectionLost
    mockSocket.ev.emit("connection.update", {
      connection: "close",
      lastDisconnect: {
        error: { output: { statusCode: 428 } },
      },
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(onConnectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "reconnecting",
        attempt: 1,
      }),
    );

    // Clean up
    await adapter.disconnect();
  });
});
