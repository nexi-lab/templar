/**
 * Zod schema for AgentManifest — validates parsed YAML against the
 * AgentManifest type from @templar/core.
 */

import type { AgentManifest } from "@templar/core";
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

export const AgentManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'Must follow semver (e.g. "1.0.0")'),
  description: z.string().min(1),
  model: ModelConfigSchema.optional(),
  tools: z.array(ToolConfigSchema).optional(),
  channels: z.array(ChannelConfigSchema).optional(),
  middleware: z.array(MiddlewareConfigSchema).optional(),
  permissions: PermissionConfigSchema.optional(),
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
