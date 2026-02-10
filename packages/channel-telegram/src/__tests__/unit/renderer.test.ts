import type { OutboundMessage } from "@templar/core";
import { describe, expect, it } from "vitest";
import { buildRenderPlan, renderMessage } from "../../renderer.js";
import { createMockApi } from "../helpers/mock-grammy.js";

describe("buildRenderPlan", () => {
  const BASE_MSG: OutboundMessage = {
    channelId: "123",
    blocks: [],
  };

  it("returns empty plan for empty blocks", () => {
    const plan = buildRenderPlan({ ...BASE_MSG, blocks: [] });
    expect(plan).toHaveLength(0);
  });

  it("sends typing indicator before content", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "hi" }],
    });
    expect(plan[0]).toEqual({
      kind: "sendChatAction",
      chatId: "123",
      action: "typing",
    });
  });

  it("renders single text block as sendMessage", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "Hello" }],
    });
    // typing + sendMessage
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({
      kind: "sendMessage",
      chatId: "123",
      text: "Hello",
      parseMode: "HTML",
    });
  });

  it("renders single image block as sendPhoto", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "image", url: "https://img.jpg" }],
    });
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({
      kind: "sendPhoto",
      chatId: "123",
      photo: "https://img.jpg",
    });
  });

  it("renders single file block as sendDocument", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        {
          type: "file",
          url: "https://file.pdf",
          filename: "doc.pdf",
          mimeType: "application/pdf",
        },
      ],
    });
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({
      kind: "sendDocument",
      chatId: "123",
      document: "https://file.pdf",
      filename: "doc.pdf",
    });
  });

  it("attaches buttons to preceding text message", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Choose:" },
        {
          type: "button",
          buttons: [
            { label: "A", action: "opt_a" },
            { label: "B", action: "opt_b" },
          ],
        },
      ],
    });
    // typing + sendMessage (with keyboard)
    expect(plan).toHaveLength(2);
    const textCall = plan[1]!;
    expect(textCall).toMatchObject({ kind: "sendMessage", text: "Choose:" });
    expect((textCall as any).replyMarkup).toEqual({
      inline_keyboard: [
        [{ text: "A", callback_data: "opt_a" }],
        [{ text: "B", callback_data: "opt_b" }],
      ],
    });
  });

  it("attaches buttons to preceding image message", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "image", url: "https://img.jpg" },
        {
          type: "button",
          buttons: [{ label: "Like", action: "like" }],
        },
      ],
    });
    expect(plan).toHaveLength(2);
    expect((plan[1] as any).replyMarkup).toBeDefined();
  });

  it("renders standalone button block with placeholder text", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        {
          type: "button",
          buttons: [{ label: "Start", action: "start" }],
        },
      ],
    });
    // typing + sendMessage (placeholder + keyboard)
    expect(plan).toHaveLength(2);
    const textCall = plan[1]!;
    expect(textCall).toMatchObject({
      kind: "sendMessage",
      text: "Please choose an option:",
    });
    expect((textCall as any).replyMarkup).toBeDefined();
  });

  it("coalesces multiple adjacent text blocks", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Line 1" },
        { type: "text", content: "Line 2" },
        { type: "text", content: "Line 3" },
      ],
    });
    // typing + single coalesced sendMessage
    expect(plan).toHaveLength(2);
    expect(plan[1]).toMatchObject({
      kind: "sendMessage",
      text: "Line 1\nLine 2\nLine 3",
    });
  });

  it("renders text + image + text as 3 separate API calls", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [
        { type: "text", content: "Before" },
        { type: "image", url: "https://img.jpg" },
        { type: "text", content: "After" },
      ],
    });
    // typing + sendMessage + sendPhoto + sendMessage
    expect(plan).toHaveLength(4);
    expect(plan[1]).toMatchObject({ kind: "sendMessage", text: "Before" });
    expect(plan[2]).toMatchObject({ kind: "sendPhoto" });
    expect(plan[3]).toMatchObject({ kind: "sendMessage", text: "After" });
  });

  it("splits text exceeding 4096 chars into multiple messages", () => {
    const longText = "x".repeat(5000);
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: longText }],
    });
    // typing + multiple sendMessage calls
    expect(plan.length).toBeGreaterThan(2);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i]!.kind).toBe("sendMessage");
      expect(((plan[i] as any).text as string).length).toBeLessThanOrEqual(4096);
    }
  });

  it("passes threadId to all calls", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "hi" }],
      threadId: "42",
    });
    expect((plan[1] as any).threadId).toBe("42");
  });

  it("passes replyTo to all calls", () => {
    const plan = buildRenderPlan({
      ...BASE_MSG,
      blocks: [{ type: "text", content: "hi" }],
      replyTo: "99",
    });
    expect((plan[1] as any).replyTo).toBe("99");
  });
});

describe("renderMessage (integration)", () => {
  it("executes all calls from render plan sequentially", async () => {
    const { api, calls } = createMockApi();

    await renderMessage(
      {
        channelId: "123",
        blocks: [
          { type: "text", content: "Hello" },
          { type: "image", url: "https://img.jpg" },
        ],
      },
      api,
    );

    // typing + sendMessage + sendPhoto
    expect(calls).toHaveLength(3);
    expect(calls[0]!.method).toBe("sendChatAction");
    expect(calls[1]!.method).toBe("sendMessage");
    expect(calls[2]!.method).toBe("sendPhoto");
  });

  it("does nothing for empty blocks", async () => {
    const { api, calls } = createMockApi();

    await renderMessage({ channelId: "123", blocks: [] }, api);

    expect(calls).toHaveLength(0);
  });

  it("passes message_thread_id when threadId is set", async () => {
    const { api, calls } = createMockApi();

    await renderMessage(
      {
        channelId: "123",
        blocks: [{ type: "text", content: "hi" }],
        threadId: "42",
      },
      api,
    );

    // sendMessage call should include message_thread_id in opts
    const sendCall = calls.find((c) => c.method === "sendMessage");
    expect(sendCall).toBeDefined();
    // The opts are passed as the 3rd argument
    const opts = (sendCall!.payload._args as unknown[])?.[2] ?? sendCall!.payload;
    expect((opts as any).message_thread_id).toBe(42);
  });

  it("passes reply_to_message_id when replyTo is set", async () => {
    const { api, calls } = createMockApi();

    await renderMessage(
      {
        channelId: "123",
        blocks: [{ type: "text", content: "hi" }],
        replyTo: "99",
      },
      api,
    );

    const sendCall = calls.find((c) => c.method === "sendMessage");
    const opts = (sendCall!.payload._args as unknown[])?.[2] ?? sendCall!.payload;
    expect((opts as any).reply_to_message_id).toBe(99);
  });
});
