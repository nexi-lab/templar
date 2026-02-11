import type { TextBlock } from "@templar/core";
import { describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../../mappers/to-agui.js";
import { EventType } from "../../protocol/types.js";

describe("TextBlock → AG-UI events", () => {
  const block: TextBlock = { type: "text", content: "Hello, world!" };

  it("produces exactly 3 events: START, CONTENT, END", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe(EventType.TEXT_MESSAGE_START);
    expect(events[1]?.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(events[2]?.type).toBe(EventType.TEXT_MESSAGE_END);
  });

  it("sets messageId on all events", () => {
    const events = mapBlockToEvents(block, "msg-42");
    for (const event of events) {
      expect((event as { messageId: string }).messageId).toBe("msg-42");
    }
  });

  it("sets role to 'assistant' on TEXT_MESSAGE_START", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect((events[0] as { role: string }).role).toBe("assistant");
  });

  it("maps content string to the delta field", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect((events[1] as { delta: string }).delta).toBe("Hello, world!");
  });

  it("returns no events for empty string content (AG-UI forbids empty delta)", () => {
    const empty: TextBlock = { type: "text", content: "" };
    const events = mapBlockToEvents(empty, "msg-1");
    expect(events).toHaveLength(0);
  });

  it("handles very long content (boundary)", () => {
    const long: TextBlock = { type: "text", content: "x".repeat(100_000) };
    const events = mapBlockToEvents(long, "msg-1");
    expect(events).toHaveLength(3);
    expect((events[1] as { delta: string }).delta).toHaveLength(100_000);
  });

  it("preserves unicode content", () => {
    const unicode: TextBlock = {
      type: "text",
      content: "Hello 🌍! Ä Ö Ü ñ 你好",
    };
    const events = mapBlockToEvents(unicode, "msg-1");
    expect((events[1] as { delta: string }).delta).toBe("Hello 🌍! Ä Ö Ü ñ 你好");
  });

  it("preserves multiline content with newlines", () => {
    const multiline: TextBlock = {
      type: "text",
      content: "line1\nline2\nline3",
    };
    const events = mapBlockToEvents(multiline, "msg-1");
    expect((events[1] as { delta: string }).delta).toBe("line1\nline2\nline3");
  });
});
