import { ChannelLoadError } from "@templar/errors";
import { z } from "zod";

const BaseConfig = z.object({
  token: z.string().min(1, "Bot token is required"),
});

const PollingConfig = BaseConfig.extend({
  mode: z.literal("polling"),
});

const WebhookConfig = BaseConfig.extend({
  mode: z.literal("webhook"),
  webhookUrl: z.string().url("webhookUrl must be a valid URL"),
  secretToken: z.string().optional(),
});

export type TelegramConfig =
  | { mode: "polling"; token: string }
  | { mode: "webhook"; token: string; webhookUrl: string; secretToken?: string | undefined };

const TelegramConfigSchema: z.ZodType<TelegramConfig> = z.discriminatedUnion("mode", [
  PollingConfig,
  WebhookConfig,
]);

/**
 * Parse and validate raw config into a typed TelegramConfig.
 * Throws ChannelLoadError on validation failure.
 */
export function parseTelegramConfig(raw: Readonly<Record<string, unknown>>): TelegramConfig {
  const result = TelegramConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError("telegram", `Invalid config: ${issues}`);
  }
  return result.data;
}
