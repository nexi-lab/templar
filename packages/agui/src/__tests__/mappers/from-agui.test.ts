import { describe, expect, it } from "vitest";
import { mapMessageToBlocks } from "../../mappers/from-agui.js";
import type { Message } from "../../protocol/types.js";

describe("AG-UI Message → Templar ContentBlocks", () => {
  it("maps a user message with string content to a TextBlock", () => {
    const msg: Message = {
      id: "m-1",
      role: "user",
      content: "Hello from the user",
    };
    const blocks = mapMessageToBlocks(msg);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: "text",
      content: "Hello from the user",
    });
  });

  it("maps an assistant message with string content to a TextBlock", () => {
    const msg: Message = {
      id: "m-2",
      role: "assistant",
      content: "Hello from the assistant",
    };
    const blocks = mapMessageToBlocks(msg);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      type: "text",
      content: "Hello from the assistant",
    });
  });

  it("returns empty array for message with no content", () => {
    const msg: Message = {
      id: "m-3",
      role: "assistant",
    };
    const blocks = mapMessageToBlocks(msg);
    expect(blocks).toHaveLength(0);
  });

  it("returns empty array for empty string content", () => {
    const msg: Message = {
      id: "m-4",
      role: "user",
      content: "",
    };
    const blocks = mapMessageToBlocks(msg);
    expect(blocks).toHaveLength(0);
  });

  it("preserves unicode content", () => {
    const msg: Message = {
      id: "m-5",
      role: "user",
      content: "你好 🌍",
    };
    const blocks = mapMessageToBlocks(msg);
    expect(blocks[0]).toEqual({
      type: "text",
      content: "你好 🌍",
    });
  });

  it("maps a system message to a TextBlock", () => {
    const msg: Message = {
      id: "m-6",
      role: "system",
      content: "System prompt",
    };
    const blocks = mapMessageToBlocks(msg);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe("text");
  });
});
