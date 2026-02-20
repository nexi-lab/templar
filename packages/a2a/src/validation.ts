/**
 * Zod schemas for A2A configuration and input validation.
 */

import { z } from "zod";

export const A2aAuthConfigSchema = z.object({
  type: z.enum(["apiKey", "bearer", "oauth2"]),
  credentials: z.string().min(1),
  headerName: z.string().min(1).optional(),
});

export const A2aAgentConfigSchema = z.object({
  url: z.string().url(),
  auth: A2aAuthConfigSchema.optional(),
});

export const A2aClientConfigSchema = z.object({
  discoveryTimeoutMs: z.number().int().min(1_000).max(60_000).optional(),
  taskTimeoutMs: z.number().int().min(5_000).max(3_600_000).optional(),
  pollIntervalMs: z.number().int().min(500).max(60_000).optional(),
  pollMaxIntervalMs: z.number().int().min(1_000).max(300_000).optional(),
  cacheTtlMs: z.number().int().min(0).max(3_600_000).optional(),
  cacheMaxEntries: z.number().int().min(1).max(10_000).optional(),
});

export const A2aMiddlewareConfigSchema = A2aClientConfigSchema.and(
  z.object({
    agents: z.array(A2aAgentConfigSchema).optional(),
    toolPrefix: z.string().min(1).optional(),
  }),
);

/**
 * Validate and normalize an agent URL.
 * Ensures it starts with http:// or https:// and strips trailing slashes.
 */
export function normalizeAgentUrl(url: unknown): string {
  if (typeof url !== "string" || url.trim().length === 0) {
    return "";
  }
  let normalized = url.trim();
  // Strip trailing slashes
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  // Enforce http/https scheme
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    return "";
  }
  return normalized;
}

/**
 * Validate that a message string is non-empty after trimming.
 */
export function validateMessage(message: unknown): string {
  if (typeof message !== "string" || message.trim().length === 0) {
    return "";
  }
  return message.trim();
}
