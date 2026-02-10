import type { InboundMessage, OutboundMessage } from "@templar/core";
import { ChannelLoadError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramChannel } from "../../adapter.js";
import { TELEGRAM_CAPABILITIES } from "../../capabilities.js";

// ---------------------------------------------------------------------------
// We mock grammY's Bot class at the module level to avoid real network calls.
// The mock captures method calls and allows us to simulate bot behavior.
// ---------------------------------------------------------------------------

const mockBotInit = vi.fn().mockResolvedValue(undefined);
const mockBotStart = vi.fn();
const mockBotStop = vi.fn().mockResolvedValue(undefined);
const mockBotOn = vi.fn();
const mockBotCatch = vi.fn();
const mockSetWebhook = vi.fn().mockResolvedValue(true);
const mockDeleteWebhook = vi.fn().mockResolvedValue(true);
const mockSendMessage = vi.fn().mockResolvedValue({
  message_id: 1,
  date: 1234,
  chat: { id: 123, type: "private" },
});
const mockSendChatAction = vi.fn().mockResolvedValue(true);
const mockSendPhoto = vi.fn().mockResolvedValue({
  message_id: 2,
  date: 1234,
  chat: { id: 123, type: "private" },
});
const mockConfigUse = vi.fn();

vi.mock("grammy", () => {
  return {
    Bot: class MockBot {
      botInfo = {
        id: 999,
        is_bot: true,
        first_name: "TestBot",
        username: "test_bot",
        can_join_groups: true,
        can_read_all_group_messages: false,
        supports_inline_queries: false,
        can_connect_to_business: false,
        has_main_web_app: false,
      };

      api = {
        config: { use: mockConfigUse },
        setWebhook: mockSetWebhook,
        deleteWebhook: mockDeleteWebhook,
        sendMessage: mockSendMessage,
        sendPhoto: mockSendPhoto,
        sendChatAction: mockSendChatAction,
        getFile: vi.fn().mockResolvedValue({
          file_id: "f1",
          file_unique_id: "u1",
          file_path: "photos/f1.jpg",
        }),
      };

      init = mockBotInit;
      start = mockBotStart;
      stop = mockBotStop;
      on = mockBotOn;
      catch = mockBotCatch;
    },
  };
});

vi.mock("@grammyjs/auto-retry", () => ({
  autoRetry: () => () => {},
}));

