import { describe, expect, it } from "vitest";
import { ACP_CAPABILITIES } from "../../capabilities.js";

describe("ACP_CAPABILITIES", () => {
  it("supports text with large max length", () => {
    expect(ACP_CAPABILITIES.text).toEqual({
      supported: true,
      maxLength: Number.MAX_SAFE_INTEGER,
    });
  });

  it("supports rich text with markdown format", () => {
    expect(ACP_CAPABILITIES.richText).toEqual({
      supported: true,
      formats: ["markdown"],
    });
  });

  it("does not advertise image capability", () => {
    expect(ACP_CAPABILITIES.images).toBeUndefined();
  });

  it("does not advertise file capability", () => {
    expect(ACP_CAPABILITIES.files).toBeUndefined();
  });

  it("does not advertise button capability", () => {
    expect(ACP_CAPABILITIES.buttons).toBeUndefined();
  });

  it("does not advertise thread capability", () => {
    expect(ACP_CAPABILITIES.threads).toBeUndefined();
  });
});
