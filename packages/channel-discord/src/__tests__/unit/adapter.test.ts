import type { OutboundMessage } from "@templar/core";
import { ChannelLoadError, ChannelSendError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DiscordChannel } from "../../adapter.js";
import { DISCORD_CAPABILITIES } from "../../capabilities.js";
import { createMockClientInstance, type MockClientInstance } from "../helpers/mock-discord.js";

// ---------------------------------------------------------------------------
// Mock discord.js
// ---------------------------------------------------------------------------

let mockClient: MockClientInstance;

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
      GuildMembers: 2,
      GuildModeration: 4,
      GuildEmojisAndStickers: 8,
      GuildIntegrations: 16,
      GuildWebhooks: 32,
      GuildInvites: 64,
      GuildVoiceStates: 128,
      GuildPresences: 256,
      GuildMessages: 512,
      GuildMessageReactions: 1024,
      GuildMessageTyping: 2048,
      DirectMessages: 4096,
      DirectMessageReactions: 8192,
      DirectMessageTyping: 16384,
      MessageContent: 32768,
      GuildScheduledEvents: 65536,
      AutoModerationConfiguration: 1048576,
      AutoModerationExecution: 2097152,
    },
  };
});

const VALID_CONFIG = {
  token: "Bot test-token-123",
};

