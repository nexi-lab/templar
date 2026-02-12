import { ChannelLoadError } from "@templar/errors";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Intent names (string-based to avoid importing discord.js at config time)
// ---------------------------------------------------------------------------

const VALID_INTENTS = [
  "Guilds",
  "GuildMembers",
  "GuildModeration",
  "GuildEmojisAndStickers",
  "GuildIntegrations",
  "GuildWebhooks",
  "GuildInvites",
  "GuildVoiceStates",
  "GuildPresences",
  "GuildMessages",
  "GuildMessageReactions",
  "GuildMessageTyping",
  "DirectMessages",
  "DirectMessageReactions",
  "DirectMessageTyping",
  "MessageContent",
  "GuildScheduledEvents",
  "AutoModerationConfiguration",
  "AutoModerationExecution",
] as const;

export type IntentName = (typeof VALID_INTENTS)[number];

const IntentNameSchema = z.enum(VALID_INTENTS);

// ---------------------------------------------------------------------------
// Sweeper timing
// ---------------------------------------------------------------------------

const SweeperTimingSchema = z.object({
  interval: z.number().int().positive(),
  lifetime: z.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Config types — hand-written to satisfy exactOptionalPropertyTypes
// ---------------------------------------------------------------------------

export interface SweeperTiming {
  readonly interval: number;
  readonly lifetime: number;
}

export interface SweepersConfig {
  readonly messages: SweeperTiming | undefined;
  readonly users: { readonly interval: number } | undefined;
  readonly threads: SweeperTiming | undefined;
}

export interface PresenceActivity {
  readonly name: string;
  readonly type: number | undefined;
}

export interface PresenceConfig {
  readonly status: "online" | "idle" | "dnd" | "invisible" | undefined;
  readonly activities: readonly PresenceActivity[] | undefined;
}

export interface DiscordConfig {
  readonly token: string;
  readonly intents: readonly IntentName[];
  readonly sweepers: SweepersConfig;
  readonly presence: PresenceConfig | undefined;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_INTENTS: readonly IntentName[] = [
  "Guilds",
  "GuildMessages",
  "MessageContent",
] as const;

export const DEFAULT_SWEEPERS: SweepersConfig = {
  messages: { interval: 3600, lifetime: 1800 },
  users: undefined,
  threads: { interval: 3600, lifetime: 1800 },
} as const;

// ---------------------------------------------------------------------------
// Full config schema
// ---------------------------------------------------------------------------

const SweepersConfigSchema = z
  .object({
    messages: SweeperTimingSchema.optional(),
    users: z.object({ interval: z.number().int().positive() }).optional(),
    threads: SweeperTimingSchema.optional(),
  })
  .optional();

const PresenceConfigSchema = z
  .object({
    status: z.enum(["online", "idle", "dnd", "invisible"]).optional(),
    activities: z
      .array(
        z.object({
          name: z.string().min(1),
          type: z.number().int().min(0).max(5).optional(),
        }),
      )
      .optional(),
  })
  .optional();

const DiscordConfigSchema = z.object({
  token: z.string().min(1, "Bot token is required"),
  intents: z.array(IntentNameSchema).optional(),
  sweepers: SweepersConfigSchema,
  presence: PresenceConfigSchema,
});

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function toSweepersConfig(raw: unknown): SweepersConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_SWEEPERS;
  const obj = raw as Record<string, unknown>;
  return {
    messages: (obj.messages as SweeperTiming | undefined) ?? undefined,
    users: (obj.users as { readonly interval: number } | undefined) ?? undefined,
    threads: (obj.threads as SweeperTiming | undefined) ?? undefined,
  };
}

function toPresenceConfig(raw: unknown): PresenceConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const status = (obj.status as PresenceConfig["status"]) ?? undefined;
  const rawActivities = obj.activities as { name: string; type?: number }[] | undefined;
  const activities = rawActivities?.map((a) => ({
    name: a.name,
    type: a.type ?? (undefined as number | undefined),
  }));
  return { status, activities };
}

/**
 * Parse and validate raw config into a typed DiscordConfig.
 * Applies production-safe defaults for intents and sweepers.
 * Throws ChannelLoadError on validation failure.
 */
export function parseDiscordConfig(raw: Readonly<Record<string, unknown>>): DiscordConfig {
  const result = DiscordConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError("discord", `Invalid config: ${issues}`);
  }

  const parsed = result.data;

  return {
    token: parsed.token,
    intents: parsed.intents ?? DEFAULT_INTENTS,
    sweepers: toSweepersConfig(parsed.sweepers),
    presence: toPresenceConfig(parsed.presence),
  };
}
