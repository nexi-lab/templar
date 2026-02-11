import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError, ChannelSendError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SlackChannel } from "../../adapter.js";
import { SLACK_CAPABILITIES } from "../../capabilities.js";
import { createMockApp, type MockAppInstance } from "../helpers/mock-bolt.js";

// ---------------------------------------------------------------------------
// Mock @slack/bolt
// ---------------------------------------------------------------------------

let mockApp: MockAppInstance;

vi.mock("@slack/bolt", () => {
  return {
    App: class MockBoltApp {
      start: MockAppInstance["start"];
      stop: MockAppInstance["stop"];
      client: MockAppInstance["client"];
      message: MockAppInstance["message"];
      error: MockAppInstance["error"];

      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return mockApp;
      }
    },
  };
});

const VALID_CONFIG = {
  mode: "socket",
  token: "xoxb-test-token",
  appToken: "xapp-test-token",
};

describe("SlackChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApp = createMockApp();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates adapter with valid config", () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      expect(adapter.name).toBe("slack");
      expect(adapter.capabilities).toBe(SLACK_CAPABILITIES);
    });

    it("throws ChannelLoadError for invalid config", () => {
      expect(() => new SlackChannel({ mode: "socket" })).toThrow(ChannelLoadError);
    });

    it("throws ChannelLoadError for missing mode", () => {
      expect(
        () =>
          new SlackChannel({
            token: "xoxb-test",
            appToken: "xapp-test",
          }),
      ).toThrow(ChannelLoadError);
    });
  });

  // -----------------------------------------------------------------------
  // connect()
  // -----------------------------------------------------------------------

  describe("connect()", () => {
    it("calls app.start()", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();
      expect(mockApp.start).toHaveBeenCalledOnce();
    });

    it("is idempotent — second call is a no-op", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();
      await adapter.connect();
      expect(mockApp.start).toHaveBeenCalledOnce();
    });

    it("throws ChannelLoadError if app.start() fails", async () => {
      mockApp.start.mockRejectedValueOnce(new Error("Socket failed"));
      const adapter = new SlackChannel(VALID_CONFIG);
      await expect(adapter.connect()).rejects.toThrow(ChannelLoadError);
    });

    it("includes descriptive message when start fails", async () => {
      mockApp.start.mockRejectedValueOnce(new Error("Socket failed"));
      const adapter = new SlackChannel(VALID_CONFIG);
      await expect(adapter.connect()).rejects.toThrow(/Failed to start/);
    });
  });

  // -----------------------------------------------------------------------
  // disconnect()
  // -----------------------------------------------------------------------

  describe("disconnect()", () => {
    it("calls app.stop()", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();
      await adapter.disconnect();
      expect(mockApp.stop).toHaveBeenCalledOnce();
    });

    it("is idempotent — second call is a no-op", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect();
      expect(mockApp.stop).toHaveBeenCalledOnce();
    });

    it("is safe to call before connect()", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.disconnect(); // Should not throw
      expect(mockApp.stop).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------

  describe("send()", () => {
    it("throws ChannelSendError if not connected", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      const msg: OutboundMessage = {
        channelId: "C123",
        blocks: [{ type: "text", content: "hi" }],
      };
      await expect(adapter.send(msg)).rejects.toThrow(ChannelSendError);
      await expect(adapter.send(msg)).rejects.toThrow(/not connected/i);
    });

    it("calls renderMessage when connected", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();

      const msg: OutboundMessage = {
        channelId: "C123",
        blocks: [{ type: "text", content: "Hello" }],
      };
      await adapter.send(msg);

      expect(mockApp.client.chat.postMessage).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // onMessage()
  // -----------------------------------------------------------------------

  describe("onMessage()", () => {
    it("throws ChannelLoadError if app not initialized", () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      // Not connected, so app is undefined
      expect(() => adapter.onMessage(vi.fn())).toThrow(ChannelLoadError);
    });

    it("registers a message handler on the app", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();

      const handler = vi.fn();
      adapter.onMessage(handler);

      expect(mockApp.message).toHaveBeenCalledWith(expect.any(Function));
      expect(mockApp.error).toHaveBeenCalledWith(expect.any(Function));
    });

    it("calls handler with normalized inbound message", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();

      const handler = vi.fn();
      adapter.onMessage(handler);

      // Simulate incoming message through the registered handler
      const registeredHandler = mockApp.messageHandlers[0]!;
      await registeredHandler({
        message: {
          type: "message",
          text: "Hello bot",
          user: "U456",
          channel: "C123",
          ts: "1700000000.000001",
        },
        say: vi.fn(),
        client: mockApp.client,
      });

      expect(handler).toHaveBeenCalledOnce();
      const inbound = handler.mock.calls[0]?.[0];
      expect(inbound.channelType).toBe("slack");
      expect(inbound.channelId).toBe("C123");
      expect(inbound.senderId).toBe("U456");
      expect(inbound.blocks[0]).toEqual({
        type: "text",
        content: "Hello bot",
      });
    });

    it("does not crash when handler throws", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      await adapter.connect();

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = vi.fn().mockRejectedValue(new Error("handler error"));
      adapter.onMessage(handler);

      const registeredHandler = mockApp.messageHandlers[0]!;
      await registeredHandler({
        message: {
          type: "message",
          text: "trigger error",
          user: "U456",
          channel: "C123",
          ts: "1700000000.000001",
        },
        say: vi.fn(),
        client: mockApp.client,
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------------

  describe("properties", () => {
    it("has name 'slack'", () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      expect(adapter.name).toBe("slack");
    });

    it("has SLACK_CAPABILITIES as capabilities", () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      expect(adapter.capabilities).toBe(SLACK_CAPABILITIES);
    });

    it("exposes getApp() for advanced use", async () => {
      const adapter = new SlackChannel(VALID_CONFIG);
      expect(adapter.getApp()).toBeUndefined(); // Before connect
      await adapter.connect();
      expect(adapter.getApp()).toBeDefined(); // After connect
    });
  });
});
