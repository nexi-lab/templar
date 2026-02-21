import { describe, expect, it } from "vitest";
import { createEmailMessage } from "../../helpers.js";

describe("createEmailMessage", () => {
  it("creates a basic email message with subject and body", () => {
    const msg = createEmailMessage({
      to: "alice@example.com",
      subject: "Hello",
      body: "World",
    });

    expect(msg.channelId).toBe("alice@example.com");
    expect(msg.blocks).toEqual([{ type: "text", content: "World" }]);
    expect(msg.metadata).toEqual({ subject: "Hello" });
  });

  it("includes CC in metadata", () => {
    const msg = createEmailMessage({
      to: "alice@example.com",
      subject: "Test",
      body: "Body",
      cc: "bob@example.com, charlie@example.com",
    });

    expect(msg.metadata).toEqual({
      subject: "Test",
      cc: "bob@example.com, charlie@example.com",
    });
  });

  it("includes BCC in metadata", () => {
    const msg = createEmailMessage({
      to: "alice@example.com",
      subject: "Test",
      body: "Body",
      bcc: "secret@example.com",
    });

    expect(msg.metadata).toEqual({
      subject: "Test",
      bcc: "secret@example.com",
    });
  });

  it("adds file blocks for attachments", () => {
    const msg = createEmailMessage({
      to: "alice@example.com",
      subject: "Files",
      body: "See attached",
      attachments: [
        { url: "data:text/plain;base64,dGVzdA==", filename: "test.txt", mimeType: "text/plain" },
      ],
    });

    expect(msg.blocks).toHaveLength(2);
    expect(msg.blocks[0]).toEqual({ type: "text", content: "See attached" });
    expect(msg.blocks[1]).toEqual({
      type: "file",
      url: "data:text/plain;base64,dGVzdA==",
      filename: "test.txt",
      mimeType: "text/plain",
    });
  });

  it("sets replyTo for thread replies", () => {
    const msg = createEmailMessage({
      to: "alice@example.com",
      subject: "Re: Original",
      body: "Reply",
      replyTo: "<original@example.com>",
      threadId: "thread-1",
    });

    expect(msg.replyTo).toBe("<original@example.com>");
    expect(msg.threadId).toBe("thread-1");
  });

  it("omits metadata when no subject, cc, or bcc", () => {
    const msg = createEmailMessage({
      to: "alice@example.com",
      subject: "",
      body: "Body only",
    });

    expect(msg.metadata).toBeUndefined();
  });
});
