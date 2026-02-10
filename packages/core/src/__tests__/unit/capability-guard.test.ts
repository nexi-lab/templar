import { CapabilityNotSupportedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { CapabilityGuard } from "../../capability-guard.js";
import type { OutboundMessage } from "../../types.js";
import { createMockAdapter } from "../helpers/mock-channel.js";

describe("CapabilityGuard", () => {
  // =========================================================================
  // Text blocks
  // =========================================================================
  describe("text blocks", () => {
    it("should allow text block when text capability is supported", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "text", content: "Hello world" }],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject text block when text capability is absent", async () => {
      const adapter = createMockAdapter({ images: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "text", content: "Hello" }],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
      await expect(guard.send(message)).rejects.toThrow("does not support 'text' content");
    });

    it("should reject text block that exceeds maxLength", async () => {
      const adapter = createMockAdapter({ text: { maxLength: 10 } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "text", content: "A".repeat(11) }],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });

    it("should allow text block at exactly maxLength", async () => {
      const adapter = createMockAdapter({ text: { maxLength: 10 } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "text", content: "A".repeat(10) }],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });
  });

  // =========================================================================
  // Image blocks
  // =========================================================================
  describe("image blocks", () => {
    it("should allow image block when images capability is supported", async () => {
      const adapter = createMockAdapter({ text: true, images: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "image", url: "https://example.com/img.png" }],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject image block when images capability is absent", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "image", url: "https://example.com/img.png" }],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
      await expect(guard.send(message)).rejects.toThrow("does not support 'image' content");
    });

    it("should reject image block that exceeds maxSize", async () => {
      const adapter = createMockAdapter({ images: { maxSize: 1000 } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "image", url: "https://example.com/img.png", size: 1001 }],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });

    it("should reject image block with unsupported format", async () => {
      const adapter = createMockAdapter({ images: { formats: ["png", "jpg"] } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "image", url: "https://example.com/img.bmp", mimeType: "image/bmp" }],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });

    it("should skip format check when mimeType is not provided", async () => {
      const adapter = createMockAdapter({ images: { formats: ["png"] } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "image", url: "https://example.com/img.png" }],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });
  });

  // =========================================================================
  // File blocks
  // =========================================================================
  describe("file blocks", () => {
    it("should allow file block when files capability is supported", async () => {
      const adapter = createMockAdapter({ text: true, files: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [
          {
            type: "file",
            url: "https://example.com/doc.pdf",
            filename: "doc.pdf",
            mimeType: "application/pdf",
          },
        ],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject file block when files capability is absent", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [
          {
            type: "file",
            url: "https://example.com/doc.pdf",
            filename: "doc.pdf",
            mimeType: "application/pdf",
          },
        ],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });

    it("should reject file block that exceeds maxSize", async () => {
      const adapter = createMockAdapter({ files: { maxSize: 500 } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [
          {
            type: "file",
            url: "https://example.com/f.zip",
            filename: "f.zip",
            mimeType: "application/zip",
            size: 501,
          },
        ],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });
  });

  // =========================================================================
  // Button blocks
  // =========================================================================
  describe("button blocks", () => {
    it("should allow button block when buttons capability is supported", async () => {
      const adapter = createMockAdapter({ text: true, buttons: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "button", buttons: [{ label: "OK", action: "confirm" }] }],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject button block when buttons capability is absent", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "button", buttons: [{ label: "OK", action: "confirm" }] }],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });

    it("should reject button block that exceeds maxButtons", async () => {
      const adapter = createMockAdapter({ buttons: { maxButtons: 2 } });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [
          {
            type: "button",
            buttons: [
              { label: "A", action: "a" },
              { label: "B", action: "b" },
              { label: "C", action: "c" },
            ],
          },
        ],
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
    });
  });

  // =========================================================================
  // Thread support
  // =========================================================================
  describe("threads", () => {
    it("should allow threadId when threads capability is supported", async () => {
      const adapter = createMockAdapter({ text: true, threads: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "text", content: "reply" }],
        threadId: "thread-123",
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject threadId when threads capability is absent", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [{ type: "text", content: "reply" }],
        threadId: "thread-123",
      };

      await expect(guard.send(message)).rejects.toThrow(CapabilityNotSupportedError);
      await expect(guard.send(message)).rejects.toThrow("does not support 'threads' content");
    });
  });

  // =========================================================================
  // Mixed blocks
  // =========================================================================
  describe("mixed blocks", () => {
    it("should allow message with multiple supported block types", async () => {
      const adapter = createMockAdapter({ text: true, images: true, buttons: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [
          { type: "text", content: "Check this out" },
          { type: "image", url: "https://example.com/img.png" },
          { type: "button", buttons: [{ label: "OK", action: "confirm" }] },
        ],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject on first unsupported block type in mixed message", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [
          { type: "text", content: "Hello" },
          { type: "image", url: "https://example.com/img.png" },
          { type: "button", buttons: [{ label: "OK", action: "confirm" }] },
        ],
      };

      await expect(guard.send(message)).rejects.toThrow("does not support 'image' content");
    });
  });

  // =========================================================================
  // Empty blocks
  // =========================================================================
  describe("empty blocks", () => {
    it("should allow message with empty blocks array", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const message: OutboundMessage = {
        channelId: "ch-1",
        blocks: [],
      };

      await guard.send(message);
      expect(adapter.send).toHaveBeenCalledWith(message);
    });
  });

  // =========================================================================
  // Pass-through delegation
  // =========================================================================
  describe("delegation", () => {
    it("should delegate connect() to underlying adapter", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      await guard.connect();
      expect(adapter.connect).toHaveBeenCalledOnce();
    });

    it("should delegate disconnect() to underlying adapter", async () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      await guard.disconnect();
      expect(adapter.disconnect).toHaveBeenCalledOnce();
    });

    it("should delegate onMessage() to underlying adapter", () => {
      const adapter = createMockAdapter({ text: true });
      const guard = new CapabilityGuard(adapter);

      const handler = vi.fn();
      guard.onMessage(handler);
      expect(adapter.onMessage).toHaveBeenCalledWith(handler);
    });

    it("should expose adapter name and capabilities", () => {
      const adapter = createMockAdapter({ name: "slack", text: true, images: true });
      const guard = new CapabilityGuard(adapter);

      expect(guard.name).toBe("slack");
      expect(guard.capabilities).toBe(adapter.capabilities);
    });
  });
});
