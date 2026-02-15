import type { ChannelCapabilities } from "@templar/core";

/**
 * Static capability declaration for the LiveKit voice channel.
 *
 * Supports text (transcriptions), voice messages (recordings),
 * real-time bidirectional voice (WebRTC), and groups (rooms).
 */
export const VOICE_CAPABILITIES: ChannelCapabilities = {
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
    maxParticipants: 10,
  },
  groups: { supported: true, maxMembers: 100 },
} as const;
