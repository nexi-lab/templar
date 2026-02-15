import { z } from "zod";

/**
 * Zod schema for ACP server configuration.
 *
 * All fields have sensible defaults for stdio-based single-session usage.
 */
export const ACPConfigSchema = z.object({
  /** Transport type (default: "stdio"). */
  transport: z.enum(["stdio"]).default("stdio"),

  /** Agent display name shown to the IDE. */
  agentName: z.string().min(1).default("Templar Agent"),

  /** Agent display version. */
  agentVersion: z.string().default("0.0.0"),

  /** Maximum concurrent sessions (default: 1 for stdio, higher for HTTP). */
  maxSessions: z.number().int().positive().default(1),

  /** Whether to accept image content in prompts. */
  acceptImages: z.boolean().default(false),

  /** Whether to accept audio content in prompts. */
  acceptAudio: z.boolean().default(false),

  /** Whether to accept embedded resources in prompts. */
  acceptResources: z.boolean().default(true),

  /** Whether the agent supports loading previous sessions. */
  supportLoadSession: z.boolean().default(false),
});

/** Validated ACP configuration. */
export type ACPConfig = z.infer<typeof ACPConfigSchema>;

/**
 * Parse and validate raw config into a typed ACPConfig.
 * Throws ZodError if validation fails.
 */
export function parseACPConfig(raw: Readonly<Record<string, unknown>>): ACPConfig {
  return ACPConfigSchema.parse(raw);
}
