/**
 * Zod-based configuration validation for MCP server connections.
 * Discriminated union on the `transport` field.
 */

import { McpConnectionFailedError } from "@templar/errors";
import { z } from "zod";
import type { McpHttpConfig, McpServerConfig, McpStdioConfig } from "../transport/types.js";

const McpStdioConfigSchema = z.object({
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

const McpHttpConfigSchema = z.object({
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export const McpServerConfigSchema = z.discriminatedUnion("transport", [
  McpStdioConfigSchema,
  McpHttpConfigSchema,
]);

/**
 * Parse and validate a raw config object into a typed McpServerConfig.
 * Throws McpConnectionFailedError on validation failure.
 */
export function parseMcpConfig(raw: Readonly<Record<string, unknown>>): McpServerConfig {
  const result = McpServerConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new McpConnectionFailedError("unknown", `Invalid MCP config: ${issues}`);
  }
  return result.data as McpServerConfig;
}

export type { McpStdioConfig, McpHttpConfig, McpServerConfig };
