import { ChannelLoadError } from "@templar/errors";
import { z } from "zod";

const SocketConfig = z.object({
  mode: z.literal("socket"),
  token: z.string().min(1, "Bot token (xoxb-) is required"),
  appToken: z.string().min(1, "App-level token (xapp-) is required"),
});

export type SlackConfig = { mode: "socket"; token: string; appToken: string };

const SlackConfigSchema: z.ZodType<SlackConfig> = z.discriminatedUnion("mode", [SocketConfig]);

/**
 * Parse and validate raw config into a typed SlackConfig.
 * Throws ChannelLoadError on validation failure.
 */
export function parseSlackConfig(raw: Readonly<Record<string, unknown>>): SlackConfig {
  const result = SlackConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError("slack", `Invalid config: ${issues}`);
  }
  return result.data;
}
