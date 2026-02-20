import { describe, expect, it } from "vitest";
import { BRIDGE_SCRIPT, buildSrcdoc, CSP_META } from "../../react/postmessage-bridge.js";

describe("postmessage-bridge", () => {
  it("BRIDGE_SCRIPT contains ResizeObserver setup", () => {
    expect(BRIDGE_SCRIPT).toContain("ResizeObserver");
  });

  it("BRIDGE_SCRIPT sends ready message", () => {
    expect(BRIDGE_SCRIPT).toContain('{ type: "ready" }');
  });

  it("BRIDGE_SCRIPT catches window errors", () => {
    expect(BRIDGE_SCRIPT).toContain("window.onerror");
  });

  it("CSP_META blocks default-src", () => {
    expect(CSP_META).toContain("default-src 'none'");
  });

  it("buildSrcdoc wraps content with CSP and bridge script", () => {
    const srcdoc = buildSrcdoc("<p>Hello</p>");

    expect(srcdoc).toContain("<!DOCTYPE html>");
    expect(srcdoc).toContain("<p>Hello</p>");
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain("ResizeObserver");
    // Content should come before bridge script
    const contentIdx = srcdoc.indexOf("<p>Hello</p>");
    const scriptIdx = srcdoc.indexOf("<script>");
    expect(contentIdx).toBeLessThan(scriptIdx);
  });
});
