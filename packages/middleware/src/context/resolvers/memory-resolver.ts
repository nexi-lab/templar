/**
 * Memory Query Resolver — searches Nexus Memory API during context hydration (#59).
 */

import type { NexusClient } from "@nexus/sdk";
import type { HydrationTemplateVars, ResolvedContextSource } from "@templar/core";
import { interpolateTemplate } from "../template.js";
import type { ContextSourceResolver } from "../types.js";

export class MemoryQueryResolver implements ContextSourceResolver {
  readonly type = "memory_query";
  private readonly client: NexusClient;

  constructor(client: NexusClient) {
    this.client = client;
  }

  async resolve(
    params: Record<string, unknown>,
    vars: HydrationTemplateVars,
    signal?: AbortSignal,
  ): Promise<ResolvedContextSource> {
    const start = performance.now();
    const query = interpolateTemplate(params.query as string, vars);
    const limit = (params.limit as number | undefined) ?? 5;
    const maxChars = params.maxChars as number | undefined;

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const response = await this.client.memory.search({
      query,
      limit,
    });

    const entries = response.results ?? [];
    const content = entries
      .map((entry) =>
        typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content),
      )
      .join("\n\n");

    const originalChars = content.length;
    const truncated = maxChars !== undefined && originalChars > maxChars;
    const finalContent = truncated ? content.slice(0, maxChars) : content;

    return {
      type: "memory_query",
      content: finalContent,
      originalChars,
      truncated,
      resolvedInMs: performance.now() - start,
    };
  }
}
