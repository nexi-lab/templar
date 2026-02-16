import { ChannelLoadError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { parseVoiceConfig } from "../../config.js";

const VALID_CONFIG = {
  livekitUrl: "wss://test.livekit.cloud",
  apiKey: "test-key",
  apiSecret: "test-secret",
  room: { name: "test-room" },
};

describe("parseVoiceConfig", () => {
  it("should parse valid config with all required fields", () => {
    const config = parseVoiceConfig(VALID_CONFIG);
    expect(config.livekitUrl).toBe("wss://test.livekit.cloud");
    expect(config.apiKey).toBe("test-key");
    expect(config.apiSecret).toBe("test-secret");
    expect(config.room.name).toBe("test-room");
  });

  it("should apply defaults for optional fields", () => {
    const config = parseVoiceConfig(VALID_CONFIG);
    expect(config.sttModel).toBe("deepgram/nova-3");
    expect(config.ttsModel).toBe("openai/tts-1");
    expect(config.ttsVoice).toBe("alloy");
    expect(config.turnDetection).toBe("vad");
    expect(config.agentIdentity).toBe("templar-agent");
    expect(config.room.autoCreate).toBe(true);
    expect(config.room.emptyTimeout).toBe(300);
    expect(config.room.maxParticipants).toBe(10);
  });

  it("should throw ChannelLoadError for missing required fields", () => {
    expect(() => parseVoiceConfig({})).toThrow(ChannelLoadError);
    expect(() => parseVoiceConfig({ livekitUrl: "wss://test.livekit.cloud" })).toThrow(
      ChannelLoadError,
    );
  });

  it("should reject invalid URL format", () => {
    expect(() => parseVoiceConfig({ ...VALID_CONFIG, livekitUrl: "not-a-url" })).toThrow(
      ChannelLoadError,
    );
  });

  it("should accept custom model strings", () => {
    const config = parseVoiceConfig({
      ...VALID_CONFIG,
      sttModel: "deepgram/nova-2-general",
      ttsModel: "elevenlabs/turbo-v2.5",
      ttsVoice: "rachel",
      turnDetection: "stt",
    });
    expect(config.sttModel).toBe("deepgram/nova-2-general");
    expect(config.ttsModel).toBe("elevenlabs/turbo-v2.5");
    expect(config.ttsVoice).toBe("rachel");
    expect(config.turnDetection).toBe("stt");
  });
});
