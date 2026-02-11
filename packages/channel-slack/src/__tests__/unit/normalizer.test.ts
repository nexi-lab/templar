import { describe, expect, it } from "vitest";
import { normalizeSlackEvent } from "../../normalizer.js";
import {
  createSlackFileEvent,
  createSlackMessageEvent,
  createSlackThreadEvent,
} from "../helpers/fixtures.js";

describe("normalizeSlackEvent", () => {
  it("extracts text content", () => {
    const event = createSlackMessageEvent("Hello world");
    const result = normalizeSlackEvent(event);

    expect(result).toBeDefined();
    expect(result?.channelType).toBe("slack");
    expect(result?.blocks).toHaveLength(1);
    expect(result?.blocks[0]).toEqual({
      type: "text",
      content: "Hello world",
    });
  });

  it("sets correct channelId", () => {
    const event = createSlackMessageEvent("hi", { channel: "C999" });
    const result = normalizeSlackEvent(event);
    expect(result?.channelId).toBe("C999");
  });

  it("sets correct senderId", () => {
    const event = createSlackMessageEvent("hi", { user: "U999" });
    const result = normalizeSlackEvent(event);
    expect(result?.senderId).toBe("U999");
  });

  it("sets correct messageId from ts", () => {
    const event = createSlackMessageEvent("hi", { ts: "1700000000.000042" });
    const result = normalizeSlackEvent(event);
    expect(result?.messageId).toBe("1700000000.000042");
  });

  it("converts Slack ts to millisecond timestamp", () => {
    const event = createSlackMessageEvent("hi", { ts: "1700000000.000001" });
    const result = normalizeSlackEvent(event);
    expect(result?.timestamp).toBe(1700000000.000001 * 1000);
  });

  it("detects thread messages via thread_ts", () => {
    const event = createSlackThreadEvent("reply", "1700000000.000001");
    const result = normalizeSlackEvent(event);
    expect(result?.threadId).toBe("1700000000.000001");
  });

  it("has no threadId for non-thread messages", () => {
    const event = createSlackMessageEvent("hi");
    const result = normalizeSlackEvent(event);
    expect(result?.threadId).toBeUndefined();
  });

  it("extracts file blocks from file_share events", () => {
    const event = createSlackFileEvent("F12345", {
      name: "report.pdf",
      mimetype: "application/pdf",
      size: 2048,
    });
    const result = normalizeSlackEvent(event);

    expect(result).toBeDefined();
    const fileBlocks = result!.blocks.filter((b) => b.type === "file");
    expect(fileBlocks).toHaveLength(1);
    expect(fileBlocks[0]).toMatchObject({
      type: "file",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 2048,
    });
  });

  it("returns undefined for bot messages (subtype set)", () => {
    const event = {
      type: "message",
      subtype: "bot_message",
      text: "I am a bot",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
    };
    expect(normalizeSlackEvent(event)).toBeUndefined();
  });

  it("returns undefined for message_changed subtype", () => {
    const event = {
      type: "message",
      subtype: "message_changed",
      channel: "C123",
      ts: "1700000000.000001",
    };
    expect(normalizeSlackEvent(event)).toBeUndefined();
  });

  it("preserves raw event as escape hatch", () => {
    const event = createSlackMessageEvent("hi");
    const result = normalizeSlackEvent(event);
    expect(result?.raw).toBe(event);
  });

  it("returns message with empty blocks when text is empty", () => {
    const event = createSlackMessageEvent("");
    const result = normalizeSlackEvent(event);
    expect(result).toBeDefined();
    expect(result?.blocks).toHaveLength(0);
  });
});
