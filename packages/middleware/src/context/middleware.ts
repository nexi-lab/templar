/**
 * ContextHydrator — deterministic context pre-loading middleware (#59).
 *
 * Resolves context sources in parallel via Promise.allSettled() before
 * the agent's first LLM call, implementing Stripe's "deterministic
 * pre-execution" pattern.
 */

import type {
  ContextHydrationConfig,
  ContextSourceConfig,
  HydrationMetrics,
  HydrationResult,
  HydrationTemplateVars,
  ResolvedContextSource,
  SessionContext,
  TemplarMiddleware,
} from "@templar/core";
import { HydrationSourceFailedError, HydrationTimeoutError } from "@templar/errors";
import { logWarn } from "../utils.js";
import {
  LinkedResourceResolver,
  McpToolResolver,
  MemoryQueryResolver,
  WorkspaceSnapshotResolver,
} from "./resolvers/index.js";
import type { ContextHydratorDeps, ContextSourceResolver } from "./types.js";
import { DEFAULT_HYDRATION_CONFIG } from "./types.js";

const TAG = "context-hydrator";

/**
 * ContextHydrator middleware — resolves 4 context source types in parallel
 * during onSessionStart, before the agent's first LLM call.
 */
export class ContextHydrator implements TemplarMiddleware {
  readonly name = "templar:context-hydrator";

  private readonly config: ContextHydrationConfig;
  private readonly resolvers: ReadonlyMap<string, ContextSourceResolver>;
  private cacheHash: string | undefined;

  constructor(config: ContextHydrationConfig, deps: ContextHydratorDeps) {
    this.config = config;
    this.resolvers = buildResolverMap(deps);
  }

