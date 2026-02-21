import { describe, expect, it } from "vitest";
import { EMAIL_CAPABILITIES } from "../../capabilities.js";

describe("EMAIL_CAPABILITIES", () => {
  it("supports text with 1MB max length", () => {
    expect(EMAIL_CAPABILITIES.text).toEqual({
      supported: true,
      maxLength: 1_000_000,
    });
  });

  it("supports rich text with HTML format", () => {
    expect(EMAIL_CAPABILITIES.richText).toEqual({
      supported: true,
      formats: ["html"],
    });
  });

  it("supports images up to 25MB", () => {
    expect(EMAIL_CAPABILITIES.images).toEqual({
      supported: true,
      maxSize: 25_000_000,
      formats: ["jpeg", "png", "gif", "webp"],
    });
  });

  it("supports files up to 25MB", () => {
    expect(EMAIL_CAPABILITIES.files).toEqual({
      supported: true,
      maxSize: 25_000_000,
    });
  });

  it("supports non-nested threads", () => {
    expect(EMAIL_CAPABILITIES.threads).toEqual({
      supported: true,
      nested: false,
    });
  });

  it("does not support buttons", () => {
    expect(EMAIL_CAPABILITIES.buttons).toBeUndefined();
  });

  it("does not support typing indicator", () => {
    expect(EMAIL_CAPABILITIES.typingIndicator).toBeUndefined();
  });

  it("does not support reactions", () => {
    expect(EMAIL_CAPABILITIES.reactions).toBeUndefined();
  });

  it("does not support voice messages", () => {
    expect(EMAIL_CAPABILITIES.voiceMessages).toBeUndefined();
  });

  it("does not support groups", () => {
    expect(EMAIL_CAPABILITIES.groups).toBeUndefined();
  });
});
