/**
 * WebSearchMiddleware — wrapToolCall integration for the agent pipeline.
 */

import type { TemplarMiddleware, ToolHandler, ToolRequest, ToolResponse } from "@templar/core";
import { WebSearchRouter } from "./router.js";
import type { SearchOptions, WebSearchMiddlewareConfig } from "./types.js";
import { DEFAULT_TOOL_NAME } from "./types.js";
import { WebSearchMiddlewareConfigSchema } from "./validation.js";

/**
 * Build SearchOptions from raw tool input without mutating the input.
 */
function buildSearchOptions(input: Record<string, unknown> | undefined): SearchOptions {
  const opts: Record<string, unknown> = {};
  if (typeof input?.maxResults === "number") opts.maxResults = input.maxResults;
  if (typeof input?.timeRange === "string") opts.timeRange = input.timeRange;
  if (typeof input?.language === "string") opts.language = input.language;
  if (Array.isArray(input?.includeDomains)) opts.includeDomains = input.includeDomains;
  if (Array.isArray(input?.excludeDomains)) opts.excludeDomains = input.excludeDomains;
  return opts as SearchOptions;
}

export class WebSearchMiddleware implements TemplarMiddleware {
  readonly name = "web-search";
  private readonly router: WebSearchRouter;
  private readonly toolName: string;

  constructor(config: WebSearchMiddlewareConfig) {
    this.router = new WebSearchRouter(config);
    this.toolName = config.toolName ?? DEFAULT_TOOL_NAME;
  }

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    if (req.toolName !== this.toolName) {
      return next(req);
    }

    const input = req.input as Record<string, unknown> | undefined;
    const query = typeof input?.query === "string" ? input.query : "";
    const options = buildSearchOptions(input);
    const results = await this.router.search(query, options);

    return {
      output: results,
      metadata: {
        provider: "web-search",
        resultCount: results.length,
      },
    };
  }
}

/**
 * Factory — creates a validated WebSearchMiddleware.
 */
export function createWebSearchMiddleware(config: WebSearchMiddlewareConfig): WebSearchMiddleware {
  WebSearchMiddlewareConfigSchema.parse(config);
  return new WebSearchMiddleware(config);
}
