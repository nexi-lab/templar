/**
 * Linked Resource Resolver — fetches URLs in parallel during hydration (#59).
 *
 * Uses native `fetch()` (no deps). Each URL gets its own timeout via AbortSignal.
 */

import type { HydrationTemplateVars, ResolvedContextSource } from "@templar/core";
import type { ContextSourceResolver } from "../types.js";
import { DEFAULT_HYDRATION_CONFIG } from "../types.js";

export class LinkedResourceResolver implements ContextSourceResolver {
  readonly type = "linked_resource";

  async resolve(
    params: Record<string, unknown>,
    _vars: HydrationTemplateVars,
    signal?: AbortSignal,
  ): Promise<ResolvedContextSource> {
    const start = performance.now();
    const urls = params.urls as readonly string[];
    const maxChars = params.maxChars as number | undefined;
    const perUrlTimeoutMs =
      (params.timeoutMs as number | undefined) ??
      DEFAULT_HYDRATION_CONFIG.defaultPerSourceTimeoutMs;

    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    // Fetch all URLs in parallel
    const results = await Promise.allSettled(
      urls.map((url) => fetchWithTimeout(url, perUrlTimeoutMs, signal)),
    );

    const contents: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const settledResult = results[i]!;
      const url = urls[i]!;
      if (settledResult.status === "fulfilled") {
        contents.push(`--- ${url} ---\n${settledResult.value}`);
      } else {
        const reason =
          settledResult.reason instanceof Error
            ? settledResult.reason.message
            : String(settledResult.reason);
        console.warn(`[context-hydrator] Failed to fetch ${url}: ${reason}`);
        contents.push(`--- ${url} ---\n[Failed to fetch]`);
      }
    }

    const content = contents.join("\n\n");
    const originalChars = content.length;
    const truncated = maxChars !== undefined && originalChars > maxChars;
    const finalContent = truncated ? content.slice(0, maxChars) : content;

    return {
      type: "linked_resource",
      content: finalContent,
      originalChars,
      truncated,
      resolvedInMs: performance.now() - start,
    };
  }
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // If parent signal aborts, abort this fetch too
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}
