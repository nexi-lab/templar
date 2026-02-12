import type { ChannelCapabilities } from "@templar/core";
import { describe, expect, it } from "vitest";
import { DISCORD_CAPABILITIES } from "../../capabilities.js";

describe("DISCORD_CAPABILITIES", () => {
  it("conforms to ChannelCapabilities type", () => {
    const caps: ChannelCapabilities = DISCORD_CAPABILITIES;
    expect(caps).toBeDefined();
  });

  it("supports text with 2000-char limit", () => {
    expect(DISCORD_CAPABILITIES.text).toEqual({
      supported: true,
      maxLength: 2000,
    });
  });

  it("supports richText with standard markdown formats", () => {
    expect(DISCORD_CAPABILITIES.richText).toEqual({
      supported: true,
      formats: ["bold", "italic", "code", "link", "strikethrough", "blockquote"],
    });
  });

  it("supports images up to 25MB", () => {
    expect(DISCORD_CAPABILITIES.images).toEqual({
      supported: true,
      maxSize: 25_000_000,
      formats: ["jpeg", "png", "gif", "webp"],
    });
  });

  it("supports files up to 25MB", () => {
    expect(DISCORD_CAPABILITIES.files).toEqual({
      supported: true,
      maxSize: 25_000_000,
    });
  });

  it("supports buttons with 25-button max", () => {
    expect(DISCORD_CAPABILITIES.buttons).toEqual({
      supported: true,
      maxButtons: 25,
    });
  });

  it("supports non-nested threads", () => {
    expect(DISCORD_CAPABILITIES.threads).toEqual({
      supported: true,
      nested: false,
    });
  });

  it("supports reactions", () => {
    expect(DISCORD_CAPABILITIES.reactions).toEqual({
      supported: true,
    });
  });

  it("supports groups with 500K member limit", () => {
    expect(DISCORD_CAPABILITIES.groups).toEqual({
      supported: true,
      maxMembers: 500_000,
    });
  });

  it("does not include typingIndicator", () => {
    expect(DISCORD_CAPABILITIES.typingIndicator).toBeUndefined();
  });

  it("does not include voiceMessages", () => {
    expect(DISCORD_CAPABILITIES.voiceMessages).toBeUndefined();
  });

  it("does not include readReceipts", () => {
    expect(DISCORD_CAPABILITIES.readReceipts).toBeUndefined();
  });
});
