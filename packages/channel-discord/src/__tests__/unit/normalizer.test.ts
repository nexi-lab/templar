import { describe, expect, it, vi } from "vitest";
import { normalizeMessage } from "../../normalizer.js";
import { createMockMessage, type MockAttachment } from "../helpers/mock-discord.js";

describe("normalizeMessage", () => {
  // -----------------------------------------------------------------------
  // Basic text messages
  // -----------------------------------------------------------------------

  describe("text messages", () => {
    it("normalizes a simple text message", () => {
      const msg = createMockMessage({ content: "Hello world" });
      const result = normalizeMessage(msg as never);

      expect(result).toBeDefined();
      expect(result?.channelType).toBe("discord");
      expect(result?.channelId).toBe("chan-001");
      expect(result?.senderId).toBe("user-001");
      expect(result?.messageId).toBe("msg-001");
      expect(result?.blocks).toHaveLength(1);
      expect(result?.blocks[0]).toEqual({ type: "text", content: "Hello world" });
    });

    it("normalizes empty content as empty blocks", () => {
      const msg = createMockMessage({ content: "" });
      const result = normalizeMessage(msg as never);

      expect(result).toBeDefined();
      expect(result?.blocks).toHaveLength(0);
    });

    it("preserves markdown in content", () => {
      const msg = createMockMessage({ content: "**bold** and *italic*" });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "**bold** and *italic*",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Attachments
  // -----------------------------------------------------------------------

  describe("attachments", () => {
    it("normalizes image attachment as ImageBlock", () => {
      const attachments = new Map<string, MockAttachment>();
      attachments.set("att-001", {
        id: "att-001",
        name: "photo.png",
        url: "https://cdn.discord.com/photo.png",
        contentType: "image/png",
        size: 1024,
      });

      const msg = createMockMessage({ attachments });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toContainEqual({
        type: "image",
        url: "https://cdn.discord.com/photo.png",
        alt: "photo.png",
        size: 1024,
      });
    });

    it("normalizes non-image attachment as FileBlock", () => {
      const attachments = new Map<string, MockAttachment>();
      attachments.set("att-001", {
        id: "att-001",
        name: "document.pdf",
        url: "https://cdn.discord.com/document.pdf",
        contentType: "application/pdf",
        size: 5000,
      });

      const msg = createMockMessage({ attachments });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toContainEqual({
        type: "file",
        url: "https://cdn.discord.com/document.pdf",
        filename: "document.pdf",
        mimeType: "application/pdf",
        size: 5000,
      });
    });

    it("handles attachment with null contentType as file", () => {
      const attachments = new Map<string, MockAttachment>();
      attachments.set("att-001", {
        id: "att-001",
        name: "data.bin",
        url: "https://cdn.discord.com/data.bin",
        contentType: null,
        size: 100,
      });

      const msg = createMockMessage({ attachments });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toContainEqual({
        type: "file",
        url: "https://cdn.discord.com/data.bin",
        filename: "data.bin",
        mimeType: "application/octet-stream",
        size: 100,
      });
    });

    it("normalizes gif attachment as ImageBlock", () => {
      const attachments = new Map<string, MockAttachment>();
      attachments.set("att-001", {
        id: "att-001",
        name: "funny.gif",
        url: "https://cdn.discord.com/funny.gif",
        contentType: "image/gif",
        size: 2000,
      });

      const msg = createMockMessage({ attachments });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toContainEqual({
        type: "image",
        url: "https://cdn.discord.com/funny.gif",
        alt: "funny.gif",
        size: 2000,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Embeds
  // -----------------------------------------------------------------------

  describe("embeds", () => {
    it("extracts embed description as TextBlock", () => {
      const msg = createMockMessage({
        embeds: [{ description: "Embed text here", fields: [] }],
      });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toContainEqual({
        type: "text",
        content: "Embed text here",
      });
    });

    it("extracts embed fields as TextBlock", () => {
      const msg = createMockMessage({
        embeds: [
          {
            description: null,
            fields: [
              { name: "Status", value: "Active" },
              { name: "Count", value: "42" },
            ],
          },
        ],
      });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toContainEqual({
        type: "text",
        content: "Status: Active\nCount: 42",
      });
    });

    it("skips embeds with no description and no fields", () => {
      const msg = createMockMessage({
        content: "",
        embeds: [{ description: null, fields: [] }],
      });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Thread messages (edge case #4)
  // -----------------------------------------------------------------------

  describe("thread messages", () => {
    it("includes threadId for messages in threads", () => {
      const msg = createMockMessage({
        channel: {
          id: "thread-001",
          type: 11, // PublicThread
          isThread: () => true,
          send: vi.fn(),
        },
        channelId: "thread-001",
      });
      const result = normalizeMessage(msg as never);

      expect(result?.threadId).toBe("thread-001");
    });

    it("omits threadId for non-thread messages", () => {
      const msg = createMockMessage();
      const result = normalizeMessage(msg as never);

      expect(result?.threadId).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // DM messages (edge case #5)
  // -----------------------------------------------------------------------

  describe("DM messages", () => {
    it("normalizes DM message correctly", () => {
      const msg = createMockMessage({
        channel: {
          id: "dm-001",
          type: 1, // DM
          isThread: () => false,
          send: vi.fn(),
        },
        channelId: "dm-001",
        guildId: null,
      });
      const result = normalizeMessage(msg as never);

      expect(result?.channelId).toBe("dm-001");
      expect(result?.channelType).toBe("discord");
    });
  });

  // -----------------------------------------------------------------------
  // Bot messages filtered (edge case #6)
  // -----------------------------------------------------------------------

  describe("bot message filtering", () => {
    it("returns undefined for bot messages", () => {
      const msg = createMockMessage({
        author: { id: "bot-999", bot: true, username: "otherbot" },
      });
      const result = normalizeMessage(msg as never);

      expect(result).toBeUndefined();
    });

    it("does not filter non-bot messages", () => {
      const msg = createMockMessage({
        author: { id: "user-001", bot: false, username: "human" },
      });
      const result = normalizeMessage(msg as never);

      expect(result).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Partial messages (edge case #8)
  // -----------------------------------------------------------------------

  describe("partial messages", () => {
    it("handles null/undefined content gracefully", () => {
      const msg = createMockMessage({ content: undefined as unknown as string });
      const result = normalizeMessage(msg as never);

      expect(result).toBeDefined();
      expect(result?.blocks).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Combined messages
  // -----------------------------------------------------------------------

  describe("combined content", () => {
    it("includes text + attachments in correct order", () => {
      const attachments = new Map<string, MockAttachment>();
      attachments.set("att-001", {
        id: "att-001",
        name: "image.png",
        url: "https://cdn.discord.com/image.png",
        contentType: "image/png",
        size: 512,
      });

      const msg = createMockMessage({
        content: "Check this out",
        attachments,
      });
      const result = normalizeMessage(msg as never);

      expect(result?.blocks).toHaveLength(2);
      expect(result?.blocks[0]).toEqual({ type: "text", content: "Check this out" });
      expect(result?.blocks[1]).toEqual({
        type: "image",
        url: "https://cdn.discord.com/image.png",
        alt: "image.png",
        size: 512,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  describe("metadata", () => {
    it("includes timestamp from createdTimestamp", () => {
      const msg = createMockMessage({ createdTimestamp: 1700000000000 });
      const result = normalizeMessage(msg as never);

      expect(result?.timestamp).toBe(1700000000000);
    });

    it("includes raw message as escape hatch", () => {
      const msg = createMockMessage();
      const result = normalizeMessage(msg as never);

      expect(result?.raw).toBe(msg);
    });
  });
});
