import { describe, expect, it } from "vitest";
import { TELEGRAM_CAPABILITIES } from "../../capabilities.js";

describe("TELEGRAM_CAPABILITIES", () => {
  it("declares text with 4096 char limit", () => {
    expect(TELEGRAM_CAPABILITIES.text).toEqual({
      supported: true,
      maxLength: 4096,
    });
  });

  it("declares richText with supported formats", () => {
    expect(TELEGRAM_CAPABILITIES.richText?.supported).toBe(true);
    expect(TELEGRAM_CAPABILITIES.richText?.formats).toContain("bold");
    expect(TELEGRAM_CAPABILITIES.richText?.formats).toContain("italic");
    expect(TELEGRAM_CAPABILITIES.richText?.formats).toContain("code");
    expect(TELEGRAM_CAPABILITIES.richText?.formats).toContain("link");
  });

  it("declares images with 10MB limit and common formats", () => {
    expect(TELEGRAM_CAPABILITIES.images).toEqual({
      supported: true,
      maxSize: 10_000_000,
      formats: ["jpeg", "png", "gif", "webp"],
    });
  });

  it("declares files with 50MB limit", () => {
    expect(TELEGRAM_CAPABILITIES.files).toEqual({
      supported: true,
      maxSize: 50_000_000,
    });
  });

  it("declares buttons with 100 max", () => {
    expect(TELEGRAM_CAPABILITIES.buttons).toEqual({
      supported: true,
      maxButtons: 100,
    });
  });

  it("declares typingIndicator", () => {
    expect(TELEGRAM_CAPABILITIES.typingIndicator).toEqual({
      supported: true,
    });
  });

  it("declares voiceMessages with 60s max, ogg format", () => {
    expect(TELEGRAM_CAPABILITIES.voiceMessages).toEqual({
      supported: true,
      maxDuration: 60,
      formats: ["ogg"],
    });
  });

  it("declares groups with 200k max members", () => {
    expect(TELEGRAM_CAPABILITIES.groups).toEqual({
      supported: true,
      maxMembers: 200_000,
    });
  });

  it("does not declare threads", () => {
    expect(TELEGRAM_CAPABILITIES.threads).toBeUndefined();
  });

  it("does not declare reactions", () => {
    expect(TELEGRAM_CAPABILITIES.reactions).toBeUndefined();
  });

  it("does not declare readReceipts", () => {
    expect(TELEGRAM_CAPABILITIES.readReceipts).toBeUndefined();
  });
});
