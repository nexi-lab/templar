import { isChannelCapabilities } from "@templar/channel-base";
import { describe, expect, it } from "vitest";
import { VOICE_CAPABILITIES } from "../../capabilities.js";

describe("VOICE_CAPABILITIES", () => {
  it("should pass isChannelCapabilities validation", () => {
    expect(isChannelCapabilities(VOICE_CAPABILITIES)).toBe(true);
  });

  it("should include realTimeVoice capability", () => {
    expect(VOICE_CAPABILITIES.realTimeVoice).toBeDefined();
    expect(VOICE_CAPABILITIES.realTimeVoice?.supported).toBe(true);
    expect(VOICE_CAPABILITIES.realTimeVoice?.codecs).toContain("opus");
    expect(VOICE_CAPABILITIES.realTimeVoice?.duplex).toBe(true);
    expect(VOICE_CAPABILITIES.realTimeVoice?.maxParticipants).toBeGreaterThan(0);
  });

  it("should include text capability for transcriptions", () => {
    expect(VOICE_CAPABILITIES.text).toBeDefined();
    expect(VOICE_CAPABILITIES.text?.supported).toBe(true);
  });
});
