import type { OutboundMessage } from "@templar/core";
import { describe, expect, it, vi } from "vitest";
import { buildRenderPlan, renderMessage } from "../../renderer.js";
import { createMockClient } from "../helpers/mock-bolt.js";

describe("buildRenderPlan", () => {
  const BASE_MSG: OutboundMessage = {
    channelId: "C123",
    blocks: [],
  };

  it("returns empty plan for empty blocks", () => {
    const plan = buildRenderPlan({ ...BASE_MSG, blocks: [] });
    expect(plan).toHaveLength(0);
  });

  it("renders single text block as one postMessage", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "Hello" }],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({
      kind: "postMessage",
      channel: "C123",
    });
    const call = plan[0] as any;
    expect(call.blocks).toHaveLength(1);
    expect(call.blocks[0].type).toBe("section");
  });

  it("coalesces adjacent text blocks into single postMessage", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Line 1" },
        { type: "text", content: "Line 2" },
        { type: "text", content: "Line 3" },
      ],
    });
    expect(plan).toHaveLength(1);
    // After coalescing, should be one section block with joined text
    const call = plan[0] as any;
    expect(call.blocks).toHaveLength(1);
    expect(call.blocks[0].type).toBe("section");
  });

  it("renders image block as image Block Kit block", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "image", url: "https://img.jpg", alt: "test" }],
    });
    expect(plan).toHaveLength(1);
    const call = plan[0] as any;
    expect(call.blocks).toHaveLength(1);
    expect(call.blocks[0]).toMatchObject({
      type: "image",
      image_url: "https://img.jpg",
      alt_text: "test",
    });
  });

  it("renders buttons as actions Block Kit block", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        {
          type: "button",
          buttons: [
            { label: "Yes", action: "confirm" },
            { label: "No", action: "cancel" },
          ],
        },
      ],
    });
    expect(plan).toHaveLength(1);
    const call = plan[0] as any;
    expect(call.blocks).toHaveLength(1);
    expect(call.blocks[0].type).toBe("actions");
    expect(call.blocks[0].elements).toHaveLength(2);
    expect(call.blocks[0].elements[0].text.text).toBe("Yes");
  });

  it("batches text + image + buttons into single postMessage", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Hello" },
        { type: "image", url: "https://img.jpg" },
        {
          type: "button",
          buttons: [{ label: "Click", action: "click" }],
        },
      ],
    });
    expect(plan).toHaveLength(1);
    const call = plan[0] as any;
    expect(call.blocks).toHaveLength(3);
    expect(call.blocks[0].type).toBe("section");
    expect(call.blocks[1].type).toBe("image");
    expect(call.blocks[2].type).toBe("actions");
  });

  it("file block breaks batch — creates separate upload call", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Here is a file:" },
        {
          type: "file",
          url: "https://example.com/file.pdf",
          filename: "file.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ kind: "postMessage" });
    expect(plan[1]).toMatchObject({
      kind: "fileUpload",
      channel: "C123",
      url: "https://example.com/file.pdf",
      filename: "file.pdf",
    });
  });

  it("handles file between text blocks", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Before" },
        {
          type: "file",
          url: "https://example.com/file.pdf",
          filename: "file.pdf",
          mimeType: "application/pdf",
        },
        { type: "text", content: "After" },
      ],
    });
    expect(plan).toHaveLength(3);
    expect(plan[0]).toMatchObject({ kind: "postMessage" });
    expect(plan[1]).toMatchObject({ kind: "fileUpload" });
    expect(plan[2]).toMatchObject({ kind: "postMessage" });
  });

  it("passes thread_ts when threadId is set", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "hi" }],
      threadId: "1700000000.000001",
    });
    expect((plan[0] as any).thread_ts).toBe("1700000000.000001");
  });

  it("passes thread_ts to file upload calls", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        {
          type: "file",
          url: "https://example.com/file.pdf",
          filename: "file.pdf",
          mimeType: "application/pdf",
        },
      ],
      threadId: "1700000000.000001",
    });
    expect((plan[0] as any).thread_ts).toBe("1700000000.000001");
  });

  it("includes text fallback in postMessage", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "Hello world" }],
    });
    expect((plan[0] as any).text).toContain("Hello world");
  });

  it("passes username and icon_url when identity is present", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "Hello" }],
      identity: { name: "Bot", avatar: "https://cdn.example.com/bot.png" },
    });
    expect(plan).toHaveLength(1);
    const call = plan[0] as any;
    expect(call.username).toBe("Bot");
    expect(call.icon_url).toBe("https://cdn.example.com/bot.png");
  });

  it("omits username and icon_url when identity is absent", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "Hello" }],
    });
    const call = plan[0] as any;
    expect(call.username).toBeUndefined();
    expect(call.icon_url).toBeUndefined();
  });

  it("passes identity fields only for postMessage, not fileUpload", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "File incoming" },
        {
          type: "file",
          url: "https://example.com/file.pdf",
          filename: "file.pdf",
          mimeType: "application/pdf",
        },
      ],
      identity: { name: "Bot", avatar: "https://cdn.example.com/bot.png" },
    });
    expect(plan).toHaveLength(2);
    expect((plan[0] as any).username).toBe("Bot");
    expect((plan[1] as any).username).toBeUndefined();
  });
});

describe("renderMessage (integration)", () => {
  it("executes postMessage for text blocks", async () => {
    const { client, calls } = createMockClient();

    await renderMessage(
      {
        channelId: "C123",
        blocks: [{ type: "text", content: "Hello" }],
      },
      client,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("chat.postMessage");
    expect(calls[0]?.payload.channel).toBe("C123");
  });

  it("does nothing for empty blocks", async () => {
    const { client, calls } = createMockClient();

    await renderMessage({ channelId: "C123", blocks: [] }, client);

    expect(calls).toHaveLength(0);
  });

  it("passes thread_ts in postMessage when threadId is set", async () => {
    const { client, calls } = createMockClient();

    await renderMessage(
      {
        channelId: "C123",
        blocks: [{ type: "text", content: "hi" }],
        threadId: "1700000000.000001",
      },
      client,
    );

    expect(calls[0]?.payload.thread_ts).toBe("1700000000.000001");
  });

  it("passes username and icon_url to chat.postMessage when identity is set", async () => {
    const { client, calls } = createMockClient();

    await renderMessage(
      {
        channelId: "C123",
        blocks: [{ type: "text", content: "Hello" }],
        identity: { name: "TestBot", avatar: "https://cdn.example.com/bot.png" },
      },
      client,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload.username).toBe("TestBot");
    expect(calls[0]?.payload.icon_url).toBe("https://cdn.example.com/bot.png");
  });

  it("omits identity fields from chat.postMessage when identity is absent", async () => {
    const { client, calls } = createMockClient();

    await renderMessage(
      {
        channelId: "C123",
        blocks: [{ type: "text", content: "Hello" }],
      },
      client,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload.username).toBeUndefined();
    expect(calls[0]?.payload.icon_url).toBeUndefined();
  });

  it("handles file upload with mocked download", async () => {
    const { client, calls } = createMockClient();

    // Mock the global fetch for file download
    const mockStream = new ReadableStream();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-length": "1024" }),
      body: mockStream,
    });

    try {
      await renderMessage(
        {
          channelId: "C123",
          blocks: [
            {
              type: "file",
              url: "https://example.com/file.pdf",
              filename: "file.pdf",
              mimeType: "application/pdf",
            },
          ],
        },
        client,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe("filesUploadV2");
      expect(calls[0]?.payload.channel_id).toBe("C123");
      expect(calls[0]?.payload.filename).toBe("file.pdf");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
