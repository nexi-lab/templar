import type { OutboundMessage } from "@templar/core";
import { ChannelSendError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordChannel } from "../../adapter.js";
import { createMockClientInstance, type MockClientInstance } from "../helpers/mock-discord.js";

// ---------------------------------------------------------------------------
// Mock discord.js
// ---------------------------------------------------------------------------

let mockClient: MockClientInstance;
const mockChannelSend = vi.fn().mockResolvedValue({ id: "sent-001" });

vi.mock("discord.js", () => {
  return {
    Client: class MockDiscordClient {
      login!: MockClientInstance["login"];
      destroy!: MockClientInstance["destroy"];
      on!: MockClientInstance["on"];
      channels!: MockClientInstance["channels"];
      user!: MockClientInstance["user"];

      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return mockClient;
      }
    },
    GatewayIntentBits: {
      Guilds: 1,
      GuildMessages: 512,
      MessageContent: 32768,
    },
  };
});

const VALID_CONFIG = { token: "Bot integration-test-token" };

// Mock webhook for identity sends
const mockWebhookSend = vi.fn().mockResolvedValue({ id: "wh-sent-001" });

function createMockWebhookChannel() {
  return {
    id: "ch-001",
    type: 0,
    isThread: () => false,
    send: mockChannelSend,
    fetchWebhooks: vi.fn().mockResolvedValue(new Map()),
    createWebhook: vi.fn().mockResolvedValue({
      id: "wh-001",
      token: "wh-token",
      owner: { id: "bot-001" },
      name: "Templar",
      send: mockWebhookSend,
    }),
  };
}

