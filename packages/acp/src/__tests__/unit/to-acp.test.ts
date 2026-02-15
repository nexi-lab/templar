import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { ContentBlock, OutboundMessage } from "@templar/core";
import { describe, expect, it } from "vitest";
import {
  mapBlockToSessionUpdate,
  mapOutboundToUpdates,
  mapUpdateToACP,
} from "../../mappers/to-acp.js";

describe("mapBlockToSessionUpdate", () => {
  it("maps text block to agent_message_chunk", () => {
    const block: ContentBlock = { type: "text", content: "Hello" };
    const update = mapBlockToSessionUpdate(block);

    expect(update).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello" },
    });
  });

  it("maps image block to agent_message_chunk with image content", () => {
    const block: ContentBlock = {
      type: "image",
      url: "https://example.com/img.png",
      mimeType: "image/png",
    };
    const update = mapBlockToSessionUpdate(block);

    expect(update).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "image",
        data: "https://example.com/img.png",
        mimeType: "image/png",
      },
    });
  });

  it("maps image block without mimeType defaults to image/png", () => {
    const block: ContentBlock = {
      type: "image",
      url: "https://example.com/img.webp",
    };
    const update = mapBlockToSessionUpdate(block);

    expect(update).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "image",
        data: "https://example.com/img.webp",
        mimeType: "image/png",
      },
    });
  });

  it("maps file block to agent_message_chunk with resource_link", () => {
    const block: ContentBlock = {
      type: "file",
      url: "file:///src/main.ts",
      filename: "main.ts",
      mimeType: "text/typescript",
    };
    const update = mapBlockToSessionUpdate(block);

    expect(update).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "resource_link",
        uri: "file:///src/main.ts",
        name: "main.ts",
        mimeType: "text/typescript",
      },
    });
  });

  it("maps button block to text representation", () => {
    const block: ContentBlock = {
      type: "button",
      buttons: [
        { label: "Yes", action: "yes" },
        { label: "No", action: "no" },
      ],
    };
    const update = mapBlockToSessionUpdate(block);

    expect(update).toEqual({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "[Yes] [No]" },
    });
  });
});

describe("mapOutboundToUpdates", () => {
  it("converts OutboundMessage blocks to SessionUpdate array", () => {
    const message: OutboundMessage = {
      channelId: "session-123",
      blocks: [
        { type: "text", content: "Hello" },
        { type: "text", content: "World" },
      ],
    };

    const updates = mapOutboundToUpdates(message);
    expect(updates).toHaveLength(2);
  });

  it("returns empty array for message with no blocks", () => {
    const message: OutboundMessage = {
      channelId: "session-123",
      blocks: [],
    };
    expect(mapOutboundToUpdates(message)).toEqual([]);
  });
});

describe("mapUpdateToACP", () => {
  it("passes through SessionUpdate unchanged", () => {
    const update: SessionUpdate = {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "test" },
    };
    expect(mapUpdateToACP(update)).toBe(update);
  });
});
