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

describe("Discord send flow (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClientInstance();
    mockChannelSend.mockClear();

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
});
