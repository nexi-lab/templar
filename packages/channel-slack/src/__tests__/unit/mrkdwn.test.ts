import { describe, expect, it } from "vitest";
import { mrkdwnToPlainText, toMrkdwn } from "../../mrkdwn.js";

describe("toMrkdwn", () => {
  it.each([
    ["empty string", "", ""],
    ["plain text", "Hello world", "Hello world"],
    ["bold markdown", "**bold text**", "*bold text*"],
    ["strikethrough markdown", "~~deleted~~", "~deleted~"],
    ["markdown link", "[Click here](https://example.com)", "<https://example.com|Click here>"],
    ["heading h1", "# Title", "*Title*"],
    ["heading h2", "## Subtitle", "*Subtitle*"],
    ["heading h3", "### Section", "*Section*"],
    ["HTML bold", "<b>bold</b>", "*bold*"],
    ["HTML strong", "<strong>bold</strong>", "*bold*"],
    ["HTML italic", "<i>italic</i>", "_italic_"],
    ["HTML em", "<em>italic</em>", "_italic_"],
    ["HTML strikethrough", "<s>deleted</s>", "~deleted~"],
    ["HTML strike", "<strike>deleted</strike>", "~deleted~"],
    ["HTML del", "<del>deleted</del>", "~deleted~"],
    ["HTML link", '<a href="https://example.com">Click</a>', "<https://example.com|Click>"],
  ])("converts %s", (_label, input, expected) => {
    expect(toMrkdwn(input)).toBe(expected);
  });

  it("preserves inline code", () => {
    expect(toMrkdwn("Use `**bold**` syntax")).toBe("Use `**bold**` syntax");
  });

  it("preserves code blocks", () => {
    const input = "Before\n```\n**bold**\n```\nAfter";
    const result = toMrkdwn(input);
    expect(result).toContain("```\n**bold**\n```");
    // The **bold** inside the code block should NOT be converted to *bold*
    // It should remain as **bold** (double asterisks preserved)
    expect(result).toContain("**bold**");
  });

  it("handles multiple formatting in one string", () => {
    expect(toMrkdwn("**bold** and ~~strike~~")).toBe("*bold* and ~strike~");
  });

  it("handles nested HTML", () => {
    expect(toMrkdwn("<b>outer <i>inner</i></b>")).toBe("*outer _inner_*");
  });
});

describe("mrkdwnToPlainText", () => {
  it.each([
    ["plain text", "Hello", "Hello"],
    ["bold", "*bold*", "bold"],
    ["italic", "_italic_", "italic"],
    ["strikethrough", "~deleted~", "deleted"],
    ["link with text", "<https://example.com|Click>", "Click"],
    ["bare link", "<https://example.com>", "https://example.com"],
    ["inline code", "`code`", "code"],
  ])("converts %s", (_label, input, expected) => {
    expect(mrkdwnToPlainText(input)).toBe(expected);
  });

  it("strips code block markers", () => {
    const input = "```\ncode here\n```";
    expect(mrkdwnToPlainText(input)).toContain("code here");
  });
});