describe("Discord send flow (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClientInstance();
    mockChannelSend.mockClear();
    mockWebhookSend.mockClear();

    // Override channels.fetch to return a channel with our tracked send mock
    mockClient.channels.fetch = vi.fn().mockResolvedValue({
      id: "ch-001",
      type: 0,
      isThread: () => false,
      send: mockChannelSend,
    });
  });

  it("full lifecycle: connect → onMessage → send → disconnect", async () => {
    const adapter = new DiscordChannel(VALID_CONFIG);

    // --- Connect ---
    await adapter.connect();
    expect(mockClient.login).toHaveBeenCalledWith("Bot integration-test-token");
    expect(adapter.getDiscordClient()).toBeDefined();

    // --- Register message handler ---
    const handler = vi.fn();
    adapter.onMessage(handler);

    // --- Simulate incoming message ---
    const messageHandlers = mockClient.eventHandlers.get("messageCreate");
    expect(messageHandlers).toBeDefined();

    await messageHandlers?.[0]?.({
      id: "msg-incoming",
      content: "Hello from user",
      author: { id: "user-001", bot: false, username: "testuser" },
      channelId: "ch-001",
      channel: { id: "ch-001", type: 0, isThread: () => false },
      attachments: new Map(),
      embeds: [],
      createdTimestamp: 1700000000000,
    });

    expect(handler).toHaveBeenCalledOnce();
    const inbound = handler.mock.calls[0]?.[0];
    expect(inbound.channelType).toBe("discord");
    expect(inbound.blocks[0]).toEqual({ type: "text", content: "Hello from user" });

    // --- Send multi-block message ---
    const outbound: OutboundMessage = {
      channelId: "ch-001",
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

    // Verify batched into single API call (Decision 14A)
    expect(mockChannelSend).toHaveBeenCalledOnce();
    const sentPayload = mockChannelSend.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sentPayload.content).toBe("Here is your report");
    expect(sentPayload.files).toBeDefined();
    expect(sentPayload.components).toBeDefined();

    // --- Disconnect ---
    await adapter.disconnect();
    expect(mockClient.destroy).toHaveBeenCalledOnce();
    expect(adapter.getDiscordClient()).toBeUndefined();
  });

  it("handles send failure with proper error wrapping", async () => {
    const adapter = new DiscordChannel(VALID_CONFIG);
    await adapter.connect();

    // Override send to fail with permission error
    const discordError = new Error("Missing Permissions");
    (discordError as unknown as Record<string, unknown>).code = 50013;
    mockChannelSend.mockRejectedValueOnce(discordError);

    const outbound: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: "Should fail" }],
    };

    try {
      await adapter.send(outbound);
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ChannelSendError);
      expect((err as Error).message).toMatch(/permission/i);
    }
  });

  it("handles long messages with auto-split", async () => {
    const adapter = new DiscordChannel(VALID_CONFIG);
    await adapter.connect();

    const longContent = "x".repeat(4500);
    const outbound: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: longContent }],
    };

    await adapter.send(outbound);

    // Should have split into multiple sends
    expect(mockChannelSend.mock.calls.length).toBeGreaterThan(1);

    // Each call's content should be ≤ 2000 chars
    for (const call of mockChannelSend.mock.calls) {
      const payload = call[0] as Record<string, unknown>;
      if (payload.content) {
        expect((payload.content as string).length).toBeLessThanOrEqual(2000);
      }
    }
  });

  it("rejects send when not connected", async () => {
    const adapter = new DiscordChannel(VALID_CONFIG);

    const outbound: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: "Should fail" }],
    };

    await expect(adapter.send(outbound)).rejects.toThrow(ChannelSendError);
    await expect(adapter.send(outbound)).rejects.toThrow(/not connected/i);
  });

  it("rejects send after disconnect", async () => {
    const adapter = new DiscordChannel(VALID_CONFIG);
    await adapter.connect();
    await adapter.disconnect();

    const outbound: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: "Should fail" }],
    };

    await expect(adapter.send(outbound)).rejects.toThrow(ChannelSendError);
  });

  // -----------------------------------------------------------------------
  // Webhook identity send flow (Issue #78)
  // -----------------------------------------------------------------------

  describe("webhook identity send flow", () => {
    it("sends via webhook when identity is present", async () => {
      const webhookChannel = createMockWebhookChannel();
      mockClient.channels.fetch = vi.fn().mockResolvedValue(webhookChannel);

      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const outbound: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello with identity" }],
        identity: { name: "Research Bot", avatar: "https://example.com/avatar.png" },
      };
      await adapter.send(outbound);

      // Should have used webhook send, not channel send
      expect(mockWebhookSend).toHaveBeenCalledOnce();
      const webhookPayload = mockWebhookSend.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(webhookPayload.content).toBe("Hello with identity");
      expect(webhookPayload.username).toBe("Research Bot");
      expect(webhookPayload.avatarURL).toBe("https://example.com/avatar.png");

      expect(mockChannelSend).not.toHaveBeenCalled();
    });

    it("sends via Gateway when no identity (regression)", async () => {
      const webhookChannel = createMockWebhookChannel();
      mockClient.channels.fetch = vi.fn().mockResolvedValue(webhookChannel);

      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const outbound: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello no identity" }],
      };
      await adapter.send(outbound);

      // Should have used channel.send (Gateway), not webhook
      expect(mockChannelSend).toHaveBeenCalledOnce();
      expect(mockWebhookSend).not.toHaveBeenCalled();
    });

    it("falls back to Gateway on webhook permission error", async () => {
      const permError = Object.assign(new Error("Missing Permissions"), { code: 50013 });
      const failingChannel = {
        id: "ch-001",
        type: 0,
        isThread: () => false,
        send: mockChannelSend,
        fetchWebhooks: vi.fn().mockRejectedValue(permError),
        createWebhook: vi.fn().mockRejectedValue(permError),
      };
      mockClient.channels.fetch = vi.fn().mockResolvedValue(failingChannel);

      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const outbound: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Fallback test" }],
        identity: { name: "Bot" },
      };
      await adapter.send(outbound);

      // Should have fallen back to Gateway send
      expect(mockChannelSend).toHaveBeenCalledOnce();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("retries with new webhook on 10015 Unknown Webhook error", async () => {
      const unknownError = Object.assign(new Error("Unknown Webhook"), { code: 10015 });
      const failingSend = vi.fn().mockRejectedValueOnce(unknownError);
      const successSend = vi.fn().mockResolvedValue({ id: "sent-ok" });

      let callCount = 0;
      const webhookChannel = {
        id: "ch-001",
        type: 0,
        isThread: () => false,
        send: mockChannelSend,
        fetchWebhooks: vi.fn().mockResolvedValue(new Map()),
        createWebhook: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve({
            id: `wh-${callCount}`,
            token: "wh-token",
            owner: { id: "bot-001" },
            name: "Templar",
            send: callCount === 1 ? failingSend : successSend,
          });
        }),
      };
      mockClient.channels.fetch = vi.fn().mockResolvedValue(webhookChannel);

      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const outbound: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Retry test" }],
        identity: { name: "Bot" },
      };
      await adapter.send(outbound);

      // Should have retried with a new webhook
      expect(webhookChannel.createWebhook).toHaveBeenCalledTimes(2);
      expect(successSend).toHaveBeenCalledOnce();
    });

    it("cached webhook works with changed identity name (hot-reload edge)", async () => {
      const webhookChannel = createMockWebhookChannel();
      mockClient.channels.fetch = vi.fn().mockResolvedValue(webhookChannel);

      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      // First send with identity "Bot A"
      const outbound1: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "First" }],
        identity: { name: "Bot A" },
      };
      await adapter.send(outbound1);

      // Second send with identity "Bot B" — same channel, cached webhook
      const outbound2: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Second" }],
        identity: { name: "Bot B" },
      };
      await adapter.send(outbound2);

      // Webhook should only be created once (cached)
      expect(webhookChannel.createWebhook).toHaveBeenCalledTimes(1);

      // Both sends should have different usernames
      expect(mockWebhookSend).toHaveBeenCalledTimes(2);
      const payload1 = mockWebhookSend.mock.calls[0]?.[0] as Record<string, unknown>;
      const payload2 = mockWebhookSend.mock.calls[1]?.[0] as Record<string, unknown>;
      expect(payload1.username).toBe("Bot A");
      expect(payload2.username).toBe("Bot B");
    });
  });
});
