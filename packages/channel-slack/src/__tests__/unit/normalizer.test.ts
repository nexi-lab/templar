import { describe, expect, it, vi } from "vitest";
import type { SlackFile, SlackMessageEvent } from "../../normalizer.js";
import { normalizeSlackEvent } from "../../normalizer.js";
import {
  createSlackFileEvent,
  createSlackMessageEvent,
  createSlackThreadEvent,
} from "../helpers/fixtures.js";

describe("normalizeSlackEvent", () => {
  // -----------------------------------------------------------------------
  // Text handling
  // -----------------------------------------------------------------------

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

  it("returns message with empty blocks when text is empty", () => {
    const event = createSlackMessageEvent("");
    const result = normalizeSlackEvent(event);
    expect(result).toBeDefined();
    expect(result?.blocks).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Field mapping
  // -----------------------------------------------------------------------

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

  it("defaults senderId to 'unknown' when user is missing", () => {
    const event: SlackMessageEvent = {
      type: "message",
      text: "anonymous message",
      channel: "C123",
      ts: "1700000000.000001",
    };
    const result = normalizeSlackEvent(event);
    expect(result?.senderId).toBe("unknown");
  });

  it("defaults channelId to empty string when channel is missing", () => {
    const event: SlackMessageEvent = {
      type: "message",
      text: "no channel",
      user: "U123",
      ts: "1700000000.000001",
    };
    const result = normalizeSlackEvent(event);
    expect(result?.channelId).toBe("");
  });

  it("defaults messageId to empty string when ts is missing", () => {
    const event: SlackMessageEvent = {
      type: "message",
      text: "no ts",
      user: "U123",
      channel: "C123",
    };
    const result = normalizeSlackEvent(event);
    expect(result?.messageId).toBe("");
  });

  it("uses Date.now() for timestamp when ts is missing", () => {
    const now = 1700000000000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const event: SlackMessageEvent = {
      type: "message",
      text: "no ts",
      user: "U123",
      channel: "C123",
    };
    const result = normalizeSlackEvent(event);
    expect(result?.timestamp).toBe(now);

    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Threads
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // File handling
  // -----------------------------------------------------------------------

  it("extracts file blocks from file_share events", () => {
    const event = createSlackFileEvent("F12345", {
      name: "report.pdf",
      mimetype: "application/pdf",
      size: 2048,
    });
    const result = normalizeSlackEvent(event);

    expect(result).toBeDefined();
    const fileBlocks = result?.blocks.filter((b) => b.type === "file");
    expect(fileBlocks).toBeDefined();
    expect(fileBlocks).toHaveLength(1);
    expect(fileBlocks?.[0]).toMatchObject({
      type: "file",
      filename: "report.pdf",
      mimeType: "application/pdf",
      size: 2048,
    });
  });

  it("prefers url_private_download over url_private", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [
        {
          id: "F1",
          name: "test.txt",
          mimetype: "text/plain",
          url_private: "https://files.slack.com/private/F1",
          url_private_download: "https://files.slack.com/download/F1",
        },
      ],
    };
    const result = normalizeSlackEvent(event);
    const fileBlock = result?.blocks.find((b) => b.type === "file");
    expect(fileBlock).toBeDefined();
    expect((fileBlock as { url: string }).url).toBe("https://files.slack.com/download/F1");
  });

  it("falls back to url_private when url_private_download is missing", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [
        {
          id: "F1",
          name: "test.txt",
          mimetype: "text/plain",
          url_private: "https://files.slack.com/private/F1",
        },
      ],
    };
    const result = normalizeSlackEvent(event);
    const fileBlock = result?.blocks.find((b) => b.type === "file");
    expect(fileBlock).toBeDefined();
    expect((fileBlock as { url: string }).url).toBe("https://files.slack.com/private/F1");
  });

  it("skips files with no URL", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [{ id: "F1" }],
    };
    const result = normalizeSlackEvent(event);
    expect(result?.blocks).toHaveLength(0);
  });

  it("uses 'unknown' for files with missing name", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [
        {
          id: "F1",
          url_private: "https://files.slack.com/private/F1",
        },
      ],
    };
    const result = normalizeSlackEvent(event);
    const fileBlock = result?.blocks.find((b) => b.type === "file");
    expect((fileBlock as { filename: string }).filename).toBe("unknown");
  });

  it("uses 'application/octet-stream' for files with missing mimetype", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [
        {
          id: "F1",
          name: "data.bin",
          url_private: "https://files.slack.com/private/F1",
        },
      ],
    };
    const result = normalizeSlackEvent(event);
    const fileBlock = result?.blocks.find((b) => b.type === "file");
    expect((fileBlock as { mimeType: string }).mimeType).toBe("application/octet-stream");
  });

  it("omits size when not present on file", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [
        {
          id: "F1",
          name: "no-size.txt",
          mimetype: "text/plain",
          url_private: "https://files.slack.com/private/F1",
        },
      ],
    };
    const result = normalizeSlackEvent(event);
    const fileBlock = result?.blocks.find((b) => b.type === "file");
    expect(fileBlock).toBeDefined();
    expect((fileBlock as unknown as Record<string, unknown>).size).toBeUndefined();
  });

  it("handles multiple file attachments", () => {
    const files: SlackFile[] = [
      {
        id: "F1",
        name: "image.png",
        mimetype: "image/png",
        size: 1024,
        url_private: "https://files.slack.com/F1",
        url_private_download: "https://files.slack.com/download/F1",
      },
      {
        id: "F2",
        name: "doc.pdf",
        mimetype: "application/pdf",
        size: 4096,
        url_private: "https://files.slack.com/F2",
        url_private_download: "https://files.slack.com/download/F2",
      },
      {
        id: "F3",
        name: "data.csv",
        mimetype: "text/csv",
        size: 512,
        url_private: "https://files.slack.com/F3",
        url_private_download: "https://files.slack.com/download/F3",
      },
    ];
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files,
    };
    const result = normalizeSlackEvent(event);
    const fileBlocks = result?.blocks.filter((b) => b.type === "file");
    expect(fileBlocks).toHaveLength(3);
    expect((fileBlocks?.[0] as { filename: string }).filename).toBe("image.png");
    expect((fileBlocks?.[1] as { filename: string }).filename).toBe("doc.pdf");
    expect((fileBlocks?.[2] as { filename: string }).filename).toBe("data.csv");
  });

  it("combines text and file blocks in mixed content", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "file_share",
      text: "Check out this file",
      channel: "C123",
      user: "U123",
      ts: "1700000000.000001",
      files: [
        {
          id: "F1",
          name: "report.pdf",
          mimetype: "application/pdf",
          size: 2048,
          url_private_download: "https://files.slack.com/download/F1",
        },
      ],
    };
    const result = normalizeSlackEvent(event);
    expect(result?.blocks).toHaveLength(2);
    expect(result?.blocks[0]).toEqual({ type: "text", content: "Check out this file" });
    expect(result?.blocks[1]).toMatchObject({
      type: "file",
      filename: "report.pdf",
    });
  });

  // -----------------------------------------------------------------------
  // Subtype filtering
  // -----------------------------------------------------------------------

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

  it("allows file_share subtype (not filtered)", () => {
    const event = createSlackFileEvent("F12345");
    const result = normalizeSlackEvent(event);
    expect(result).toBeDefined();
    expect(result?.blocks.some((b) => b.type === "file")).toBe(true);
  });

  it("returns undefined for message_deleted subtype", () => {
    const event: SlackMessageEvent = {
      type: "message",
      subtype: "message_deleted",
      channel: "C123",
      ts: "1700000000.000001",
    };
    expect(normalizeSlackEvent(event)).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Raw event preservation
  // -----------------------------------------------------------------------

  it("preserves raw event as escape hatch", () => {
    const event = createSlackMessageEvent("hi");
    const result = normalizeSlackEvent(event);
    expect(result?.raw).toBe(event);
  });
});
