import type { OutboundMessage } from "@templar/core";
import { ChannelSendError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelegramChannel } from "../../adapter.js";

// ---------------------------------------------------------------------------
// Mock grammY
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
const mockSendDocument = vi.fn().mockResolvedValue({
  message_id: 3,
  date: 1234,
  chat: { id: 123, type: "private" },
});
const mockConfigUse = vi.fn();

vi.mock("grammy", () => ({
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
      sendDocument: mockSendDocument,
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
}));

vi.mock("@grammyjs/auto-retry", () => ({
  autoRetry: () => () => {},
}));

const POLLING_CONFIG = { mode: "polling" as const, token: "123:ABC-integration" };

describe("Telegram send flow (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("full lifecycle: connect → onMessage → send → disconnect", async () => {
    const adapter = new TelegramChannel(POLLING_CONFIG);

    // --- Connect ---
    await adapter.connect();
    expect(mockBotInit).toHaveBeenCalledOnce();
    expect(mockBotStart).toHaveBeenCalledOnce();
    expect(adapter.getBot()).toBeDefined();

    // --- Register message handler ---
    const handler = vi.fn();
    adapter.onMessage(handler);
    expect(mockBotOn).toHaveBeenCalledWith("message", expect.any(Function));

    // --- Simulate incoming message ---
    const registeredHandler = mockBotOn.mock.calls.find(
      (c: unknown[]) => c[0] === "message",
    )?.[1] as (ctx: Record<string, unknown>) => Promise<void>;
    expect(registeredHandler).toBeDefined();

    await registeredHandler({
      update: {
        update_id: 1,
        message: {
          message_id: 42,
          date: 1700000000,
          chat: { id: 123, type: "private", first_name: "User" },
          from: { id: 456, is_bot: false, first_name: "User" },
          text: "Hello from user",
        },
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(handler).toHaveBeenCalledOnce();
    const inbound = handler.mock.calls[0]?.[0];
    expect(inbound.channelType).toBe("telegram");
    expect(inbound.channelId).toBe("123");
    expect(inbound.senderId).toBe("456");
    expect(inbound.blocks[0]).toEqual({ type: "text", content: "Hello from user" });

    // --- Send multi-block message ---
    const outbound: OutboundMessage = {
      channelId: "123",
      blocks: [
        { type: "text", content: "Here is your report" },
        { type: "image", url: "https://cdn.example.com/chart.png", alt: "chart" },
        {
          type: "button",
          buttons: [
            { label: "Approve", action: "approve", style: "primary" },
            { label: "Reject", action: "reject", style: "danger" },
          ],
        },
      ],
    };
    await adapter.send(outbound);

    // Should have sent: typing action, text message, photo with buttons
    expect(mockSendChatAction).toHaveBeenCalledOnce();
    expect(mockSendMessage).toHaveBeenCalledOnce();
    expect(mockSendPhoto).toHaveBeenCalledOnce();

    // Text message content
    expect(mockSendMessage).toHaveBeenCalledWith(
      "123",
      "Here is your report",
      expect.objectContaining({ parse_mode: "HTML" }),
    );

    // Photo with inline keyboard (buttons attach to last content)
    const photoOpts = mockSendPhoto.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(photoOpts.reply_markup).toBeDefined();

    // --- Disconnect ---
    await adapter.disconnect();
    expect(mockBotStop).toHaveBeenCalledOnce();
    expect(adapter.getBot()).toBeUndefined();
  });

  it("handles send failure with proper error wrapping", async () => {
    const adapter = new TelegramChannel(POLLING_CONFIG);
    await adapter.connect();

    mockSendMessage.mockRejectedValueOnce(new Error("Forbidden: bot was blocked by the user"));

    const outbound: OutboundMessage = {
      channelId: "123",
      blocks: [{ type: "text", content: "Should fail" }],
    };

    await expect(adapter.send(outbound)).rejects.toThrow();
  });

  it("handles long messages with auto-split", async () => {
    const adapter = new TelegramChannel(POLLING_CONFIG);
    await adapter.connect();

    const longContent = "x".repeat(8500); // > 4096 Telegram limit
    const outbound: OutboundMessage = {
      channelId: "123",
      blocks: [{ type: "text", content: longContent }],
    };

    await adapter.send(outbound);

    // Should have been split into multiple sendMessage calls
    expect(mockSendMessage.mock.calls.length).toBeGreaterThan(1);

    // Each call's text should be ≤ 4096 chars (Telegram limit)
    for (const call of mockSendMessage.mock.calls) {
      const text = call[1] as string;
      expect(text.length).toBeLessThanOrEqual(4096);
    }
  });

  it("rejects send when not connected", async () => {
    const adapter = new TelegramChannel(POLLING_CONFIG);

    const outbound: OutboundMessage = {
      channelId: "123",
      blocks: [{ type: "text", content: "Should fail" }],
    };

    await expect(adapter.send(outbound)).rejects.toThrow(ChannelSendError);
    await expect(adapter.send(outbound)).rejects.toThrow(/not connected/i);
  });

  it("rejects send after disconnect", async () => {
    const adapter = new TelegramChannel(POLLING_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    const outbound: OutboundMessage = {
      channelId: "123",
      blocks: [{ type: "text", content: "Should fail" }],
    };

    await expect(adapter.send(outbound)).rejects.toThrow(ChannelSendError);
  });

  it("supports webhook mode lifecycle", async () => {
    const adapter = new TelegramChannel({
      mode: "webhook",
      token: "123:ABC",
      webhookUrl: "https://example.com/webhook",
      secretToken: "my-secret",
    });

    // Connect in webhook mode
    await adapter.connect();
    expect(mockBotInit).toHaveBeenCalledOnce();
    expect(mockSetWebhook).toHaveBeenCalledWith("https://example.com/webhook", {
      secret_token: "my-secret",
    });
    expect(mockBotStart).not.toHaveBeenCalled(); // No polling in webhook mode

    // Disconnect
    await adapter.disconnect();
    expect(mockDeleteWebhook).toHaveBeenCalledOnce();
  });
});
