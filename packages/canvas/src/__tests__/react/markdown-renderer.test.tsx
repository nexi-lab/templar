/**
 * Unit tests for the markdown-to-HTML conversion logic and renderer module.
 */

import { describe, expect, it } from "vitest";
import { markdownToHtml } from "../../react/markdown-renderer.js";

describe("MarkdownRenderer — markdownToHtml", () => {
  it("converts headings", () => {
    expect(markdownToHtml("# Hello")).toContain("<h1>");
    expect(markdownToHtml("## Hello")).toContain("<h2>");
    expect(markdownToHtml("### Hello")).toContain("<h3>");
  });

  it("converts bold and italic", () => {
    const html = markdownToHtml("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("converts code blocks", () => {
    const html = markdownToHtml("```js\nconst x = 1;\n```");
    expect(html).toContain("<pre><code>");
  });

  it("converts inline code", () => {
    const html = markdownToHtml("use `foo()` here");
    expect(html).toContain("<code>foo()</code>");
  });

  it("escapes HTML in content", () => {
    const html = markdownToHtml("<script>alert('xss')</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("converts unordered lists", () => {
    const html = markdownToHtml("- item 1\n- item 2");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>item 1</li>");
  });

  it("handles empty string", () => {
    const html = markdownToHtml("");
    expect(html).toBe("");
  });
});

describe("MarkdownRenderer — module", () => {
  it("exports MarkdownRenderer component", async () => {
    const mod = await import("../../react/markdown-renderer.js");
    expect(mod.MarkdownRenderer).toBeDefined();
    expect(typeof mod.MarkdownRenderer).toBe("function");
  });
});
