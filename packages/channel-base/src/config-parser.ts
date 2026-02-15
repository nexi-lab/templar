import { ChannelLoadError } from "@templar/errors";
import type { ZodType } from "zod";

/**
 * Parse and validate raw channel config using a Zod schema.
 * Throws ChannelLoadError with formatted validation issues on failure.
 */
export function parseChannelConfig<T>(
  channelName: string,
  schema: ZodType<T>,
  raw: Readonly<Record<string, unknown>>,
): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new ChannelLoadError(channelName, `Invalid config: ${issues}`);
  }
  return result.data;
}
