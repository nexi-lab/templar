import type { FileBlock } from "@templar/core";
import { describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../../mappers/to-agui.js";
import { EventType } from "../../protocol/types.js";

describe("FileBlock → AG-UI events", () => {
  const block: FileBlock = {
    type: "file",
    url: "https://example.com/report.pdf",
    filename: "report.pdf",
    mimeType: "application/pdf",
    size: 2048,
  };

  it("produces exactly 3 events: START, CONTENT, END", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe(EventType.TEXT_MESSAGE_START);
    expect(events[1]?.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(events[2]?.type).toBe(EventType.TEXT_MESSAGE_END);
  });

  it("renders file as markdown link in the delta", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect((events[1] as { delta: string }).delta).toBe(
      "[report.pdf](https://example.com/report.pdf)",
    );
  });

  it("sets messageId on all events", () => {
    const events = mapBlockToEvents(block, "msg-55");
    for (const event of events) {
      expect((event as { messageId: string }).messageId).toBe("msg-55");
    }
  });

  it("escapes special markdown characters in filename", () => {
    const specialName: FileBlock = {
      type: "file",
      url: "https://example.com/file.txt",
      filename: "file [v2].txt",
      mimeType: "text/plain",
    };
    const events = mapBlockToEvents(specialName, "msg-1");
    const delta = (events[1] as { delta: string }).delta;
    expect(delta).toBe("[file \\[v2\\].txt](https://example.com/file.txt)");
  });

  it("handles filename without size", () => {
    const noSize: FileBlock = {
      type: "file",
      url: "https://example.com/data.csv",
      filename: "data.csv",
      mimeType: "text/csv",
    };
    const events = mapBlockToEvents(noSize, "msg-1");
    expect(events).toHaveLength(3);
    expect((events[1] as { delta: string }).delta).toBe("[data.csv](https://example.com/data.csv)");
  });
});
