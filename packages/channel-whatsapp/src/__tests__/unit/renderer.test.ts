import type { OutboundMessage } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { buildRenderPlan, renderMessage } from "../../renderer.js";

describe("buildRenderPlan", () => {
  it("should return empty plan for empty blocks", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [],
    };
    expect(buildRenderPlan(message)).toEqual([]);
  });

  it("should create text call for text block", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [{ type: "text", content: "Hello" }],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ type: "text", text: "Hello" });
  });

  it("should coalesce adjacent text blocks", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        { type: "text", content: "Line 1" },
        { type: "text", content: "Line 2" },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({ type: "text", text: "Line 1\nLine 2" });
  });

  it("should attach text as caption on first image", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        { type: "text", content: "Check this out" },
        { type: "image", url: "https://example.com/img.jpg" },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      type: "image",
      url: "https://example.com/img.jpg",
      caption: "Check this out",
    });
  });

  it("should create separate calls for file blocks", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        {
          type: "file",
          url: "https://example.com/doc.pdf",
          filename: "report.pdf",
          mimeType: "application/pdf",
        },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      type: "file",
      url: "https://example.com/doc.pdf",
      filename: "report.pdf",
      mimetype: "application/pdf",
    });
  });

  it("should detect audio files and set ptt flag", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        {
          type: "file",
          url: "https://example.com/voice.ogg",
          filename: "voice.ogg",
          mimeType: "audio/ogg; codecs=opus",
        },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toEqual({
      type: "audio",
      url: "https://example.com/voice.ogg",
      ptt: true,
    });
  });

  it("should render buttons with max 3", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        { type: "text", content: "Choose an option:" },
        {
          type: "button",
          buttons: [
            { label: "Yes", action: "confirm" },
            { label: "No", action: "cancel" },
            { label: "Maybe", action: "maybe" },
            { label: "Extra", action: "extra" }, // Should be truncated
          ],
        },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.type).toBe("button");
    if (plan[0]?.type === "button") {
      expect(plan[0]?.buttons).toHaveLength(3); // Max 3
      expect(plan[0]?.text).toBe("Choose an option:");
    }
  });

  it("should flush text before non-image media", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        { type: "text", content: "Here is a document:" },
        {
          type: "file",
          url: "https://example.com/doc.pdf",
          filename: "doc.pdf",
          mimeType: "application/pdf",
        },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(2);
    expect(plan[0]?.type).toBe("text");
    expect(plan[1]?.type).toBe("file");
  });

  it("should handle mixed content (text + image + file)", () => {
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [
        { type: "text", content: "Photo and doc:" },
        { type: "image", url: "https://example.com/photo.jpg" },
        {
          type: "file",
          url: "https://example.com/doc.pdf",
          filename: "doc.pdf",
          mimeType: "application/pdf",
        },
      ],
    };
    const plan = buildRenderPlan(message);
    expect(plan).toHaveLength(2);
    // Image with caption
    expect(plan[0]).toEqual({
      type: "image",
      url: "https://example.com/photo.jpg",
      caption: "Photo and doc:",
    });
    // File separate
    expect(plan[1]).toEqual({
      type: "file",
      url: "https://example.com/doc.pdf",
      filename: "doc.pdf",
      mimetype: "application/pdf",
    });
  });
});

describe("renderMessage", () => {
  it("should send text message via socket", async () => {
    const socket = { sendMessage: vi.fn(async () => ({})) };
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [{ type: "text", content: "Hello" }],
    };

    await renderMessage(message, socket);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      "5511999@s.whatsapp.net",
      { text: "Hello" },
      {},
    );
  });

  it("should send image with URL reference (not buffer)", async () => {
    const socket = { sendMessage: vi.fn(async () => ({})) };
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [{ type: "image", url: "https://example.com/img.jpg" }],
    };

    await renderMessage(message, socket);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      "5511999@s.whatsapp.net",
      { image: { url: "https://example.com/img.jpg" } },
      {},
    );
  });

  it("should include quoted message for replyTo", async () => {
    const socket = { sendMessage: vi.fn(async () => ({})) };
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [{ type: "text", content: "Reply" }],
      replyTo: "original-msg-id",
    };

    await renderMessage(message, socket);

    expect(socket.sendMessage).toHaveBeenCalledWith(
      "5511999@s.whatsapp.net",
      { text: "Reply" },
      { quoted: { key: { id: "original-msg-id" } } },
    );
  });

  it("should throw ChannelSendError on failure", async () => {
    const socket = {
      sendMessage: vi.fn(async () => {
        throw new Error("Network error");
      }),
    };
    const message: OutboundMessage = {
      channelId: "5511999@s.whatsapp.net",
      blocks: [{ type: "text", content: "Hello" }],
    };

    await expect(renderMessage(message, socket)).rejects.toThrow("Failed to send message");
  });
});
