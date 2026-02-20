/**
 * Unit tests for HtmlRenderer's srcdoc generation and security properties.
 *
 * Tests the buildSrcdoc function and verifies security invariants
 * without requiring a DOM environment.
 */

import { describe, expect, it } from "vitest";
import { buildSrcdoc } from "../../react/postmessage-bridge.js";

describe("HtmlRenderer — srcdoc security", () => {
  it("srcdoc contains CSP meta tag blocking default-src", () => {
    const srcdoc = buildSrcdoc("<p>Hello</p>");
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain("default-src 'none'");
  });

  it("srcdoc allows only inline scripts and styles", () => {
    const srcdoc = buildSrcdoc("<p>Hello</p>");
    expect(srcdoc).toContain("script-src 'unsafe-inline'");
    expect(srcdoc).toContain("style-src 'unsafe-inline'");
    // Should NOT allow external scripts
    expect(srcdoc).not.toContain("script-src http");
    expect(srcdoc).not.toContain("script-src https");
  });

  it("srcdoc includes the bridge script", () => {
    const srcdoc = buildSrcdoc("<p>Test</p>");
    expect(srcdoc).toContain("ResizeObserver");
    expect(srcdoc).toContain("postMessage");
    expect(srcdoc).toContain("window.onerror");
  });

  it("srcdoc wraps content in proper HTML structure", () => {
    const srcdoc = buildSrcdoc("<p>Content</p>");
    expect(srcdoc).toContain("<!DOCTYPE html>");
    expect(srcdoc).toContain("<html>");
    expect(srcdoc).toContain("<head>");
    expect(srcdoc).toContain("<body>");
    expect(srcdoc).toContain("<p>Content</p>");
  });

  it("content appears before bridge script in srcdoc", () => {
    const srcdoc = buildSrcdoc("<div>Agent HTML</div>");
    const contentIdx = srcdoc.indexOf("<div>Agent HTML</div>");
    const scriptIdx = srcdoc.indexOf("<script>");
    expect(contentIdx).toBeLessThan(scriptIdx);
  });
});
