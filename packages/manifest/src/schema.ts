/**
 * Zod schema for AgentManifest — validates parsed YAML against the
 * AgentManifest type from @templar/core.
 */

import { CONVERSATION_SCOPES, type AgentManifest } from "@templar/core";
import { parseExpression } from "cron-parser";
import { z } from "zod";

export const ModelConfigSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const ToolConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.record(z.unknown()).optional(),
});

export const ChannelConfigSchema = z.object({
  type: z.string().min(1),
  config: z.record(z.unknown()),
});

export const MiddlewareConfigSchema = z.object({
  name: z.string().min(1),
  config: z.record(z.unknown()).optional(),
});

export const PermissionConfigSchema = z.object({
  allowed: z.array(z.string().min(1)).nonempty(),
  denied: z.array(z.string().min(1)).optional(),
});

const HTTPS_URL_PATTERN = /^https:\/\/[a-zA-Z0-9][\w.-]+\.[a-zA-Z]{2,}/;
/** Allows ./foo, ../foo, /foo — no double-dot segments after the initial prefix */
const RELATIVE_PATH_PATTERN = /^\.{0,2}\/(?!.*\.\.)[\w.\-/]+$/;
const isUrlOrRelativePath = (val: string) =>
  HTTPS_URL_PATTERN.test(val) || RELATIVE_PATH_PATTERN.test(val);

export const ChannelIdentityConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z
    .string()
    .refine(isUrlOrRelativePath, {
      message: "Must be a URL (https://...) or relative path (./...)",
    })
    .optional(),
  bio: z.string().max(500).optional(),
  systemPromptPrefix: z.string().max(10_000).optional(),
});

export const IdentityConfigSchema = z.object({
  default: ChannelIdentityConfigSchema.optional(),
  channels: z.record(z.string(), ChannelIdentityConfigSchema).optional(),
});

export const ScheduleSchema = z
  .string()
  .min(1)
  .refine(
    (expr) => {
      try {
        parseExpression(expr);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Invalid cron expression" },
  );

export const PromptSchema = z.string().min(1).max(10_000);

/**
 * Skill reference validation (agentskills.io name format):
 * - 1-64 chars, lowercase alphanumeric + hyphens
 * - No leading/trailing hyphens, no consecutive hyphens
 */
export const SkillRefSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(
    /^[a-z0-9](?:[a-z0-9]|-(?!-))*[a-z0-9]$|^[a-z0-9]$/,
    "Skill name must be lowercase alphanumeric with hyphens, no leading/trailing/consecutive hyphens",
  );

export const BootstrapBudgetSchema = z.object({
  instructions: z.number().int().min(100).max(50_000).optional(),
  tools: z.number().int().min(100).max(50_000).optional(),
  context: z.number().int().min(100).max(50_000).optional(),
});

/** Relative path without ".." traversal segments or absolute prefixes */
const SAFE_BOOTSTRAP_PATH = /^(?!\/)(?!.*\.\.\/)[\w.\-/]+$/;
const bootstrapPathRefine = (v: string) => SAFE_BOOTSTRAP_PATH.test(v);
const bootstrapPathMessage = {
  message: "Must be a relative path without '..' segments",
};

export const BootstrapPathConfigSchema = z.object({
  instructions: z.string().min(1).refine(bootstrapPathRefine, bootstrapPathMessage).optional(),
  tools: z.string().min(1).refine(bootstrapPathRefine, bootstrapPathMessage).optional(),
  context: z.string().min(1).refine(bootstrapPathRefine, bootstrapPathMessage).optional(),
  budget: BootstrapBudgetSchema.optional(),
});

/**
 * Conversation isolation modes — canonical source: @templar/core.
 */
export const SessionScopingSchema = z.enum(CONVERSATION_SCOPES);

export const AgentManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must follow semver (e.g. "1.0.0")'),
  description: z.string().min(1),
  model: ModelConfigSchema.optional(),
  tools: z.array(ToolConfigSchema).optional(),
  channels: z.array(ChannelConfigSchema).optional(),
  middleware: z.array(MiddlewareConfigSchema).optional(),
  permissions: PermissionConfigSchema.optional(),
  identity: IdentityConfigSchema.optional(),
  schedule: ScheduleSchema.optional(),
  prompt: PromptSchema.optional(),
  skills: z.array(SkillRefSchema).optional(),
  bootstrap: BootstrapPathConfigSchema.optional(),
  sessionScoping: SessionScopingSchema.optional(),
});

/**
 * Compile-time assertion: every required key in AgentManifest is present
 * in the Zod-inferred type. We use keyof comparison because
 * `exactOptionalPropertyTypes` makes direct `extends` fail (Zod produces
 * `T | undefined` for optional fields while the interface only allows absent keys).
 */
type _Inferred = z.infer<typeof AgentManifestSchema>;
type _KeyCheck = keyof _Inferred extends keyof AgentManifest ? true : never;
type _ReverseKeyCheck = keyof AgentManifest extends keyof _Inferred ? true : never;
const _assertKeys: _KeyCheck & _ReverseKeyCheck = true;
void _assertKeys;
