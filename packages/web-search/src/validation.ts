/**
 * Zod schemas for configuration and options validation.
 */

import { z } from "zod";

export const SearchOptionsSchema = z.object({
  maxResults: z.number().int().min(1).max(100).optional(),
  timeRange: z.enum(["day", "week", "month", "year"]).optional(),
  language: z.string().min(1).optional(),
  includeDomains: z.array(z.string().min(1)).optional(),
  excludeDomains: z.array(z.string().min(1)).optional(),
});

export const SearchProviderConfigSchema = z.object({
  provider: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});

export const WebSearchRouterConfigSchema = z.object({
  providers: z.array(SearchProviderConfigSchema).min(1),
  defaultOptions: SearchOptionsSchema.optional(),
  maxSnippetLength: z.number().int().min(50).max(5000).optional(),
});

export const WebSearchMiddlewareConfigSchema = WebSearchRouterConfigSchema.and(
  z.object({
    toolName: z.string().min(1).optional(),
  }),
);

/**
 * Validate that a query is non-empty after trimming.
 * @returns Trimmed query string, or empty string if invalid.
 */
export function validateQuery(query: unknown): string {
  if (typeof query !== "string" || query.trim().length === 0) {
    return "";
  }
  return query.trim();
}
