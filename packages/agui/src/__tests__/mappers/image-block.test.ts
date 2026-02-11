import type { ImageBlock } from "@templar/core";
import { describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../../mappers/to-agui.js";
import { EventType } from "../../protocol/types.js";

describe("ImageBlock → AG-UI events", () => {
  const block: ImageBlock = {
    type: "image",
    url: "https://example.com/photo.png",
    alt: "A photo",
    mimeType: "image/png",
    size: 1024,
  };

  it("produces exactly 3 events: START, CONTENT, END", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe(EventType.TEXT_MESSAGE_START);
    expect(events[1]?.type).toBe(EventType.TEXT_MESSAGE_CONTENT);
    expect(events[2]?.type).toBe(EventType.TEXT_MESSAGE_END);
  });

  it("renders image as markdown in the delta", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect((events[1] as { delta: string }).delta).toBe(
      "![A photo](https://example.com/photo.png)",
    );
  });

  it("uses empty alt text when alt is undefined", () => {
    const noAlt: ImageBlock = {
      type: "image",
      url: "https://example.com/pic.jpg",
    };
    const events = mapBlockToEvents(noAlt, "msg-1");
    expect((events[1] as { delta: string }).delta).toBe("![](https://example.com/pic.jpg)");
  });

  it("sets messageId on all events", () => {
    const events = mapBlockToEvents(block, "msg-99");
    for (const event of events) {
      expect((event as { messageId: string }).messageId).toBe("msg-99");
    }
  });

  it("escapes special markdown characters in alt text", () => {
    const specialAlt: ImageBlock = {
      type: "image",
      url: "https://example.com/pic.jpg",
      alt: "Photo [with] brackets",
    };
    const events = mapBlockToEvents(specialAlt, "msg-1");
    const delta = (events[1] as { delta: string }).delta;
    expect(delta).toBe("![Photo \\[with\\] brackets](https://example.com/pic.jpg)");
  });
});
