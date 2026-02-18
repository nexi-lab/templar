import type { OutboundMessage } from "@templar/core";
import { ChannelSendError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { renderWebhookMessage } from "../../renderer.js";
import type { WebhookSendable } from "../../webhook-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWebhook(): {
  webhook: WebhookSendable;
  calls: Record<string, unknown>[];
} {
  const calls: Record<string, unknown>[] = [];
  const webhook: WebhookSendable = {
    send: vi.fn(async (payload: Record<string, unknown>) => {
      calls.push(payload);
      return { id: "sent-wh-001" };
    }),
  };
  return { webhook, calls };
}

// ---------------------------------------------------------------------------
// renderWebhookMessage
// ---------------------------------------------------------------------------

describe("renderWebhookMessage", () => {
  // -----------------------------------------------------------------------
  // Identity applied
  // -----------------------------------------------------------------------

  describe("identity applied", () => {
    it("sets username from identity.name", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { name: "Research Bot" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveProperty("username", "Research Bot");
      expect(calls[0]).not.toHaveProperty("avatarURL");
    });

    it("sets avatarURL from identity.avatar", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { avatar: "https://example.com/avatar.png" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveProperty("avatarURL", "https://example.com/avatar.png");
      expect(calls[0]).not.toHaveProperty("username");
    });

    it("sets both username and avatarURL together", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { name: "Alex", avatar: "https://example.com/alex.png" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toHaveProperty("username", "Alex");
      expect(calls[0]).toHaveProperty("avatarURL", "https://example.com/alex.png");
    });
  });

  // -----------------------------------------------------------------------
  // Identity partial
  // -----------------------------------------------------------------------

  describe("identity partial", () => {
    it("handles identity with only name (no avatar)", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { name: "Bot" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls[0]).toHaveProperty("username", "Bot");
      expect(calls[0]).not.toHaveProperty("avatarURL");
    });

    it("handles identity with only avatar (no name)", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { avatar: "https://example.com/pic.png" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls[0]).not.toHaveProperty("username");
      expect(calls[0]).toHaveProperty("avatarURL", "https://example.com/pic.png");
    });
  });

  // -----------------------------------------------------------------------
  // Identity absent
  // -----------------------------------------------------------------------

  describe("identity absent", () => {
    it("omits username and avatarURL when no identity", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls).toHaveLength(1);
      expect(calls[0]).not.toHaveProperty("username");
      expect(calls[0]).not.toHaveProperty("avatarURL");
      expect(calls[0]).toHaveProperty("content", "Hello");
    });
  });

  // -----------------------------------------------------------------------
  // Thread support
  // -----------------------------------------------------------------------

  describe("thread support", () => {
    it("passes threadId to webhook payload", async () => {
      const { webhook, calls } = createMockWebhook();
      const msg: OutboundMessage = {
        channelId: "ch-001",
        threadId: "thread-001",
        blocks: [{ type: "text", content: "In thread" }],
        identity: { name: "Bot" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls[0]).toHaveProperty("threadId", "thread-001");
    });
  });

  // -----------------------------------------------------------------------
  // Batched send (split text)
  // -----------------------------------------------------------------------

  describe("batched send", () => {
    it("applies identity to ALL chunks of split text", async () => {
      const { webhook, calls } = createMockWebhook();
      const longText = "a".repeat(4500);
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: longText }],
        identity: { name: "Bot", avatar: "https://example.com/a.png" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls.length).toBeGreaterThan(1);
      for (const call of calls) {
        expect(call).toHaveProperty("username", "Bot");
        expect(call).toHaveProperty("avatarURL", "https://example.com/a.png");
      }
    });

    it("attaches files and components only to the last chunk", async () => {
      const { webhook, calls } = createMockWebhook();
      const longText = "b".repeat(3000);
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [
          { type: "text", content: longText },
          { type: "image", url: "https://example.com/img.png" },
        ],
        identity: { name: "Bot" },
      };

      await renderWebhookMessage(msg, webhook);

      expect(calls.length).toBeGreaterThan(1);

      // First N-1 calls: no files
      for (let i = 0; i < calls.length - 1; i++) {
        expect(calls[i]).not.toHaveProperty("files");
      }

      // Last call: has files
      const lastCall = calls.at(-1) as Record<string, unknown>;
      expect(lastCall.files).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("wraps webhook send error in ChannelSendError", async () => {
      const webhook: WebhookSendable = {
        send: vi.fn().mockRejectedValue(new Error("Network error")),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { name: "Bot" },
      };

      await expect(renderWebhookMessage(msg, webhook)).rejects.toThrow(ChannelSendError);
    });

    it("preserves original error as cause", async () => {
      const originalError = new Error("Webhook API error");
      const webhook: WebhookSendable = {
        send: vi.fn().mockRejectedValue(originalError),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      try {
        await renderWebhookMessage(msg, webhook);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ChannelSendError);
        expect((err as ChannelSendError).cause).toBe(originalError);
      }
    });
  });
});
