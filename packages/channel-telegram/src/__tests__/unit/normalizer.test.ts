import type { MessageEntity } from "grammy/types";
import { describe, expect, it } from "vitest";
import { entitiesToHtml, hasBotMention, normalizeUpdate } from "../../normalizer.js";
import {
  createCallbackQueryUpdate,
  createDocumentUpdate,
  createGroupUpdate,
  createMockApi,
  createPhotoUpdate,
  createStickerUpdate,
  createTextUpdate,
  createVoiceUpdate,
  MOCK_BOT_INFO,
} from "../helpers/mock-grammy.js";

describe("normalizeUpdate", () => {
  const TOKEN = "fake:token";
  const BOT_USERNAME = MOCK_BOT_INFO.username;

  function setup() {
    return createMockApi();
  }

  // -----------------------------------------------------------------------
  // Text messages
  // -----------------------------------------------------------------------

  describe("text messages", () => {
    it("normalizes plain text", async () => {
      const { api } = setup();
      const update = createTextUpdate("Hello world");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result).toBeDefined();
      expect(result?.channelType).toBe("telegram");
      expect(result?.blocks).toHaveLength(1);
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "Hello world",
      });
    });

    it("populates senderId, channelId, messageId", async () => {
      const { api } = setup();
      const update = createTextUpdate("hi", { chatId: 999, userId: 777 });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.senderId).toBe("777");
      expect(result?.channelId).toBe("999");
      expect(result?.messageId).toBeDefined();
    });

    it("converts timestamp from Unix seconds to milliseconds", async () => {
      const { api } = setup();
      const update = createTextUpdate("hi");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      // Timestamp should be in milliseconds
      expect(result?.timestamp).toBeGreaterThan(1_000_000_000_000);
    });

    it("stores raw update", async () => {
      const { api } = setup();
      const update = createTextUpdate("hi");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.raw).toBe(update);
    });
  });

  // -----------------------------------------------------------------------
  // Text with entities
  // -----------------------------------------------------------------------

  describe("text with entities", () => {
    it("converts bold entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "bold", offset: 0, length: 5 }];
      const update = createTextUpdate("Hello world", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<b>Hello</b> world",
      });
    });

    it("converts italic entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "italic", offset: 6, length: 5 }];
      const update = createTextUpdate("Hello world", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "Hello <i>world</i>",
      });
    });

    it("converts code entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "code", offset: 4, length: 3 }];
      const update = createTextUpdate("Use foo here", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "Use <code>foo</code> here",
      });
    });

    it("converts text_link entity to HTML anchor", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [
        { type: "text_link", offset: 6, length: 4, url: "https://example.com" },
      ];
      const update = createTextUpdate("Click here now", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: 'Click <a href="https://example.com">here</a> now',
      });
    });

    it("converts strikethrough entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "strikethrough", offset: 0, length: 6 }];
      const update = createTextUpdate("delete this", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<s>delete</s> this",
      });
    });

    it("converts underline entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "underline", offset: 0, length: 9 }];
      const update = createTextUpdate("important text", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<u>important</u> text",
      });
    });

    it("converts spoiler entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "spoiler", offset: 0, length: 6 }];
      const update = createTextUpdate("secret info", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<tg-spoiler>secret</tg-spoiler> info",
      });
    });

    it("converts blockquote entity to HTML", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "blockquote", offset: 0, length: 12 }];
      const update = createTextUpdate("quoted text.", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<blockquote>quoted text.</blockquote>",
      });
    });

    it("converts pre entity with language", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [
        { type: "pre", offset: 0, length: 10, language: "typescript" },
      ];
      const update = createTextUpdate("const x =1", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: '<pre><code class="language-typescript">const x =1</code></pre>',
      });
    });

    it("handles multiple non-overlapping entities", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [
        { type: "bold", offset: 0, length: 5 },
        { type: "italic", offset: 6, length: 5 },
      ];
      const update = createTextUpdate("Hello world", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<b>Hello</b> <i>world</i>",
      });
    });

    it("preserves plain text without entities as-is", async () => {
      const { api } = setup();
      const update = createTextUpdate("a < b && c > d");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      // Plain text (no entities) passes through without HTML escaping
      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "a < b && c > d",
      });
    });

    it("escapes HTML in entity content", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "bold", offset: 0, length: 5 }];
      const update = createTextUpdate("a<b>c test", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "<b>a&lt;b&gt;c</b> test",
      });
    });

    it("passes through mention entities without wrapping", async () => {
      const { api } = setup();
      const entities: MessageEntity[] = [{ type: "mention", offset: 0, length: 9 }];
      const update = createTextUpdate("@testuser hello", { entities });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[0]).toEqual({
        type: "text",
        content: "@testuser hello",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Photo messages
  // -----------------------------------------------------------------------

  describe("photo messages", () => {
    it("normalizes photo (picks largest size)", async () => {
      const { api, calls } = setup();
      const update = createPhotoUpdate("photo_123");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks).toHaveLength(1);
      const block = result?.blocks[0];
      expect(block).toBeDefined();
      expect(block!.type).toBe("image");
      expect((block as unknown as { url: string }).url).toContain("photo_123");

      // Should call getFile with the largest photo's file_id
      const getFileCalls = calls.filter((c) => c.method === "getFile");
      expect(getFileCalls).toHaveLength(1);
      // grammY passes file_id as positional arg
      expect(getFileCalls[0]?.payload._args).toContain("photo_123");
    });

    it("stores file_id in alt field", async () => {
      const { api } = setup();
      const update = createPhotoUpdate("photo_abc");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      const block = result?.blocks[0] as { alt: string };
      expect(block.alt).toBe("photo:photo_abc");
    });

    it("includes file_size from largest photo", async () => {
      const { api } = setup();
      const update = createPhotoUpdate("photo_123");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      const block = result?.blocks[0] as { size?: number };
      expect(block.size).toBe(50000);
    });

    it("normalizes photo with caption as two blocks", async () => {
      const { api } = setup();
      const update = createPhotoUpdate("photo_123", {
        caption: "Nice photo",
      });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks).toHaveLength(2);
      expect(result?.blocks[0]?.type).toBe("image");
      expect(result?.blocks[1]).toEqual({
        type: "text",
        content: "Nice photo",
      });
    });

    it("normalizes photo caption with entities", async () => {
      const { api } = setup();
      const captionEntities: MessageEntity[] = [{ type: "bold", offset: 0, length: 4 }];
      const update = createPhotoUpdate("photo_123", {
        caption: "Nice photo",
        captionEntities,
      });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks[1]).toEqual({
        type: "text",
        content: "<b>Nice</b> photo",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Document messages
  // -----------------------------------------------------------------------

  describe("document messages", () => {
    it("normalizes document", async () => {
      const { api, calls } = setup();
      const update = createDocumentUpdate("doc_123", {
        fileName: "report.pdf",
        mimeType: "application/pdf",
        fileSize: 2048,
      });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks).toHaveLength(1);
      const block = result?.blocks[0];
      expect(block).toBeDefined();
      expect(block!.type).toBe("file");
      expect((block as unknown as { filename: string }).filename).toBe("report.pdf");
      expect((block as { mimeType: string }).mimeType).toBe("application/pdf");
      expect((block as { size?: number }).size).toBe(2048);

      const getFileCalls = calls.filter((c) => c.method === "getFile");
      expect(getFileCalls).toHaveLength(1);
    });

    it("uses defaults for missing document fields", async () => {
      const { api } = setup();
      const update = createDocumentUpdate("doc_456");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      const block = result?.blocks[0];
      expect(block).toBeDefined();
      expect((block as unknown as { filename: string }).filename).toBe("test.pdf");
    });
  });

  // -----------------------------------------------------------------------
  // Voice messages
  // -----------------------------------------------------------------------

  describe("voice messages", () => {
    it("normalizes voice message as file block", async () => {
      const { api } = setup();
      const update = createVoiceUpdate("voice_123", { duration: 10 });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.blocks).toHaveLength(1);
      const block = result?.blocks[0];
      expect(block).toBeDefined();
      expect(block!.type).toBe("file");
      expect((block as unknown as { filename: string }).filename).toBe("voice.ogg");
      expect((block as { mimeType: string }).mimeType).toBe("audio/ogg");
    });
  });

  // -----------------------------------------------------------------------
  // Unsupported / empty content
  // -----------------------------------------------------------------------

  describe("unsupported content", () => {
    it("returns message with empty blocks for sticker", async () => {
      const { api } = setup();
      const update = createStickerUpdate();
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result).toBeDefined();
      expect(result?.blocks).toHaveLength(0);
    });

    it("returns undefined for update without message", async () => {
      const { api } = setup();
      const update = createCallbackQueryUpdate();
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result).toBeUndefined();
    });

    it("returns undefined for empty update", async () => {
      const { api } = setup();
      const update = { update_id: 1 } as any;
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Group messages
  // -----------------------------------------------------------------------

  describe("group messages", () => {
    it("populates threadId from message_thread_id", async () => {
      const { api } = setup();
      const update = createGroupUpdate("hello", { threadId: 42 });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.threadId).toBe("42");
    });

    it("omits threadId when not present", async () => {
      const { api } = setup();
      const update = createTextUpdate("hello");
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.threadId).toBeUndefined();
    });

    it("uses group chat id as channelId", async () => {
      const { api } = setup();
      const update = createGroupUpdate("hello", { chatId: -100999 });
      const result = await normalizeUpdate(update, api, TOKEN, BOT_USERNAME);

      expect(result?.channelId).toBe("-100999");
    });
  });
});

// ---------------------------------------------------------------------------
// entitiesToHtml (unit tests)
// ---------------------------------------------------------------------------

describe("entitiesToHtml", () => {
  it("returns escaped text when no entities", () => {
    expect(entitiesToHtml("a < b", [])).toBe("a &lt; b");
  });

  it("handles entity at start of text", () => {
    const entities: MessageEntity[] = [{ type: "bold", offset: 0, length: 3 }];
    expect(entitiesToHtml("foo bar", entities)).toBe("<b>foo</b> bar");
  });

  it("handles entity at end of text", () => {
    const entities: MessageEntity[] = [{ type: "italic", offset: 4, length: 3 }];
    expect(entitiesToHtml("foo bar", entities)).toBe("foo <i>bar</i>");
  });

  it("handles entity spanning entire text", () => {
    const entities: MessageEntity[] = [{ type: "code", offset: 0, length: 7 }];
    expect(entitiesToHtml("foo bar", entities)).toBe("<code>foo bar</code>");
  });
});

// ---------------------------------------------------------------------------
// hasBotMention
// ---------------------------------------------------------------------------

describe("hasBotMention", () => {
  it("detects bot mention", () => {
    const msg = {
      text: "@test_bot hello",
      entities: [{ type: "mention" as const, offset: 0, length: 9 }],
    } as any;
    expect(hasBotMention(msg, "test_bot")).toBe(true);
  });

  it("is case-insensitive", () => {
    const msg = {
      text: "@Test_Bot hello",
      entities: [{ type: "mention" as const, offset: 0, length: 9 }],
    } as any;
    expect(hasBotMention(msg, "test_bot")).toBe(true);
  });

  it("returns false when no mention", () => {
    const msg = {
      text: "hello",
      entities: [],
    } as any;
    expect(hasBotMention(msg, "test_bot")).toBe(false);
  });

  it("returns false when mentioning different bot", () => {
    const msg = {
      text: "@other_bot hello",
      entities: [{ type: "mention" as const, offset: 0, length: 10 }],
    } as any;
    expect(hasBotMention(msg, "test_bot")).toBe(false);
  });

  it("returns false when no entities", () => {
    const msg = { text: "@test_bot hello" } as any;
    expect(hasBotMention(msg, "test_bot")).toBe(false);
  });
});
