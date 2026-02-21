import type { OutboundMessage } from "@templar/core";
import { describe, expect, it } from "vitest";
import { buildEmailFromMessage } from "../../renderer.js";
import { ThreadCache } from "../../thread-cache.js";

function makeOutbound(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    channelId: "recipient@example.com",
    blocks: [{ type: "text", content: "Hello" }],
    ...overrides,
  };
}

describe("buildEmailFromMessage", () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------
  it("renders a text block as both plain text and HTML body", () => {
    const msg = makeOutbound({
      blocks: [{ type: "text", content: "Hello world" }],
      metadata: { subject: "Test" },
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.to).toBe("recipient@example.com");
    expect(email.from).toBe("bot@example.com");
    expect(email.subject).toBe("Test");
    expect(email.text).toBe("Hello world");
    expect(email.html).toBe("Hello world");
    expect(email.attachments).toEqual([]);
  });

  it("uses default subject when not in metadata", () => {
    const msg = makeOutbound();
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.subject).toBe("");
  });

  it("extracts CC from metadata", () => {
    const msg = makeOutbound({
      metadata: { cc: "alice@example.com, bob@example.com" },
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.cc).toBe("alice@example.com, bob@example.com");
  });

  it("extracts BCC from metadata", () => {
    const msg = makeOutbound({
      metadata: { bcc: "secret@example.com" },
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.bcc).toBe("secret@example.com");
  });

  // -----------------------------------------------------------------------
  // Multiple text blocks
  // -----------------------------------------------------------------------
  it("concatenates multiple text blocks with newlines", () => {
    const msg = makeOutbound({
      blocks: [
        { type: "text", content: "Paragraph 1" },
        { type: "text", content: "Paragraph 2" },
      ],
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.text).toBe("Paragraph 1\n\nParagraph 2");
    expect(email.html).toBe("Paragraph 1<br><br>Paragraph 2");
  });

  // -----------------------------------------------------------------------
  // File attachments
  // -----------------------------------------------------------------------
  it("converts FileBlocks to email attachments", () => {
    const msg = makeOutbound({
      blocks: [
        {
          type: "file",
          url: "data:application/pdf;base64,dGVzdA==",
          filename: "doc.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]?.filename).toBe("doc.pdf");
    expect(email.attachments[0]?.contentType).toBe("application/pdf");
  });

  // -----------------------------------------------------------------------
  // Image blocks
  // -----------------------------------------------------------------------
  it("converts ImageBlocks to inline attachments", () => {
    const msg = makeOutbound({
      blocks: [
        {
          type: "image",
          url: "data:image/png;base64,dGVzdA==",
          alt: "logo",
        },
      ],
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.attachments).toHaveLength(1);
    expect(email.attachments[0]?.contentDisposition).toBe("inline");
    expect(email.attachments[0]?.cid).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Threading — In-Reply-To and References
  // -----------------------------------------------------------------------
  it("sets In-Reply-To when replyTo is present in the thread cache", () => {
    const cache = new ThreadCache();
    cache.set("<original@example.com>", "thread-1");

    const msg = makeOutbound({
      replyTo: "<original@example.com>",
      threadId: "thread-1",
    });

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.inReplyTo).toBe("<original@example.com>");
  });

  it("does not set In-Reply-To when replyTo is absent", () => {
    const cache = new ThreadCache();
    const msg = makeOutbound();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.inReplyTo).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Button blocks (unsupported in email — rendered as text)
  // -----------------------------------------------------------------------
  it("renders button blocks as text links", () => {
    const msg = makeOutbound({
      blocks: [
        {
          type: "button",
          buttons: [
            { label: "Approve", action: "https://example.com/approve" },
            { label: "Reject", action: "https://example.com/reject" },
          ],
        },
      ],
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.text).toContain("Approve");
    expect(email.text).toContain("Reject");
  });

  // -----------------------------------------------------------------------
  // Empty blocks
  // -----------------------------------------------------------------------
  it("handles empty blocks array gracefully", () => {
    const msg = makeOutbound({ blocks: [] });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.text).toBe("");
    expect(email.html).toBe("");
    expect(email.attachments).toEqual([]);
  });

  // -----------------------------------------------------------------------
  // Mixed content
  // -----------------------------------------------------------------------
  it("handles mixed text + image + file blocks", () => {
    const msg = makeOutbound({
      blocks: [
        { type: "text", content: "See the attached files:" },
        {
          type: "image",
          url: "data:image/jpeg;base64,dGVzdA==",
          alt: "photo",
        },
        {
          type: "file",
          url: "data:text/plain;base64,dGVzdA==",
          filename: "notes.txt",
          mimeType: "text/plain",
        },
      ],
      metadata: { subject: "Files for review" },
    });
    const cache = new ThreadCache();

    const email = buildEmailFromMessage(msg, cache, "bot@example.com");

    expect(email.subject).toBe("Files for review");
    expect(email.text).toContain("See the attached files:");
    expect(email.attachments).toHaveLength(2); // 1 image + 1 file
  });
});
