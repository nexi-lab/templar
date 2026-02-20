/**
 * Markdown renderer for canvas artifacts.
 *
 * Renders markdown as HTML inside a sandboxed iframe (same security model
 * as the HTML renderer) to prevent XSS from agent-generated content.
 *
 * Uses a lightweight regex-based markdown-to-HTML conversion. For richer
 * rendering, consumers can override with their own component.
 */

import { useMemo } from "react";
import { HtmlRenderer } from "./html-renderer.js";

export interface MarkdownRendererProps {
  readonly content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markdownToHtml(md: string): string {
  let html = escapeHtml(md);

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^#{6}\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#{5}\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^#{4}\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^#{2}\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#{1}\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Paragraphs (wrap remaining non-empty lines not already wrapped)
  html = html.replace(/^(?!<[a-z]).+$/gm, (line) => {
    return line.trim() ? `<p>${line}</p>` : "";
  });

  return html;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = useMemo(() => markdownToHtml(content), [content]);

  if (!content) {
    return null;
  }

  // Render inside sandboxed iframe for XSS safety (same as HTML artifacts)
  return <HtmlRenderer content={html} />;
}
