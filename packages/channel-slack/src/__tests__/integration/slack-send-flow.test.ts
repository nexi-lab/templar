import type { OutboundMessage } from "@templar/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderMessage } from "../../renderer.js";
import { createMockClient } from "../helpers/mock-bolt.js";

describe("Slack send flow (integration)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends complex message with text + image + buttons in single postMessage", async () => {
    const { client, calls } = createMockClient();

    const message: OutboundMessage = {
      channelId: "C123",
      blocks: [
        { type: "text", content: "Check out this image:" },
        { type: "image", url: "https://example.com/photo.jpg", alt: "A photo" },
        {
          type: "button",
          buttons: [
            { label: "Like", action: "like" },
            { label: "Share", action: "share" },
          ],
        },
      ],
    };

    await renderMessage(message, client);

    // All batched into a single postMessage
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("chat.postMessage");

    const call = calls[0];
    if (!call) throw new Error("expected call");
    const { payload } = call;
    expect(payload.channel).toBe("C123");

    // Verify Block Kit blocks
    const blocks = payload.blocks as Record<string, unknown>[];
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.type).toBe("section");
    expect(blocks[1]?.type).toBe("image");
    expect(blocks[1]?.image_url).toBe("https://example.com/photo.jpg");
    expect(blocks[2]?.type).toBe("actions");
    expect((blocks[2] as { elements: unknown[] }).elements).toHaveLength(2);

    // Verify fallback text is present
    expect(payload.text).toBeTruthy();
  });

  it("sends text + file + text as 3 separate calls", async () => {
    const { client, calls } = createMockClient();

    // Mock fetch for file download
    const mockStream = new ReadableStream();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": "2048" }),
      body: mockStream,
    });

    try {
      const message: OutboundMessage = {
        channelId: "C123",
        blocks: [
          { type: "text", content: "Here is a document:" },
          {
            type: "file",
            url: "https://example.com/doc.pdf",
            filename: "report.pdf",
            mimeType: "application/pdf",
          },
          { type: "text", content: "Let me know your thoughts." },
        ],
      };

      await renderMessage(message, client);

      // postMessage + fileUpload + postMessage
      expect(calls).toHaveLength(3);
      expect(calls[0]?.method).toBe("chat.postMessage");
      expect(calls[1]?.method).toBe("filesUploadV2");
      expect(calls[1]?.payload.filename).toBe("report.pdf");
      expect(calls[2]?.method).toBe("chat.postMessage");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends threaded message with thread_ts", async () => {
    const { client, calls } = createMockClient();

    const message: OutboundMessage = {
      channelId: "C123",
      blocks: [{ type: "text", content: "Thread reply" }],
      threadId: "1700000000.000001",
    };

    await renderMessage(message, client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload.thread_ts).toBe("1700000000.000001");
  });

  it("handles message with only buttons", async () => {
    const { client, calls } = createMockClient();

    const message: OutboundMessage = {
      channelId: "C123",
      blocks: [
        {
          type: "button",
          buttons: [
            { label: "Option A", action: "opt_a" },
            { label: "Option B", action: "opt_b" },
          ],
        },
      ],
    };

    await renderMessage(message, client);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("chat.postMessage");
    const blocks = calls[0]?.payload.blocks as Record<string, unknown>[];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("actions");
  });

  it("handles message with multiple files", async () => {
    const { client, calls } = createMockClient();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ "content-length": "1024" }),
        body: new ReadableStream(),
      }),
    );

    try {
      const message: OutboundMessage = {
        channelId: "C123",
        blocks: [
          {
            type: "file",
            url: "https://example.com/a.pdf",
            filename: "a.pdf",
            mimeType: "application/pdf",
          },
          {
            type: "file",
            url: "https://example.com/b.pdf",
            filename: "b.pdf",
            mimeType: "application/pdf",
          },
        ],
      };

      await renderMessage(message, client);

      expect(calls).toHaveLength(2);
      expect(calls[0]?.method).toBe("filesUploadV2");
      expect(calls[0]?.payload.filename).toBe("a.pdf");
      expect(calls[1]?.method).toBe("filesUploadV2");
      expect(calls[1]?.payload.filename).toBe("b.pdf");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
