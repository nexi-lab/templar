import { describe, expect, it } from "vitest";
import { normalizeMessage } from "../../normalizer.js";
import { createMockMessage } from "../helpers/mock-baileys.js";

describe("normalizeMessage", () => {
  // -----------------------------------------------------------------------
  // Edge case #1: Self-messages
  // -----------------------------------------------------------------------
  describe("self-message filtering", () => {
    it("should return undefined for self-messages (fromMe = true)", () => {
      const msg = createMockMessage({ fromMe: true, text: "hello" });
      expect(normalizeMessage(msg)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Edge case #2: Status broadcasts
  // -----------------------------------------------------------------------
  describe("status broadcast filtering", () => {
    it("should return undefined for status@broadcast messages", () => {
      const msg = createMockMessage({
        remoteJid: "status@broadcast",
        text: "status update",
      });
      expect(normalizeMessage(msg)).toBeUndefined();
    });

    it("should return undefined when remoteJid is null", () => {
      const msg = createMockMessage({ text: "hello" });
      (msg.key as unknown as Record<string, unknown>).remoteJid = null;
      expect(normalizeMessage(msg)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Edge case #3: Group vs DM detection
  // -----------------------------------------------------------------------
  describe("group vs DM", () => {
    it("should use remoteJid as senderId for DM messages", () => {
      const msg = createMockMessage({
        remoteJid: "5511999999999@s.whatsapp.net",
        text: "hello",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.senderId).toBe("5511999999999@s.whatsapp.net");
      expect(result?.channelId).toBe("5511999999999@s.whatsapp.net");
    });

    it("should use participant as senderId for group messages", () => {
      const msg = createMockMessage({
        remoteJid: "120363123456789@g.us",
        participant: "5511999999999@s.whatsapp.net",
        text: "hello group",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.senderId).toBe("5511999999999@s.whatsapp.net");
      expect(result?.channelId).toBe("120363123456789@g.us");
    });

    it("should fallback to remoteJid as senderId when participant is null in group", () => {
      const msg = createMockMessage({
        remoteJid: "120363123456789@g.us",
        text: "hello",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.senderId).toBe("120363123456789@g.us");
    });
  });

  // -----------------------------------------------------------------------
  // Text extraction
  // -----------------------------------------------------------------------
  describe("text extraction", () => {
    it("should extract conversation text", () => {
      const msg = createMockMessage({ text: "Hello world" });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.blocks).toHaveLength(1);
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "Hello world",
      });
    });

    it("should extract extended text (URL previews)", () => {
      const msg = createMockMessage({
        extendedText: "Check this out: https://example.com",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "Check this out: https://example.com",
      });
    });

    it("should prefer extended text over conversation", () => {
      const msg = createMockMessage({
        text: "simple",
        extendedText: "extended",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      // Extended text takes priority
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "extended",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Edge case #4: Media messages
  // -----------------------------------------------------------------------
  describe("media extraction", () => {
    it("should extract image message with lazy URL", () => {
      const msg = createMockMessage({
        imageMimetype: "image/png",
        imageFileLength: 1024,
        id: "img-123",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();

      const imageBlock = result?.blocks.find((b) => b.type === "image");
      expect(imageBlock).toBeDefined();
      expect(imageBlock).toEqual({
        type: "image",
        url: "whatsapp://media/img-123",
        mimeType: "image/png",
        size: 1024,
      });
    });

    it("should extract image caption as text block", () => {
      const msg = createMockMessage({
        imageMimetype: "image/jpeg",
        imageCaption: "Look at this!",
        id: "img-cap",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();

      const textBlock = result?.blocks.find((b) => b.type === "text");
      expect(textBlock).toBeDefined();
      expect(textBlock?.type === "text" && textBlock?.content).toBe("Look at this!");
    });

    it("should extract video message as file block", () => {
      const msg = createMockMessage({
        videoMimetype: "video/mp4",
        id: "vid-123",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();

      const fileBlock = result?.blocks.find((b) => b.type === "file");
      expect(fileBlock).toBeDefined();
      expect(fileBlock).toMatchObject({
        type: "file",
        url: "whatsapp://media/vid-123",
        mimeType: "video/mp4",
      });
    });

    it("should extract audio message as file block", () => {
      const msg = createMockMessage({
        audioMimetype: "audio/ogg; codecs=opus",
        audioPtt: true,
        id: "aud-123",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();

      const fileBlock = result?.blocks.find((b) => b.type === "file");
      expect(fileBlock).toBeDefined();
      expect(fileBlock).toMatchObject({
        type: "file",
        url: "whatsapp://media/aud-123",
        filename: "voice-note.ogg",
        mimeType: "audio/ogg; codecs=opus",
      });
    });

    it("should extract document message as file block", () => {
      const msg = createMockMessage({
        documentMimetype: "application/pdf",
        documentFileName: "report.pdf",
        id: "doc-123",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();

      const fileBlock = result?.blocks.find((b) => b.type === "file");
      expect(fileBlock).toBeDefined();
      expect(fileBlock).toEqual({
        type: "file",
        url: "whatsapp://media/doc-123",
        filename: "report.pdf",
        mimeType: "application/pdf",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Edge case #5: Ephemeral messages
  // -----------------------------------------------------------------------
  describe("ephemeral message unwrapping", () => {
    it("should unwrap ephemeral message and extract text", () => {
      const msg = createMockMessage({
        text: "disappearing message",
        ephemeral: true,
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "disappearing message",
      });
    });

    it("should unwrap ephemeral message with image", () => {
      const msg = createMockMessage({
        imageMimetype: "image/jpeg",
        ephemeral: true,
        id: "eph-img",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();

      const imageBlock = result?.blocks.find((b) => b.type === "image");
      expect(imageBlock).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // Edge case #6: Extended text (URLs with previews)
  // -----------------------------------------------------------------------
  describe("extended text handling", () => {
    it("should extract extended text message", () => {
      const msg = createMockMessage({
        extendedText: "https://example.com — cool site",
      });
      const result = normalizeMessage(msg);
      expect(result).toBeDefined();
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "https://example.com — cool site",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Empty / no content
  // -----------------------------------------------------------------------
  describe("empty messages", () => {
    it("should return undefined for messages with no content", () => {
      const msg = createMockMessage({});
      // Force empty message
      (msg as unknown as Record<string, unknown>).message = {};
      expect(normalizeMessage(msg)).toBeUndefined();
    });

    it("should return undefined for messages with null message field", () => {
      const msg = createMockMessage({});
      (msg as unknown as Record<string, unknown>).message = null;
      expect(normalizeMessage(msg)).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------
  describe("message metadata", () => {
    it("should set channelType to whatsapp", () => {
      const msg = createMockMessage({ text: "hi" });
      const result = normalizeMessage(msg);
      expect(result?.channelType).toBe("whatsapp");
    });

    it("should use message key id as messageId", () => {
      const msg = createMockMessage({ text: "hi", id: "unique-id" });
      const result = normalizeMessage(msg);
      expect(result?.messageId).toBe("unique-id");
    });

    it("should convert timestamp from seconds to milliseconds", () => {
      const msg = createMockMessage({ text: "hi", timestamp: 1700000000 });
      const result = normalizeMessage(msg);
      expect(result?.timestamp).toBe(1700000000000);
    });

    it("should include raw message for escape hatch", () => {
      const msg = createMockMessage({ text: "hi" });
      const result = normalizeMessage(msg);
      expect(result?.raw).toBe(msg);
    });
  });
});
