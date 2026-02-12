import { describe, expect, it } from "vitest";
import { WHATSAPP_CAPABILITIES } from "../../capabilities.js";

describe("WHATSAPP_CAPABILITIES", () => {
  it("should support text with 65K max length", () => {
    expect(WHATSAPP_CAPABILITIES.text).toEqual({
      supported: true,
      maxLength: 65_536,
    });
  });

  it("should not support richText (WhatsApp has no markdown API)", () => {
    expect(WHATSAPP_CAPABILITIES.richText).toBeUndefined();
  });

  it("should support images with 16MB max and common formats", () => {
    expect(WHATSAPP_CAPABILITIES.images).toEqual({
      supported: true,
      maxSize: 16_000_000,
      formats: ["jpeg", "png", "gif", "webp"],
    });
  });

  it("should support files with 100MB max", () => {
    expect(WHATSAPP_CAPABILITIES.files).toEqual({
      supported: true,
      maxSize: 100_000_000,
    });
  });

  it("should support buttons with max 3", () => {
    expect(WHATSAPP_CAPABILITIES.buttons).toEqual({
      supported: true,
      maxButtons: 3,
    });
  });

  it("should not support threads (WhatsApp has no thread model)", () => {
    expect(WHATSAPP_CAPABILITIES.threads).toBeUndefined();
  });

  it("should support reactions", () => {
    expect(WHATSAPP_CAPABILITIES.reactions).toEqual({ supported: true });
  });

  it("should support typing indicator", () => {
    expect(WHATSAPP_CAPABILITIES.typingIndicator).toEqual({ supported: true });
  });

  it("should support read receipts", () => {
    expect(WHATSAPP_CAPABILITIES.readReceipts).toEqual({ supported: true });
  });

  it("should support voice messages with 15min max", () => {
    expect(WHATSAPP_CAPABILITIES.voiceMessages).toEqual({
      supported: true,
      maxDuration: 900,
      formats: ["ogg", "mp4"],
    });
  });

  it("should support groups with 1024 members", () => {
    expect(WHATSAPP_CAPABILITIES.groups).toEqual({
      supported: true,
      maxMembers: 1024,
    });
  });

  it("should be frozen (immutable)", () => {
    expect(Object.isFrozen(WHATSAPP_CAPABILITIES)).toBe(true);
  });
});
