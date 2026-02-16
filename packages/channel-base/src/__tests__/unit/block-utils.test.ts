import { describe, expect, it } from "vitest";
import { coalesceBlocks, splitText } from "../../block-utils.js";

describe("coalesceBlocks", () => {
  it("returns empty array for empty input", () => {
    expect(coalesceBlocks([])).toEqual([]);
  });

  it("returns single text block unchanged", () => {
    const blocks = [{ type: "text" as const, content: "hello" }];
    expect(coalesceBlocks(blocks)).toEqual([{ type: "text", content: "hello" }]);
  });

  it("coalesces adjacent text blocks with newline separator", () => {
    const blocks = [
      { type: "text" as const, content: "Line 1" },
      { type: "text" as const, content: "Line 2" },
      { type: "text" as const, content: "Line 3" },
    ];
    expect(coalesceBlocks(blocks)).toEqual([{ type: "text", content: "Line 1\nLine 2\nLine 3" }]);
  });

  it("does not coalesce text blocks separated by non-text block", () => {
    const blocks = [
      { type: "text" as const, content: "Before" },
      { type: "image" as const, url: "https://img.jpg" },
      { type: "text" as const, content: "After" },
    ];
    const result = coalesceBlocks(blocks);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "text", content: "Before" });
    expect(result[1]).toEqual({ type: "image", url: "https://img.jpg" });
    expect(result[2]).toEqual({ type: "text", content: "After" });
  });

  it("preserves non-text blocks in order", () => {
    const blocks = [
      { type: "image" as const, url: "https://a.jpg" },
      {
        type: "file" as const,
        url: "https://f.pdf",
        filename: "f.pdf",
        mimeType: "application/pdf",
      },
    ];
    expect(coalesceBlocks(blocks)).toEqual(blocks);
  });

  it("handles text blocks at boundaries with non-text blocks between", () => {
    const blocks = [
      { type: "text" as const, content: "A" },
      { type: "text" as const, content: "B" },
      { type: "image" as const, url: "https://img.jpg" },
      { type: "text" as const, content: "C" },
      { type: "text" as const, content: "D" },
    ];
    const result = coalesceBlocks(blocks);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "text", content: "A\nB" });
    expect(result[1]).toEqual({ type: "image", url: "https://img.jpg" });
    expect(result[2]).toEqual({ type: "text", content: "C\nD" });
  });

  it("does not mutate input array", () => {
    const blocks = [
      { type: "text" as const, content: "A" },
      { type: "text" as const, content: "B" },
    ];
    const original = [...blocks];
    coalesceBlocks(blocks);
    expect(blocks).toEqual(original);
  });
});

describe("splitText", () => {
  it("returns single chunk for text within limit", () => {
    expect(splitText("hello", 100)).toEqual(["hello"]);
  });

  it("returns single chunk for text exactly at limit", () => {
    const text = "x".repeat(100);
    expect(splitText(text, 100)).toEqual([text]);
  });

  it("splits at newline when possible", () => {
    const text = `${"x".repeat(50)}\n${"y".repeat(50)}`;
    const result = splitText(text, 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("x".repeat(50));
    expect(result[1]).toBe("y".repeat(50));
  });

  it("splits at space when no newline available", () => {
    const text = `${"x".repeat(50)} ${"y".repeat(50)}`;
    const result = splitText(text, 60);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("x".repeat(50));
    expect(result[1]).toBe("y".repeat(50));
  });

  it("hard-cuts when no newline or space available", () => {
    const text = "x".repeat(200);
    const result = splitText(text, 100);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("x".repeat(100));
    expect(result[1]).toBe("x".repeat(100));
  });

  it("handles multiple chunks", () => {
    const text = "x".repeat(300);
    const result = splitText(text, 100);
    expect(result).toHaveLength(3);
    for (const chunk of result) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("trims leading whitespace on subsequent chunks", () => {
    const text = `${"x".repeat(50)} ${"y".repeat(50)}`;
    const result = splitText(text, 51);
    expect(result[1]?.[0]).not.toBe(" ");
  });

  it("returns empty result for empty string", () => {
    expect(splitText("", 100)).toEqual([""]);
  });
});
