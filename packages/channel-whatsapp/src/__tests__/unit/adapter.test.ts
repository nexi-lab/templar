import { ChannelLoadError, ChannelSendError } from "@templar/errors";
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

// Must import after mock
const { WhatsAppChannel } = await import("../../adapter.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAdapter(overrides: Record<string, unknown> = {}) {
  const authState = new InMemoryAuthState();
  const onConnectionUpdate = vi.fn();
  const onQR = vi.fn();

  const adapter = new WhatsAppChannel({
    authStateProvider: authState,
    onConnectionUpdate,
    onQR,
    connectTimeoutMs: 5000,
    ...overrides,
  });

  return { adapter, authState, onConnectionUpdate, onQR };
}

async function connectAdapter(adapter: InstanceType<typeof WhatsAppChannel>) {
  const connectPromise = adapter.connect();
  // Simulate Baileys emitting connection.open
  await vi.waitFor(() => {
    const handlers = mockSocket.ev.handlers.get("connection.update") ?? [];
    if (handlers.length === 0) throw new Error("No handlers registered yet");
  });
  // Emit connection open
  mockSocket.ev.emit("connection.update", {
    connection: "open",
  });
  await connectPromise;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WhatsAppChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = createMockSocket();
    // Re-set implementations so they return the new mockSocket
    mockMakeWASocket.mockImplementation((..._args: unknown[]) => mockSocket);
    mockMakeCacheableSignalKeyStore.mockImplementation((keys: unknown) => keys);
    mockFetchLatestBaileysVersion.mockImplementation(async () => ({ version: [2, 2412, 1] }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  describe("constructor", () => {
    it("should validate config via parseWhatsAppConfig", () => {
      expect(() => new WhatsAppChannel({ connectTimeoutMs: -1 })).toThrow(ChannelLoadError);
    });

    it("should accept valid config", () => {
      const { adapter } = createAdapter();
      expect(adapter.name).toBe("whatsapp");
      expect(adapter.capabilities.text?.maxLength).toBe(65_536);
    });
  });

  // -----------------------------------------------------------------------
  // connect()
  // -----------------------------------------------------------------------
  describe("connect()", () => {
    it("should lazy-load Baileys and create socket", async () => {
      const { adapter } = createAdapter();
      await connectAdapter(adapter);
      expect(mockMakeWASocket).toHaveBeenCalled();
      expect(mockFetchLatestBaileysVersion).toHaveBeenCalled();
    });

    it("should be idempotent (second call returns early)", async () => {
      const { adapter } = createAdapter();
      await connectAdapter(adapter);

      // Second call should return immediately
      await adapter.connect();
      expect(mockMakeWASocket).toHaveBeenCalledTimes(1);
    });

    it("should call onQR callback when QR is received", async () => {
      const { adapter, onQR } = createAdapter();

      const connectPromise = adapter.connect();

      await vi.waitFor(() => {
        const handlers = mockSocket.ev.handlers.get("connection.update") ?? [];
        if (handlers.length === 0) throw new Error("Waiting for handlers");
      });

      // Emit QR
      mockSocket.ev.emit("connection.update", {
        qr: "qr-code-string",
      });

      // Then connect
      mockSocket.ev.emit("connection.update", {
        connection: "open",
      });
      await connectPromise;

      expect(onQR).toHaveBeenCalledWith("qr-code-string");
    });

    it("should call onConnectionUpdate on state changes", async () => {
      const { adapter, onConnectionUpdate } = createAdapter();
      await connectAdapter(adapter);

      expect(onConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: "connecting" }),
      );
      expect(onConnectionUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: "open" }));
    });
  });

  // -----------------------------------------------------------------------
  // disconnect()
  // -----------------------------------------------------------------------
  describe("disconnect()", () => {
    it("should call socket.end() and flush auth state", async () => {
      const { adapter } = createAdapter();
      await connectAdapter(adapter);

      await adapter.disconnect();
      expect(mockSocket.end).toHaveBeenCalled();
    });

    it("should be idempotent (safe to call when not connected)", async () => {
      const { adapter } = createAdapter();
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------
  describe("send()", () => {
    it("should throw ChannelSendError when not connected", async () => {
      const { adapter } = createAdapter();
      await expect(
        adapter.send({
          channelId: "5511999@s.whatsapp.net",
          blocks: [{ type: "text", content: "hello" }],
        }),
      ).rejects.toThrow(ChannelSendError);
    });

    it("should send text message via renderer", async () => {
      const { adapter } = createAdapter();
      await connectAdapter(adapter);

      await adapter.send({
        channelId: "5511999@s.whatsapp.net",
        blocks: [{ type: "text", content: "Hello" }],
      });

      expect(mockSocket.sendMessage).toHaveBeenCalledWith(
        "5511999@s.whatsapp.net",
        { text: "Hello" },
        {},
      );
    });
  });

  // -----------------------------------------------------------------------
  // onMessage()
  // -----------------------------------------------------------------------
  describe("onMessage()", () => {
    it("should register handler and receive normalized messages", async () => {
      const { adapter } = createAdapter();
      const handler = vi.fn();
      adapter.onMessage(handler);

      await connectAdapter(adapter);

      // Simulate incoming message
      const msg = createMockMessage({
        text: "Hello from WhatsApp",
        remoteJid: "5511888@s.whatsapp.net",
      });

      mockSocket.ev.emit("messages.upsert", {
        type: "notify",
        messages: [msg],
      });

      // Allow async handler to process
      await vi.advanceTimersByTimeAsync(10);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: "whatsapp",
          channelId: "5511888@s.whatsapp.net",
          blocks: expect.arrayContaining([{ type: "text", content: "Hello from WhatsApp" }]),
        }),
      );
    });

    it("should skip history sync messages when syncHistory is false", async () => {
      const { adapter } = createAdapter({ syncHistory: false });
      const handler = vi.fn();
      adapter.onMessage(handler);

      await connectAdapter(adapter);

      const msg = createMockMessage({ text: "old message" });
      mockSocket.ev.emit("messages.upsert", {
        type: "append",
        messages: [msg],
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(handler).not.toHaveBeenCalled();
    });

    it("should filter self-messages", async () => {
      const { adapter } = createAdapter();
      const handler = vi.fn();
      adapter.onMessage(handler);

      await connectAdapter(adapter);

      const msg = createMockMessage({ text: "my own message", fromMe: true });
      mockSocket.ev.emit("messages.upsert", {
        type: "notify",
        messages: [msg],
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Reconnection scenarios
  // -----------------------------------------------------------------------
  describe("reconnection", () => {
    it("should reconnect with exponential backoff on connectionLost", async () => {
      const { adapter, onConnectionUpdate } = createAdapter({
        reconnectBaseDelay: 1000,
        maxReconnectAttempts: 3,
      });
      await connectAdapter(adapter);

      // Simulate connectionLost
      mockSocket.ev.emit("connection.update", {
        connection: "close",
        lastDisconnect: {
          error: { output: { statusCode: 428 } },
        },
      });

      // Should emit reconnecting
      await vi.advanceTimersByTimeAsync(10);
      expect(onConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "reconnecting",
          attempt: 1,
        }),
      );
    });

    it("should NOT reconnect on loggedOut (401)", async () => {
      const { adapter, authState, onConnectionUpdate } = createAdapter();
      await connectAdapter(adapter);

      mockSocket.ev.emit("connection.update", {
        connection: "close",
        lastDisconnect: {
          error: { output: { statusCode: 401 } },
        },
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(onConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          reason: expect.stringContaining("re-authentication"),
        }),
      );
      expect(authState.clear).toHaveBeenCalled();
    });

    it("should NOT reconnect on connectionReplaced (440)", async () => {
      const { adapter, onConnectionUpdate } = createAdapter();
      await connectAdapter(adapter);

      mockSocket.ev.emit("connection.update", {
        connection: "close",
        lastDisconnect: {
          error: { output: { statusCode: 440 } },
        },
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(onConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          reason: expect.stringContaining("replaced"),
        }),
      );
    });

    it("should clear auth state on badSession (411)", async () => {
      const { adapter, authState, onConnectionUpdate } = createAdapter();
      await connectAdapter(adapter);

      mockSocket.ev.emit("connection.update", {
        connection: "close",
        lastDisconnect: {
          error: { output: { statusCode: 411 } },
        },
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(authState.clear).toHaveBeenCalled();
      expect(onConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          reason: expect.stringContaining("Invalid session"),
        }),
      );
    });

    it("should stop after maxReconnectAttempts exhausted", async () => {
      const { adapter, onConnectionUpdate } = createAdapter({
        maxReconnectAttempts: 0,
        reconnectBaseDelay: 100,
      });
      await connectAdapter(adapter);

      mockSocket.ev.emit("connection.update", {
        connection: "close",
        lastDisconnect: {
          error: { output: { statusCode: 428 } },
        },
      });

      await vi.advanceTimersByTimeAsync(10);
      expect(onConnectionUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          reason: expect.stringContaining("Max reconnect attempts"),
        }),
      );
    });
  });
});
