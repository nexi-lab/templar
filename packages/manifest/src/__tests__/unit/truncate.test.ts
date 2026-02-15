import { describe, expect, it } from "vitest";

import { truncateContent } from "../../truncate.js";

describe("truncateContent", () => {
  const filePath = "/test/TEMPLAR.md";

  it("returns content unchanged when within budget", () => {
    const content = "Hello, world!";
    const result = truncateContent(content, { budget: 100, filePath });

    expect(result.content).toBe(content);
    expect(result.originalSize).toBe(content.length);
    expect(result.truncated).toBe(false);
  });

  it("returns content unchanged when exactly at budget", () => {
    const content = "x".repeat(500);
    const result = truncateContent(content, { budget: 500, filePath });

    expect(result.content).toBe(content);
    expect(result.originalSize).toBe(500);
    expect(result.truncated).toBe(false);
  });

  it("truncates content 1 char over budget", () => {
    const content = "x".repeat(501);
    const result = truncateContent(content, { budget: 500, filePath });

    expect(result.truncated).toBe(true);
    expect(result.originalSize).toBe(501);
    expect(result.content.length).toBeLessThanOrEqual(500);
  });

  it("produces output within budget for oversized content", () => {
    const content = "x".repeat(15_000);
    const result = truncateContent(content, { budget: 10_000, filePath });

    expect(result.truncated).toBe(true);
    expect(result.originalSize).toBe(15_000);
    expect(result.content.length).toBeLessThanOrEqual(10_000);
  });

  it("includes dropped count in truncation marker", () => {
    const content = "x".repeat(5_000);
    const result = truncateContent(content, { budget: 1_000, filePath });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain("[Truncated:");
    expect(result.content).toContain("chars omitted from");
    expect(result.content).toContain(filePath);
  });

  it("preserves head and tail of content", () => {
    // Build a content string with distinct head and tail
    const head = "HEAD_MARKER_" + "a".repeat(5_000);
    const tail = "b".repeat(5_000) + "_TAIL_MARKER";
    const content = head + tail;
    const result = truncateContent(content, { budget: 5_000, filePath });

    expect(result.truncated).toBe(true);
    expect(result.content).toContain("HEAD_MARKER_");
    expect(result.content).toContain("_TAIL_MARKER");
  });

  it("handles empty content without truncation", () => {
    const result = truncateContent("", { budget: 1_000, filePath });

    expect(result.content).toBe("");
    expect(result.originalSize).toBe(0);
    expect(result.truncated).toBe(false);
  });

  // Property-based: approximate 70/20/10 distribution
  it("allocates ~78% to head and ~22% to tail (of available space)", () => {
    const content = "x".repeat(100_000);
    const budget = 10_000;
    const result = truncateContent(content, { budget, filePath });

    expect(result.truncated).toBe(true);

    // Extract head (before marker) and tail (after marker)
    const markerStart = result.content.indexOf("\n\n---\n[Truncated:");
    expect(markerStart).toBeGreaterThan(0);

    const markerEnd = result.content.indexOf(
      "Reduce file size for full content.]\n",
    );
    expect(markerEnd).toBeGreaterThan(markerStart);

    const headLen = markerStart;
    const markerLen =
      markerEnd + "Reduce file size for full content.]\n".length - markerStart;
    const tailLen = result.content.length - markerStart - markerLen;

    // Head should be roughly 78% of available space
    const available = budget - markerLen;
    const headRatio = headLen / available;
    expect(headRatio).toBeGreaterThan(0.7);
    expect(headRatio).toBeLessThan(0.85);

    // Tail should be roughly 22% of available space
    const tailRatio = tailLen / available;
    expect(tailRatio).toBeGreaterThan(0.15);
    expect(tailRatio).toBeLessThan(0.3);
  });

  it("handles very small budget gracefully", () => {
    const content = "x".repeat(1_000);
    const result = truncateContent(content, { budget: 10, filePath });

    expect(result.truncated).toBe(true);
    expect(result.content.length).toBeLessThanOrEqual(10);
  });
});
