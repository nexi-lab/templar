import type { ContentBlock } from "@templar/core";
import { describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../../mappers/to-agui.js";

describe("mapBlockToEvents exhaustiveness", () => {
  it("handles text blocks", () => {
    const block: ContentBlock = { type: "text", content: "hi" };
    expect(mapBlockToEvents(block, "m")).not.toHaveLength(0);
  });

  it("handles image blocks", () => {
    const block: ContentBlock = {
      type: "image",
      url: "https://example.com/img.png",
    };
    expect(mapBlockToEvents(block, "m")).not.toHaveLength(0);
  });

  it("handles file blocks", () => {
    const block: ContentBlock = {
      type: "file",
      url: "https://example.com/f.txt",
      filename: "f.txt",
      mimeType: "text/plain",
    };
    expect(mapBlockToEvents(block, "m")).not.toHaveLength(0);
  });

  it("handles button blocks", () => {
    const block: ContentBlock = {
      type: "button",
      buttons: [{ label: "OK", action: "ok" }],
    };
    expect(mapBlockToEvents(block, "m")).not.toHaveLength(0);
  });

  it("never returns an empty array for any known block type", () => {
    const blocks: ContentBlock[] = [
      { type: "text", content: "hi" },
      { type: "image", url: "https://example.com/img.png" },
      {
        type: "file",
        url: "https://example.com/f.txt",
        filename: "f.txt",
        mimeType: "text/plain",
      },
      {
        type: "button",
        buttons: [{ label: "OK", action: "ok" }],
      },
    ];
    for (const block of blocks) {
      const events = mapBlockToEvents(block, "m");
      expect(events.length).toBeGreaterThan(0);
    }
  });
});
