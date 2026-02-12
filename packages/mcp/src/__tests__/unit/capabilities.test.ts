import { describe, expect, it } from "vitest";
import { MCP_CAPABILITIES } from "../../adapter/capabilities.js";

describe("MCP_CAPABILITIES", () => {
  it("declares text capability", () => {
    expect(MCP_CAPABILITIES.text).toBeDefined();
    expect(MCP_CAPABILITIES.text?.supported).toBe(true);
  });

  it("sets maxLength to Number.MAX_SAFE_INTEGER", () => {
    expect(MCP_CAPABILITIES.text?.maxLength).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("does not declare image capability", () => {
    expect(MCP_CAPABILITIES.images).toBeUndefined();
  });

  it("does not declare file capability", () => {
    expect(MCP_CAPABILITIES.files).toBeUndefined();
  });

  it("does not declare button capability", () => {
    expect(MCP_CAPABILITIES.buttons).toBeUndefined();
  });

  it("does not declare thread capability", () => {
    expect(MCP_CAPABILITIES.threads).toBeUndefined();
  });
});