describe("DiscordChannel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClientInstance();
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------

  describe("constructor", () => {
    it("creates adapter with valid config", () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      expect(adapter.name).toBe("discord");
      expect(adapter.capabilities).toBe(DISCORD_CAPABILITIES);
    });

    it("throws ChannelLoadError for invalid config", () => {
      expect(() => new DiscordChannel({})).toThrow(ChannelLoadError);
    });

    it("throws ChannelLoadError for empty token", () => {
      expect(() => new DiscordChannel({ token: "" })).toThrow(ChannelLoadError);
    });
  });

  // -----------------------------------------------------------------------
  // connect()
  // -----------------------------------------------------------------------

  describe("connect()", () => {
    it("calls client.login() with token", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();
      expect(mockClient.login).toHaveBeenCalledWith("Bot test-token-123");
    });

    it("is idempotent — second call is a no-op", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();
      await adapter.connect();
      expect(mockClient.login).toHaveBeenCalledOnce();
    });

    it("throws ChannelLoadError if login fails", async () => {
      mockClient.login.mockRejectedValueOnce(new Error("Invalid token"));
      const adapter = new DiscordChannel(VALID_CONFIG);
      await expect(adapter.connect()).rejects.toThrow(ChannelLoadError);
    });

    it("includes descriptive message when login fails", async () => {
      mockClient.login.mockRejectedValueOnce(new Error("Invalid token"));
      const adapter = new DiscordChannel(VALID_CONFIG);
      await expect(adapter.connect()).rejects.toThrow(/Failed to connect/);
    });
  });

  // -----------------------------------------------------------------------
  // disconnect()
  // -----------------------------------------------------------------------

  describe("disconnect()", () => {
    it("calls client.destroy()", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();
      await adapter.disconnect();
      expect(mockClient.destroy).toHaveBeenCalledOnce();
    });

    it("is idempotent — second call is a no-op", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect();
      expect(mockClient.destroy).toHaveBeenCalledOnce();
    });

    it("is safe to call before connect()", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.disconnect(); // Should not throw
      expect(mockClient.destroy).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // send()
  // -----------------------------------------------------------------------

  describe("send()", () => {
    it("throws ChannelSendError if not connected", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "hi" }],
      };
      await expect(adapter.send(msg)).rejects.toThrow(ChannelSendError);
      await expect(adapter.send(msg)).rejects.toThrow(/not connected/i);
    });

    it("fetches channel and sends message when connected", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };
      await adapter.send(msg);

      expect(mockClient.channels.fetch).toHaveBeenCalledWith("ch-001");
    });

    it("throws ChannelSendError for invalid channel", async () => {
      mockClient.channels.fetch.mockResolvedValueOnce(null);
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const msg: OutboundMessage = {
        channelId: "invalid-ch",
        blocks: [{ type: "text", content: "Hello" }],
      };
      await expect(adapter.send(msg)).rejects.toThrow(ChannelSendError);
    });
  });

  // -----------------------------------------------------------------------
  // onMessage()
  // -----------------------------------------------------------------------

  describe("onMessage()", () => {
    it("throws ChannelLoadError if client not initialized", () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      expect(() => adapter.onMessage(vi.fn())).toThrow(ChannelLoadError);
    });

    it("registers a messageCreate handler on the client", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const handler = vi.fn();
      adapter.onMessage(handler);

      expect(mockClient.on).toHaveBeenCalledWith("messageCreate", expect.any(Function));
    });

    it("registers a global error handler on the client", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      adapter.onMessage(vi.fn());

      expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
    });

    it("global error handler logs without crashing", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      adapter.onMessage(vi.fn());

      const errorHandlers = mockClient.eventHandlers.get("error");
      expect(errorHandlers).toBeDefined();

      await errorHandlers?.[0]?.(new Error("Gateway disconnected"));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("calls handler with normalized inbound message", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const handler = vi.fn();
      adapter.onMessage(handler);

      // Simulate incoming message through the registered handler
      const messageCreateHandlers = mockClient.eventHandlers.get("messageCreate");
      expect(messageCreateHandlers).toBeDefined();
      expect(messageCreateHandlers?.length).toBeGreaterThan(0);

      await messageCreateHandlers?.[0]?.({
        id: "msg-001",
        content: "Hello bot",
        author: { id: "user-001", bot: false, username: "testuser" },
        channelId: "ch-001",
        channel: { id: "ch-001", type: 0, isThread: () => false },
        attachments: new Map(),
        embeds: [],
        createdTimestamp: 1700000000000,
        reference: null,
      });

      // Allow async processing (base class handleInbound is async)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledOnce();
      const inbound = handler.mock.calls[0]?.[0];
      expect(inbound.channelType).toBe("discord");
      expect(inbound.channelId).toBe("ch-001");
      expect(inbound.senderId).toBe("user-001");
      expect(inbound.blocks[0]).toEqual({
        type: "text",
        content: "Hello bot",
      });
    });

    it("filters bot messages", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const handler = vi.fn();
      adapter.onMessage(handler);

      const messageCreateHandlers = mockClient.eventHandlers.get("messageCreate");
      await messageCreateHandlers?.[0]?.({
        id: "msg-002",
        content: "Bot reply",
        author: { id: "bot-999", bot: true, username: "otherbot" },
        channelId: "ch-001",
        channel: { id: "ch-001", type: 0, isThread: () => false },
        attachments: new Map(),
        embeds: [],
        createdTimestamp: 1700000000000,
        reference: null,
      });

      // Allow async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
    });

    it("does not crash when handler throws", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const handler = vi.fn().mockRejectedValue(new Error("handler error"));
      adapter.onMessage(handler);

      const messageCreateHandlers = mockClient.eventHandlers.get("messageCreate");
      await messageCreateHandlers?.[0]?.({
        id: "msg-003",
        content: "trigger error",
        author: { id: "user-001", bot: false, username: "testuser" },
        channelId: "ch-001",
        channel: { id: "ch-001", type: 0, isThread: () => false },
        attachments: new Map(),
        embeds: [],
        createdTimestamp: 1700000000000,
        reference: null,
      });

      // Allow async processing (error handling is in base class handleInbound)
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Properties
  // -----------------------------------------------------------------------

  describe("properties", () => {
    it("has name 'discord'", () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      expect(adapter.name).toBe("discord");
    });

    it("has DISCORD_CAPABILITIES as capabilities", () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      expect(adapter.capabilities).toBe(DISCORD_CAPABILITIES);
    });

    it("exposes getDiscordClient() that returns undefined before connect", () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      expect(adapter.getDiscordClient()).toBeUndefined();
    });

    it("exposes getDiscordClient() that returns Client after connect", async () => {
      const adapter = new DiscordChannel(VALID_CONFIG);
      await adapter.connect();
      expect(adapter.getDiscordClient()).toBeDefined();
    });
  });
});
