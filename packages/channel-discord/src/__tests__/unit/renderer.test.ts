import type { OutboundMessage } from "@templar/core";
import { ChannelSendError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { buildRenderPlan, type DiscordSendable, renderMessage } from "../../renderer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockSendable(): {
  sendable: DiscordSendable;
  calls: Record<string, unknown>[];
} {
  const calls: Record<string, unknown>[] = [];
  const sendable: DiscordSendable = {
    send: vi.fn(async (payload: Record<string, unknown>) => {
      calls.push(payload);
      return { id: "sent-001" };
    }),
  };
  return { sendable, calls };
}

// ---------------------------------------------------------------------------
// buildRenderPlan
// ---------------------------------------------------------------------------

describe("buildRenderPlan", () => {
  it("returns empty plan for empty blocks", () => {
    const msg: OutboundMessage = { channelId: "ch-001", blocks: [] };
    const plan = buildRenderPlan(msg);
    expect(plan).toHaveLength(0);
  });

  it("builds a single text message call", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: "Hello" }],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.content).toBe("Hello");
    expect(plan[0]?.files).toHaveLength(0);
    expect(plan[0]?.components).toHaveLength(0);
  });

  it("builds a single image-only call", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "image", url: "https://example.com/img.png", alt: "test" }],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.content).toBe("");
    expect(plan[0]?.files).toHaveLength(1);
    expect(plan[0]?.files[0]?.url).toBe("https://example.com/img.png");
  });

  it("builds a single file-only call", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [
        {
          type: "file",
          url: "https://example.com/doc.pdf",
          filename: "doc.pdf",
          mimeType: "application/pdf",
        },
      ],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.files).toHaveLength(1);
    expect(plan[0]?.files[0]?.filename).toBe("doc.pdf");
  });

  it("builds a single button-only call with components", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [
        {
          type: "button",
          buttons: [
            { label: "Yes", action: "confirm", style: "primary" },
            { label: "No", action: "cancel", style: "danger" },
          ],
        },
      ],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.components).toHaveLength(1); // 1 ActionRow
  });

  it("batches text + image + buttons into a single call", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [
        { type: "text", content: "Check this out" },
        { type: "image", url: "https://example.com/img.png" },
        {
          type: "button",
          buttons: [{ label: "Like", action: "like" }],
        },
      ],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.content).toBe("Check this out");
    expect(plan[0]?.files).toHaveLength(1);
    expect(plan[0]?.components).toHaveLength(1);
  });

  it("coalesces adjacent text blocks", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [
        { type: "text", content: "Hello" },
        { type: "text", content: "World" },
      ],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.content).toBe("Hello\nWorld");
  });

  // -----------------------------------------------------------------------
  // Auto-split at 2000 chars
  // -----------------------------------------------------------------------

  describe("auto-split at 2000 chars", () => {
    it("splits text exceeding 2000 chars into multiple calls", () => {
      const longText = "a".repeat(4500);
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: longText }],
      };
      const plan = buildRenderPlan(msg);

      expect(plan.length).toBeGreaterThan(1);
      // All chunks should be ≤ 2000 chars
      for (const call of plan) {
        expect(call.content.length).toBeLessThanOrEqual(2000);
      }
      // Total content should be preserved
      const totalContent = plan.map((c) => c.content).join("");
      expect(totalContent).toBe(longText);
    });

    it("attaches files and components only to the last chunk", () => {
      const longText = "b".repeat(3000);
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [
          { type: "text", content: longText },
          { type: "image", url: "https://example.com/img.png" },
          { type: "button", buttons: [{ label: "OK", action: "ok" }] },
        ],
      };
      const plan = buildRenderPlan(msg);

      expect(plan.length).toBeGreaterThan(1);

      // First N-1 calls: text only, no files or components
      for (let i = 0; i < plan.length - 1; i++) {
        expect(plan[i]?.files).toHaveLength(0);
        expect(plan[i]?.components).toHaveLength(0);
      }

      // Last call: has text + files + components
      const lastCall = plan.at(-1);
      expect(lastCall?.files).toHaveLength(1);
      expect(lastCall?.components).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Thread support
  // -----------------------------------------------------------------------

  describe("thread support", () => {
    it("includes threadId in plan calls", () => {
      const msg: OutboundMessage = {
        channelId: "ch-001",
        threadId: "thread-001",
        blocks: [{ type: "text", content: "In a thread" }],
      };
      const plan = buildRenderPlan(msg);

      expect(plan[0]?.threadId).toBe("thread-001");
    });

    it("omits threadId when not set", () => {
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Not in a thread" }],
      };
      const plan = buildRenderPlan(msg);

      expect(plan[0]?.threadId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Multiple files
  // -----------------------------------------------------------------------

  it("collects multiple files into a single call", () => {
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [
        {
          type: "file",
          url: "https://example.com/a.pdf",
          filename: "a.pdf",
          mimeType: "application/pdf",
        },
        {
          type: "file",
          url: "https://example.com/b.txt",
          filename: "b.txt",
          mimeType: "text/plain",
        },
      ],
    };
    const plan = buildRenderPlan(msg);

    expect(plan).toHaveLength(1);
    expect(plan[0]?.files).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// renderMessage
// ---------------------------------------------------------------------------

describe("renderMessage", () => {
  it("sends a simple text message", async () => {
    const { sendable, calls } = createMockSendable();
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: "Hello" }],
    };

    await renderMessage(msg, sendable);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveProperty("content", "Hello");
  });

  it("sends batched message with content + files + components", async () => {
    const { sendable, calls } = createMockSendable();
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [
        { type: "text", content: "Look at this" },
        { type: "image", url: "https://example.com/img.png" },
        { type: "button", buttons: [{ label: "OK", action: "ok" }] },
      ],
    };

    await renderMessage(msg, sendable);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toHaveProperty("content", "Look at this");
    expect((calls[0] as Record<string, unknown[]>).files).toHaveLength(1);
    expect((calls[0] as Record<string, unknown[]>).components).toHaveLength(1);
  });

  it("sends multiple calls for split text", async () => {
    const { sendable, calls } = createMockSendable();
    const longText = "c".repeat(4500);
    const msg: OutboundMessage = {
      channelId: "ch-001",
      blocks: [{ type: "text", content: longText }],
    };

    await renderMessage(msg, sendable);

    expect(calls.length).toBeGreaterThan(1);
  });

  // -----------------------------------------------------------------------
  // Error handling (Decision 6A)
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("throws ChannelSendError on send failure", async () => {
      const sendable: DiscordSendable = {
        send: vi.fn().mockRejectedValue(new Error("Network error")),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      await expect(renderMessage(msg, sendable)).rejects.toThrow(ChannelSendError);
    });

    it("includes descriptive message for permission errors (50013)", async () => {
      const discordError = new Error("Missing Permissions");
      (discordError as unknown as Record<string, unknown>).code = 50013;
      const sendable: DiscordSendable = {
        send: vi.fn().mockRejectedValue(discordError),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      await expect(renderMessage(msg, sendable)).rejects.toThrow(/permission/i);
    });

    it("includes descriptive message for missing access errors (50001)", async () => {
      const discordError = new Error("Missing Access");
      (discordError as unknown as Record<string, unknown>).code = 50001;
      const sendable: DiscordSendable = {
        send: vi.fn().mockRejectedValue(discordError),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      await expect(renderMessage(msg, sendable)).rejects.toThrow(/access/i);
    });

    it("preserves original error as cause", async () => {
      const originalError = new Error("Discord API error");
      const sendable: DiscordSendable = {
        send: vi.fn().mockRejectedValue(originalError),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      try {
        await renderMessage(msg, sendable);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ChannelSendError);
        expect((err as ChannelSendError).cause).toBe(originalError);
      }
    });

    it("re-throws ChannelSendError without re-wrapping", async () => {
      const sendError = new ChannelSendError("discord", "Already wrapped");
      const sendable: DiscordSendable = {
        send: vi.fn().mockRejectedValue(sendError),
      };
      const msg: OutboundMessage = {
        channelId: "ch-001",
        blocks: [{ type: "text", content: "Hello" }],
      };

      try {
        await renderMessage(msg, sendable);
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBe(sendError);
      }
    });
  });
});