describe("TelegramChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates adapter with valid polling config", () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      expect(adapter.name).toBe("telegram");
      expect(adapter.capabilities).toBe(TELEGRAM_CAPABILITIES);
    });

    it("creates adapter with valid webhook config", () => {
      const adapter = new TelegramChannel({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
      });
      expect(adapter.name).toBe("telegram");
    });

    it("throws ChannelLoadError for invalid config", () => {
      expect(() => new TelegramChannel({ mode: "polling" })).toThrow(ChannelLoadError);
    });

    it("throws ChannelLoadError for missing mode", () => {
      expect(() => new TelegramChannel({ token: "123:ABC" })).toThrow(ChannelLoadError);
    });

    it("installs auto-retry plugin", () => {
      new TelegramChannel({ mode: "polling", token: "123:ABC" });
      expect(mockConfigUse).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // connect()
  // -----------------------------------------------------------------------

  describe("connect()", () => {
    it("calls bot.init() in polling mode", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      await adapter.connect();

      expect(mockBotInit).toHaveBeenCalledOnce();
      expect(mockBotStart).toHaveBeenCalledOnce();
    });

    it("calls bot.api.setWebhook() in webhook mode", async () => {
      const adapter = new TelegramChannel({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
        secretToken: "my-secret",
      });
      await adapter.connect();

      expect(mockBotInit).toHaveBeenCalledOnce();
      expect(mockSetWebhook).toHaveBeenCalledWith("https://example.com/webhook", {
        secret_token: "my-secret",
      });
    });

    it("is idempotent — second call is a no-op", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      await adapter.connect();
      await adapter.connect();

      expect(mockBotInit).toHaveBeenCalledOnce();
      expect(mockBotStart).toHaveBeenCalledOnce();
    });

    it("throws ChannelLoadError if bot.init() fails", async () => {
      mockBotInit.mockRejectedValueOnce(new Error("Invalid token"));

      const adapter = new TelegramChannel({
        mode: "polling",
        token: "bad:token",
      });

      await expect(adapter.connect()).rejects.toThrow(ChannelLoadError);
    });

    it("includes descriptive message when bot.init() fails", async () => {
      mockBotInit.mockRejectedValueOnce(new Error("Invalid token"));

      const adapter = new TelegramChannel({
        mode: "polling",
        token: "bad:token",
      });

      await expect(adapter.connect()).rejects.toThrow(/Failed to initialize bot/);
    });
  });

  // -----------------------------------------------------------------------
  // disconnect()
  // -----------------------------------------------------------------------

  describe("disconnect()", () => {
    it("calls bot.stop() in polling mode", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      await adapter.connect();
      await adapter.disconnect();

      expect(mockBotStop).toHaveBeenCalledOnce();
    });

    it("calls bot.api.deleteWebhook() in webhook mode", async () => {
      const adapter = new TelegramChannel({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
      });
      await adapter.connect();
      await adapter.disconnect();

      expect(mockDeleteWebhook).toHaveBeenCalledOnce();
    });

    it("is idempotent — second call is a no-op", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect();

      expect(mockBotStop).toHaveBeenCalledOnce();
    });

    it("is safe to call before connect()", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      await adapter.disconnect(); // Should not throw

      expect(mockBotStop).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------

  describe("send()", () => {
    it("throws if not connected", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });

      const msg: OutboundMessage = {
        channelId: "123",
        blocks: [{ type: "text", content: "hi" }],
      };

      await expect(adapter.send(msg)).rejects.toThrow(ChannelLoadError);
      await expect(adapter.send(msg)).rejects.toThrow(/not connected/i);
    });

    it("calls renderMessage when connected", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      await adapter.connect();

      const msg: OutboundMessage = {
        channelId: "123",
        blocks: [{ type: "text", content: "Hello" }],
      };
      await adapter.send(msg);

      // Should have called sendChatAction and sendMessage
      expect(mockSendChatAction).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // onMessage()
  // -----------------------------------------------------------------------

  describe("onMessage()", () => {
    it("registers a message handler on the bot", () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });

      const handler = vi.fn();
      adapter.onMessage(handler);

      expect(mockBotOn).toHaveBeenCalledWith("message", expect.any(Function));
      expect(mockBotCatch).toHaveBeenCalledWith(expect.any(Function));
    });

    it("calls handler with normalized inbound message", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });

      const handler = vi.fn();
      adapter.onMessage(handler);

      // Get the registered handler
      const registeredHandler = mockBotOn.mock.calls[0]![1] as (ctx: any) => Promise<void>;

      // Simulate an incoming message
      const ctx = {
        update: {
          update_id: 1,
          message: {
            message_id: 42,
            date: 1700000000,
            chat: { id: 123, type: "private", first_name: "User" },
            from: { id: 456, is_bot: false, first_name: "User" },
            text: "Hello bot",
          },
        },
      };

      await registeredHandler(ctx);

      expect(handler).toHaveBeenCalledOnce();
      const inbound = handler.mock.calls[0]![0] as InboundMessage;
      expect(inbound.channelType).toBe("telegram");
      expect(inbound.channelId).toBe("123");
      expect(inbound.senderId).toBe("456");
      expect(inbound.blocks[0]).toEqual({
        type: "text",
        content: "Hello bot",
      });
    });

    it("does not crash when handler throws", async () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = vi.fn().mockRejectedValue(new Error("handler error"));
      adapter.onMessage(handler);

      const registeredHandler = mockBotOn.mock.calls[0]![1] as (ctx: any) => Promise<void>;

      const ctx = {
        update: {
          update_id: 2,
          message: {
            message_id: 43,
            date: 1700000000,
            chat: { id: 123, type: "private", first_name: "User" },
            from: { id: 456, is_bot: false, first_name: "User" },
            text: "trigger error",
          },
        },
      };

      // Should not throw
      await registeredHandler(ctx);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------------

  describe("properties", () => {
    it("has name 'telegram'", () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      expect(adapter.name).toBe("telegram");
    });

    it("has TELEGRAM_CAPABILITIES as capabilities", () => {
      const adapter = new TelegramChannel({
        mode: "polling",
        token: "123:ABC",
      });
      expect(adapter.capabilities).toBe(TELEGRAM_CAPABILITIES);
    });

    it("exposes getBot() for webhook integration", () => {
      const adapter = new TelegramChannel({
        mode: "webhook",
        token: "123:ABC",
        webhookUrl: "https://example.com/webhook",
      });
      expect(adapter.getBot()).toBeDefined();
    });
  });
});
