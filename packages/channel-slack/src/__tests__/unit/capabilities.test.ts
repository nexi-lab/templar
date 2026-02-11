import { describe, expect, it } from "vitest";
import { SLACK_CAPABILITIES } from "../../capabilities.js";

describe("SLACK_CAPABILITIES", () => {
  it("supports text with 40k max length", () => {
    expect(SLACK_CAPABILITIES.text).toEqual({
      supported: true,
      maxLength: 40_000,
    });
  });

  it("supports rich text with expected formats", () => {
    expect(SLACK_CAPABILITIES.richText).toBeDefined();
    expect(SLACK_CAPABILITIES.richText?.supported).toBe(true);
    expect(SLACK_CAPABILITIES.richText?.formats).toContain("bold");
    expect(SLACK_CAPABILITIES.richText?.formats).toContain("italic");
    expect(SLACK_CAPABILITIES.richText?.formats).toContain("code");
    expect(SLACK_CAPABILITIES.richText?.formats).toContain("link");
    expect(SLACK_CAPABILITIES.richText?.formats).toContain("strikethrough");
    expect(SLACK_CAPABILITIES.richText?.formats).toContain("blockquote");
  });

  it("supports images up to 20MB", () => {
    expect(SLACK_CAPABILITIES.images).toEqual({
      supported: true,
      maxSize: 20_000_000,
      formats: ["jpeg", "png", "gif", "webp"],
    });
  });

  it("supports files up to 1GB", () => {
    expect(SLACK_CAPABILITIES.files).toEqual({
      supported: true,
      maxSize: 1_000_000_000,
    });
  });

  it("supports up to 25 buttons", () => {
    expect(SLACK_CAPABILITIES.buttons).toEqual({
      supported: true,
      maxButtons: 25,
    });
  });

  it("supports flat (non-nested) threads", () => {
    expect(SLACK_CAPABILITIES.threads).toEqual({
      supported: true,
      nested: false,
    });
  });

  it("supports reactions", () => {
    expect(SLACK_CAPABILITIES.reactions).toEqual({
      supported: true,
    });
  });

  it("supports groups up to 500k members", () => {
    expect(SLACK_CAPABILITIES.groups).toEqual({
      supported: true,
      maxMembers: 500_000,
    });
  });

  it("does not support typingIndicator", () => {
    expect(SLACK_CAPABILITIES.typingIndicator).toBeUndefined();
  });

  it("does not support voiceMessages", () => {
    expect(SLACK_CAPABILITIES.voiceMessages).toBeUndefined();
  });
});
