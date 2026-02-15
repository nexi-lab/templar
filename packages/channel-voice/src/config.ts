import { ChannelLoadError } from "@templar/errors";
import { z } from "zod";

export interface VoiceRoomConfig {
  readonly name: string;
  readonly autoCreate: boolean;
  readonly emptyTimeout: number;
  readonly maxParticipants: number;
}

export interface VoiceConfig {
  readonly livekitUrl: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly room: VoiceRoomConfig;
  readonly sttModel: string;
  readonly ttsModel: string;
  readonly ttsVoice: string;
  readonly turnDetection: "vad" | "stt" | "manual";
  readonly agentIdentity: string;
}

const RoomConfigSchema = z.object({
  name: z.string().min(1, "Room name is required"),
  autoCreate: z.boolean().default(true),
  emptyTimeout: z.number().int().positive().default(300),
  maxParticipants: z.number().int().positive().default(10),
});

const VoiceConfigSchema = z.object({
  livekitUrl: z.string().url("livekitUrl must be a valid URL"),
  apiKey: z.string().min(1, "API key is required"),
  apiSecret: z.string().min(1, "API secret is required"),
  room: RoomConfigSchema,
  sttModel: z.string().default("deepgram/nova-3"),
  ttsModel: z.string().default("openai/tts-1"),
  ttsVoice: z.string().default("alloy"),
  turnDetection: z.enum(["vad", "stt", "manual"]).default("vad"),
  agentIdentity: z.string().default("templar-agent"),
});

/**
 * Parse and validate raw config into a typed VoiceConfig.
 * Throws ChannelLoadError on validation failure.
 */
export function parseVoiceConfig(raw: Readonly<Record<string, unknown>>): VoiceConfig {
  const result = VoiceConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError("voice", `Invalid config: ${issues}`);
  }
  return result.data as VoiceConfig;
}
