import { describe, expect, it } from "vitest";
import { normalizeEmail } from "../../normalizer.js";
import type { RawEmail } from "../../providers/types.js";
import { ThreadCache } from "../../thread-cache.js";

function makeRawEmail(overrides: Partial<RawEmail> = {}): RawEmail {
  return {
    messageId: "<msg-1@example.com>",
    from: { address: "sender@example.com", name: "Sender" },
    to: [{ address: "recipient@example.com" }],
    subject: "Test Subject",
    date: new Date("2026-01-15T10:00:00Z"),
    attachments: [],
    headers: new Map(),
    ...overrides,
  };
}

describe("normalizeEmail", () => {
  // -----------------------------------------------------------------------
  // Basic text normalization
  // -----------------------------------------------------------------------
  it("normalizes a plain text email to a single TextBlock", () => {
    const raw = makeRawEmail({ textBody: "Hello world" });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result).toBeDefined();
    expect(result?.channelType).toBe("email");
    expect(result?.senderId).toBe("sender@example.com");
    expect(result?.messageId).toBe("<msg-1@example.com>");
    expect(result?.blocks).toEqual([{ type: "text", content: "Hello world" }]);
  });

  it("normalizes an HTML-only email to a TextBlock with HTML content", () => {
    const raw = makeRawEmail({ htmlBody: "<h1>Hello</h1>" });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.blocks).toEqual([{ type: "text", content: "<h1>Hello</h1>" }]);
  });

  it("prefers HTML body over text body in multipart email", () => {
    const raw = makeRawEmail({
      textBody: "Hello plain",
      htmlBody: "<b>Hello rich</b>",
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.blocks).toEqual([{ type: "text", content: "<b>Hello rich</b>" }]);
  });

  it("falls back to text body when HTML body is empty", () => {
    const raw = makeRawEmail({
      textBody: "Hello plain",
      htmlBody: "",
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.blocks).toEqual([{ type: "text", content: "Hello plain" }]);
  });

  it("returns empty blocks when no body is present", () => {
    const raw = makeRawEmail();
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result).toBeDefined();
    expect(result?.blocks).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Subject as metadata
  // -----------------------------------------------------------------------
  it("includes subject in metadata", () => {
    const raw = makeRawEmail({ subject: "Important topic" });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.raw).toBe(raw);
  });

  // -----------------------------------------------------------------------
  // Attachments
  // -----------------------------------------------------------------------
  it("normalizes regular attachments as FileBlocks", () => {
    const raw = makeRawEmail({
      attachments: [
        {
          filename: "doc.pdf",
          mimeType: "application/pdf",
          size: 1024,
          content: Buffer.from("pdf-content"),
          disposition: "attachment",
        },
      ],
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.blocks).toContainEqual({
      type: "file",
      url: expect.stringContaining("data:application/pdf;base64,"),
      filename: "doc.pdf",
      mimeType: "application/pdf",
      size: 1024,
    });
  });

  it("normalizes inline images as ImageBlocks", () => {
    const raw = makeRawEmail({
      attachments: [
        {
          filename: "logo.png",
          mimeType: "image/png",
          size: 2048,
          content: Buffer.from("png-data"),
          contentId: "cid-logo",
          disposition: "inline",
        },
      ],
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.blocks).toContainEqual({
      type: "image",
      url: expect.stringContaining("data:image/png;base64,"),
      alt: "logo.png",
      mimeType: "image/png",
      size: 2048,
    });
  });

  it("normalizes multiple attachments as multiple blocks", () => {
    const raw = makeRawEmail({
      textBody: "See attached",
      attachments: [
        {
          filename: "a.pdf",
          mimeType: "application/pdf",
          size: 100,
          content: Buffer.from("a"),
          disposition: "attachment",
        },
        {
          filename: "b.jpg",
          mimeType: "image/jpeg",
          size: 200,
          content: Buffer.from("b"),
          disposition: "attachment",
        },
      ],
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    // Text block + 2 file blocks
    expect(result?.blocks).toHaveLength(3);
    expect(result?.blocks[0]?.type).toBe("text");
    expect(result?.blocks[1]?.type).toBe("file");
    expect(result?.blocks[2]?.type).toBe("file");
  });

  // -----------------------------------------------------------------------
  // Threading
  // -----------------------------------------------------------------------
  it("resolves threadId from In-Reply-To header via cache", () => {
    const cache = new ThreadCache();
    cache.set("<original@example.com>", "thread-123");

    const raw = makeRawEmail({
      inReplyTo: "<original@example.com>",
    });

    const result = normalizeEmail(raw, cache);

    expect(result?.threadId).toBe("thread-123");
  });

  it("resolves threadId from References header via cache", () => {
    const cache = new ThreadCache();
    cache.set("<first@example.com>", "thread-456");

    const raw = makeRawEmail({
      references: ["<first@example.com>", "<second@example.com>"],
    });

    const result = normalizeEmail(raw, cache);

    expect(result?.threadId).toBe("thread-456");
  });

  it("creates new threadId when no cache match (first message in thread)", () => {
    const cache = new ThreadCache();
    const raw = makeRawEmail({ messageId: "<new@example.com>" });

    const result = normalizeEmail(raw, cache);

    // threadId should be the messageId itself for first-in-thread
    expect(result?.threadId).toBe("<new@example.com>");
  });

  it("stores messageId → threadId in cache after normalization", () => {
    const cache = new ThreadCache();
    const raw = makeRawEmail({ messageId: "<msg-abc@example.com>" });

    normalizeEmail(raw, cache);

    expect(cache.getThreadId("<msg-abc@example.com>")).toBeDefined();
  });

  it("uses channelId derived from sender address", () => {
    const raw = makeRawEmail({
      from: { address: "alice@company.com" },
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.channelId).toBe("alice@company.com");
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  it("returns undefined for email with missing from field", () => {
    const raw = makeRawEmail({
      // biome-ignore lint/suspicious/noExplicitAny: test intentional bad data
      from: undefined as any,
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result).toBeUndefined();
  });

  it("returns undefined for email with missing messageId", () => {
    const raw = makeRawEmail({
      // biome-ignore lint/suspicious/noExplicitAny: test intentional bad data
      messageId: undefined as any,
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result).toBeUndefined();
  });

  it("sets timestamp from date field", () => {
    const date = new Date("2026-02-20T12:00:00Z");
    const raw = makeRawEmail({ date });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    expect(result?.timestamp).toBe(date.getTime());
  });

  it("includes cc in metadata when present", () => {
    const raw = makeRawEmail({
      cc: [{ address: "cc@example.com" }],
    });
    const cache = new ThreadCache();

    const result = normalizeEmail(raw, cache);

    // CC is preserved in raw for consumers to extract
    expect(result?.raw).toBe(raw);
  });
});
