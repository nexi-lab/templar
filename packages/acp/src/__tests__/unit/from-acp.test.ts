import type { ContentBlock as ACPContentBlock } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  mapACPBlockToTemplar,
  mapACPContentToBlocks,
  mapACPPromptToInbound,
} from "../../mappers/from-acp.js";

describe("mapACPBlockToTemplar", () => {
  it("maps text content", () => {
    const block: ACPContentBlock = { type: "text", text: "Hello world" };
    const result = mapACPBlockToTemplar(block);

    expect(result).toEqual({ type: "text", content: "Hello world" });
  });

  it("maps image content with URI", () => {
    const block: ACPContentBlock = {
      type: "image",
      data: "base64data",
      mimeType: "image/png",
      uri: "file:///path/to/image.png",
    };
    const result = mapACPBlockToTemplar(block);

    expect(result).toEqual({
      type: "image",
      url: "file:///path/to/image.png",
      mimeType: "image/png",
    });
  });

  it("maps image content without URI to data URL", () => {
    const block: ACPContentBlock = {
      type: "image",
      data: "base64data",
      mimeType: "image/jpeg",
    };
    const result = mapACPBlockToTemplar(block);

    expect(result).toEqual({
      type: "image",
      url: "data:image/jpeg;base64,base64data",
      mimeType: "image/jpeg",
    });
  });

  it("maps resource_link to file block", () => {
    const block: ACPContentBlock = {
      type: "resource_link",
      uri: "file:///src/main.ts",
      name: "main.ts",
      mimeType: "text/typescript",
    };
    const result = mapACPBlockToTemplar(block);

    expect(result).toEqual({
      type: "file",
      url: "file:///src/main.ts",
      filename: "main.ts",
      mimeType: "text/typescript",
    });
  });

  it("maps resource_link without mimeType defaults to octet-stream", () => {
    const block: ACPContentBlock = {
      type: "resource_link",
      uri: "file:///data.bin",
      name: "data.bin",
    };
    const result = mapACPBlockToTemplar(block);

    expect(result).toEqual({
      type: "file",
      url: "file:///data.bin",
      filename: "data.bin",
      mimeType: "application/octet-stream",
    });
  });

  it("maps embedded text resource to text block", () => {
    const block: ACPContentBlock = {
      type: "resource",
      resource: {
        uri: "file:///readme.md",
        text: "# README\nHello",
      },
    };
    const result = mapACPBlockToTemplar(block);

    expect(result).toEqual({ type: "text", content: "# README\nHello" });
  });

  it("returns undefined for audio content", () => {
    const block: ACPContentBlock = {
      type: "audio",
      data: "base64audio",
      mimeType: "audio/wav",
    };
    const result = mapACPBlockToTemplar(block);

    expect(result).toBeUndefined();
  });
});

describe("mapACPContentToBlocks", () => {
  it("converts array of mixed blocks", () => {
    const acpBlocks: ACPContentBlock[] = [
      { type: "text", text: "Hello" },
      { type: "audio", data: "x", mimeType: "audio/wav" }, // unsupported
      { type: "text", text: "World" },
    ];

    const result = mapACPContentToBlocks(acpBlocks);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "text", content: "Hello" });
    expect(result[1]).toEqual({ type: "text", content: "World" });
  });

  it("returns empty array for empty input", () => {
    expect(mapACPContentToBlocks([])).toEqual([]);
  });
});

describe("mapACPPromptToInbound", () => {
  it("creates InboundMessage from ACP prompt", () => {
    const prompt: ACPContentBlock[] = [{ type: "text", text: "Fix the bug" }];

    const inbound = mapACPPromptToInbound("session-123", prompt);

    expect(inbound.channelType).toBe("acp");
    expect(inbound.channelId).toBe("session-123");
    expect(inbound.senderId).toBe("ide-client");
    expect(inbound.blocks).toHaveLength(1);
    expect(inbound.blocks[0]).toEqual({ type: "text", content: "Fix the bug" });
    expect(inbound.timestamp).toBeLessThanOrEqual(Date.now());
    expect(inbound.messageId).toBeDefined();
    expect(inbound.raw).toBe(prompt);
  });
});
