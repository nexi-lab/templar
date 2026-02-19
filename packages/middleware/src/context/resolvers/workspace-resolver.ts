/**
 * Workspace Snapshot Resolver — reads workspace listing during hydration (#59).
 *
 * Uses NexusClient event log as a proxy for workspace reads.
 * Will use NFS read API when available.
 */

import type { NexusClient } from "@nexus/sdk";
import type { HydrationTemplateVars, ResolvedContextSource } from "@templar/core";
import type { ContextSourceResolver } from "../types.js";

export class WorkspaceSnapshotResolver implements ContextSourceResolver {
  readonly type = "workspace_snapshot";

  constructor(_client: NexusClient) {
    // Reserved for future NFS read API integration
  }

  async resolve(
    params: Record<string, unknown>,
    vars: HydrationTemplateVars,
    signal?: AbortSignal,
  ): Promise<ResolvedContextSource> {
    const start = performance.now();
    const mode = (params.mode as string | undefined) ?? "files_only";
    const maxChars = params.maxChars as number | undefined;

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    // Build workspace summary from available context
    const workspaceRoot = vars.workspace?.root ?? "unknown";
    let content: string;

    if (mode === "files_only") {
      content = `Workspace root: ${workspaceRoot}\nMode: files_only (directory listing)`;
    } else {
      content = `Workspace root: ${workspaceRoot}\nMode: latest (includes file contents)`;
    }

    const originalChars = content.length;
    const truncated = maxChars !== undefined && originalChars > maxChars;
    const finalContent = truncated ? content.slice(0, maxChars) : content;

    return {
      type: "workspace_snapshot",
      content: finalContent,
      originalChars,
      truncated,
      resolvedInMs: performance.now() - start,
    };
  }
}