  async onSessionStart(context: SessionContext): Promise<void> {
    const sources = this.config.sources;
    if (!sources || sources.length === 0) {
      // No sources — inject empty hydration result
      injectResult(context, {
        sources: [],
        mergedContext: "",
        metrics: {
          hydrationTimeMs: 0,
          sourcesResolved: 0,
          sourcesFailed: 0,
          contextCharsUsed: 0,
          cacheHit: false,
        },
      });
      return;
    }

    // Build template vars from SessionContext
    const vars = buildTemplateVars(context);

    // Check cache — skip re-resolution if config+vars hash is the same
    const currentHash = computeHash(this.config, vars);
    if (this.cacheHash === currentHash) {
      // Cache hit — keep existing hydrated context
      const metadata = context.metadata ?? {};
      const existingMetrics = metadata.hydrationMetrics as HydrationMetrics | undefined;
      if (existingMetrics) {
        injectResult(context, {
          sources: (metadata.hydratedSources as readonly ResolvedContextSource[]) ?? [],
          mergedContext: (metadata.hydratedContext as string) ?? "",
          metrics: { ...existingMetrics, cacheHit: true },
        });
        return;
      }
    }

    const globalTimeoutMs =
      this.config.maxHydrationTimeMs ?? DEFAULT_HYDRATION_CONFIG.maxHydrationTimeMs;
    const maxContextChars = this.config.maxContextChars ?? DEFAULT_HYDRATION_CONFIG.maxContextChars;
    const failureStrategy = this.config.failureStrategy ?? DEFAULT_HYDRATION_CONFIG.failureStrategy;

    const start = performance.now();

    // Create global AbortController
    const globalController = new AbortController();
    const globalTimer = setTimeout(() => globalController.abort(), globalTimeoutMs);

    try {
      // Map each source config to a resolver promise
      const promises = sources.map((source) =>
        resolveSource(source, this.resolvers, vars, globalController.signal, context.sessionId),
      );

      // Resolve all in parallel
      const settled = await Promise.allSettled(promises);

      const resolved: ResolvedContextSource[] = [];
      let sourcesFailed = 0;

      for (let i = 0; i < settled.length; i++) {
        const settledResult = settled[i]!;
        const sourceConfig = sources[i]!;
        if (settledResult.status === "fulfilled") {
          resolved.push(settledResult.value);
        } else {
          sourcesFailed++;
          const reason =
            settledResult.reason instanceof Error
              ? settledResult.reason.message
              : String(settledResult.reason);
          logWarn(TAG, context.sessionId, `Source "${sourceConfig.type}" failed: ${reason}`);

          if (failureStrategy === "abort") {
            throw new HydrationSourceFailedError(sourceConfig.type, reason);
          }
        }
      }

      // Apply total maxContextChars budget — truncate last-declared first
      const budgeted = applyBudget(resolved, maxContextChars);
      const mergedContext = budgeted.map((s) => s.content).join("\n\n");
      const hydrationTimeMs = performance.now() - start;

      const result: HydrationResult = {
        sources: budgeted,
        mergedContext,
        metrics: {
          hydrationTimeMs,
          sourcesResolved: budgeted.length,
          sourcesFailed,
          contextCharsUsed: mergedContext.length,
          cacheHit: false,
        },
      };

      injectResult(context, result);
      this.cacheHash = currentHash;
    } catch (error) {
      if (globalController.signal.aborted && !(error instanceof HydrationSourceFailedError)) {
        const timeoutError = new HydrationTimeoutError(globalTimeoutMs);
        if (failureStrategy === "abort") {
          throw timeoutError;
        }
        logWarn(TAG, context.sessionId, `Global timeout (${globalTimeoutMs}ms) exceeded`);
        injectResult(context, {
          sources: [],
          mergedContext: "",
          metrics: {
            hydrationTimeMs: performance.now() - start,
            sourcesResolved: 0,
            sourcesFailed: sources.length,
            contextCharsUsed: 0,
            cacheHit: false,
          },
        });
      } else {
        throw error;
      }
    } finally {
      clearTimeout(globalTimer);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildResolverMap(deps: ContextHydratorDeps): ReadonlyMap<string, ContextSourceResolver> {
  const map = new Map<string, ContextSourceResolver>();

  if (deps.toolExecutor) {
    const resolver = new McpToolResolver(deps.toolExecutor);
    map.set("mcp_tool", resolver);
  }
  if (deps.nexus) {
    map.set("memory_query", new MemoryQueryResolver(deps.nexus));
    map.set("workspace_snapshot", new WorkspaceSnapshotResolver());
  }
  // Linked resource resolver has no deps
  map.set("linked_resource", new LinkedResourceResolver());

  return map;
}

async function resolveSource(
  source: ContextSourceConfig,
  resolvers: ReadonlyMap<string, ContextSourceResolver>,
  vars: HydrationTemplateVars,
  signal: AbortSignal,
  sessionId: string,
): Promise<ResolvedContextSource> {
  const resolver = resolvers.get(source.type);
  if (!resolver) {
    logWarn(TAG, sessionId, `No resolver for source type "${source.type}" — skipping`);
    return {
      type: source.type,
      content: "",
      originalChars: 0,
      truncated: false,
      resolvedInMs: 0,
    };
  }

  const perSourceTimeoutMs = source.timeoutMs ?? DEFAULT_HYDRATION_CONFIG.defaultPerSourceTimeoutMs;

  // Per-source timeout via AbortController
  const sourceController = new AbortController();
  const timer = setTimeout(() => sourceController.abort(), perSourceTimeoutMs);

  // Also abort if global signal fires
  const onGlobalAbort = () => sourceController.abort();
  signal.addEventListener("abort", onGlobalAbort, { once: true });

  try {
    // Race the resolver against a timeout promise to ensure we don't hang
    // if the underlying implementation doesn't honor AbortSignal.
    const result = await Promise.race([
      resolver.resolve(source as unknown as Record<string, unknown>, vars, sourceController.signal),
      new Promise<never>((_resolve, reject) => {
        setTimeout(
          () =>
            reject(new Error(`Source "${source.type}" timed out after ${perSourceTimeoutMs}ms`)),
          perSourceTimeoutMs,
        );
      }),
    ]);
    return result;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onGlobalAbort);
  }
}

function buildTemplateVars(context: SessionContext): HydrationTemplateVars {
  const metadata = context.metadata ?? {};
  return {
    ...(context.agentId ? { agent: { id: context.agentId } } : {}),
    ...(context.userId ? { user: { id: context.userId } } : {}),
    ...(context.sessionId ? { session: { id: context.sessionId } } : {}),
    ...(metadata.taskDescription || metadata.taskId
      ? {
          task: {
            ...(typeof metadata.taskDescription === "string"
              ? { description: metadata.taskDescription }
              : {}),
            ...(typeof metadata.taskId === "string" ? { id: metadata.taskId } : {}),
          },
        }
      : {}),
    ...(typeof metadata.workspaceRoot === "string"
      ? { workspace: { root: metadata.workspaceRoot } }
      : {}),
  };
}

function computeHash(config: ContextHydrationConfig, vars: HydrationTemplateVars): string {
  return JSON.stringify({ config, vars });
}

/**
 * Inject hydration result into session context metadata.
 */
function injectResult(context: SessionContext, result: HydrationResult): void {
  const metadata = context.metadata ?? {};
  context.metadata = {
    ...metadata,
    hydratedContext: result.mergedContext,
    hydratedSources: result.sources,
    hydrationMetrics: result.metrics,
  };
}

/**
 * Apply total character budget. Truncate sources from last to first
 * (last-declared = lowest priority).
 */
function applyBudget(
  sources: readonly ResolvedContextSource[],
  maxChars: number,
): readonly ResolvedContextSource[] {
  let totalChars = sources.reduce((sum, s) => sum + s.content.length, 0);

  if (totalChars <= maxChars) {
    return sources;
  }

  // Clone into mutable array for budget enforcement
  const result: ResolvedContextSource[] = sources.map((s) => ({
    type: s.type,
    content: s.content,
    originalChars: s.originalChars,
    truncated: s.truncated,
    resolvedInMs: s.resolvedInMs,
  }));

  // Truncate from last to first
  for (let i = result.length - 1; i >= 0 && totalChars > maxChars; i--) {
    const excess = totalChars - maxChars;
    const source = result[i]!;
    if (source.content.length <= excess) {
      totalChars -= source.content.length;
      result[i] = {
        type: source.type,
        content: "",
        originalChars: source.originalChars,
        truncated: true,
        resolvedInMs: source.resolvedInMs,
      };
    } else {
      const newLength = source.content.length - excess;
      totalChars -= excess;
      result[i] = {
        type: source.type,
        content: source.content.slice(0, newLength),
        originalChars: source.originalChars,
        truncated: true,
        resolvedInMs: source.resolvedInMs,
      };
    }
  }

  return result;
}
