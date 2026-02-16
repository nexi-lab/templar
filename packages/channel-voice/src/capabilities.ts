import type { ChannelCapabilities } from "@templar/core";
import type { VoiceRoomConfig } from "./config.js";

/**
 * Default voice capabilities. Used as fallback when no config is provided.
 */
export const VOICE_CAPABILITIES: ChannelCapabilities = createVoiceCapabilities();

/**
 * Create voice capabilities, optionally merging room config for accurate
 * maxParticipants reporting.
 */
export function createVoiceCapabilities(room?: VoiceRoomConfig): ChannelCapabilities {
  return {
    text: { supported: true, maxLength: Number.MAX_SAFE_INTEGER },
    voiceMessages: {
      supported: true,
      maxDuration: 3600,
      formats: ["opus", "ogg", "wav"],
    },
    realTimeVoice: {
      supported: true,
      codecs: ["opus"],
      sampleRates: [16000, 48000],
      duplex: true,
      maxParticipants: room?.maxParticipants ?? 10,
    },
    groups: { supported: true, maxMembers: room?.maxParticipants ?? 100 },
  } as const;
}
