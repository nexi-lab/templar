import { z } from "zod";
import type { SandboxConfig, SandboxExecOptions } from "./types.js";

const sandboxNetworkConfigSchema = z.object({
  allowedDomains: z.array(z.string().min(1)).min(1, {
    message: "allowedDomains must contain at least one domain",
  }),
  deniedDomains: z.array(z.string().min(1)).optional(),
  allowLocalBinding: z.boolean().optional(),
  allowUnixSockets: z.array(z.string().min(1)).optional(),
});

const sandboxFilesystemConfigSchema = z.object({
  denyRead: z.array(z.string().min(1)),
  allowWrite: z.array(z.string().min(1)),
  denyWrite: z.array(z.string().min(1)).optional(),
});

const sandboxResourceLimitsSchema = z.object({
  maxMemoryMB: z
    .number()
    .int()
    .positive({ message: "maxMemoryMB must be a positive integer" })
    .max(16_777_216, { message: "maxMemoryMB exceeds maximum of 16 TB" })
    .optional(),
  maxCPUPercent: z
    .number()
    .int()
    .min(1, { message: "maxCPUPercent must be between 1 and 100" })
    .max(100, { message: "maxCPUPercent must be between 1 and 100" })
    .optional(),
  timeoutSeconds: z
    .number()
    .int()
    .positive({ message: "timeoutSeconds must be a positive integer" })
    .optional(),
});

const sandboxConfigSchema = z.object({
  network: sandboxNetworkConfigSchema,
  filesystem: sandboxFilesystemConfigSchema,
  allowedCommands: z.array(z.string().min(1)).optional(),
  resourceLimits: sandboxResourceLimitsSchema.optional(),
  ignoreViolations: z.record(z.string(), z.array(z.string())).optional(),
});

const sandboxExecOptionsSchema = z.object({
  command: z.string().min(1, { message: "command must not be empty" }),
  args: z.array(z.string()).optional(),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
  timeoutMs: z
    .number()
    .int()
    .positive({ message: "timeoutMs must be a positive integer" })
    .optional(),
  maxOutputBytes: z
    .number()
    .int()
    .positive({ message: "maxOutputBytes must be a positive integer" })
    .optional(),
  // signal and configOverrides are validated structurally, not via Zod
});

/**
 * Validate a SandboxConfig, returning the parsed result or throwing
 * a ZodError with all validation issues.
 */
export function validateSandboxConfig(config: unknown): SandboxConfig {
  return sandboxConfigSchema.parse(config) as SandboxConfig;
}

/**
 * Validate SandboxExecOptions, returning the parsed result or throwing
 * a ZodError with all validation issues.
 */
export function validateExecOptions(
  options: unknown,
): Omit<SandboxExecOptions, "signal" | "configOverrides"> {
  return sandboxExecOptionsSchema.parse(options) as Omit<
    SandboxExecOptions,
    "signal" | "configOverrides"
  >;
}
