/**
 * MCP Tool Resolver — executes an MCP tool during context hydration (#59).
 */

import type { HydrationTemplateVars, ResolvedContextSource, ToolExecutor } from "@templar/core";
import { interpolateTemplate } from "../template.js";
import type { ContextSourceResolver } from "../types.js";

export class McpToolResolver implements ContextSourceResolver {
  readonly type = "mcp_tool";
  private readonly toolExecutor: ToolExecutor;

  constructor(toolExecutor: ToolExecutor) {
    this.toolExecutor = toolExecutor;
  }

  async resolve(
    params: Record<string, unknown>,
    vars: HydrationTemplateVars,
    signal?: AbortSignal,
  ): Promise<ResolvedContextSource> {
    const start = performance.now();
    const tool = params.tool as string;
    const rawArgs = (params.args as Record<string, string> | undefined) ?? {};
    const maxChars = params.maxChars as number | undefined;

    // Interpolate template variables in args values
    const interpolatedArgs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawArgs)) {
      interpolatedArgs[key] = interpolateTemplate(value, vars);
    }

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const result = await this.toolExecutor.execute(tool, interpolatedArgs);
    const content = typeof result === "string" ? result : JSON.stringify(result);
    const originalChars = content.length;
    const truncated = maxChars !== undefined && originalChars > maxChars;
    const finalContent = truncated ? content.slice(0, maxChars) : content;

    return {
      type: "mcp_tool",
      content: finalContent,
      originalChars,
      truncated,
      resolvedInMs: performance.now() - start,
    };
  }
}
