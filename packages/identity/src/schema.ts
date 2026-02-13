import { z } from "zod";

/**
 * Zod schema for a single channel's identity config.
 * Loose constraints — platform-specific limits belong in channel adapters.
 */
export const ChannelIdentityConfigSchema = z
  .object({
    name: z.string().max(80, "name must be at most 80 characters").optional(),
    avatar: z
      .string()
      .url("avatar must be a valid URL")
      .refine((url) => /^https?:\/\//i.test(url), "avatar must use http or https protocol")
      .optional(),
    bio: z.string().max(512, "bio must be at most 512 characters").optional(),
    systemPromptPrefix: z
      .string()
      .max(4096, "systemPromptPrefix must be at most 4096 characters")
      .optional(),
  })
  .strict();

/**
 * Zod schema for the top-level identity config with 2-level cascade.
 */
export const IdentityConfigSchema = z
  .object({
    default: ChannelIdentityConfigSchema.optional(),
    channels: z.record(z.string(), ChannelIdentityConfigSchema).optional(),
  })
  .strict();

export type ValidatedIdentityConfig = z.infer<typeof IdentityConfigSchema>;
export type ValidatedChannelIdentityConfig = z.infer<typeof ChannelIdentityConfigSchema>;
