/**
 * ArtifactMiddleware — session-scoped artifact integration for Templar agents.
 *
 * Provides:
 * - Lazy pre-load: fires discover() in background at session start (non-blocking)
 * - Session-scoped artifact cache: loaded artifacts cached for session duration
 * - Session-scoped search cache: search results cached by query string
 * - Tool interception: handles create_artifact and search_artifacts via wrapToolCall
 *
 * @example
 * ```typescript
 * import { ArtifactMiddleware } from '@templar/artifact-client/middleware';
 *
 * const middleware = new ArtifactMiddleware(artifactClient);
 * // Register with engine: config.middleware = [...config.middleware, middleware];
 * ```
 */

import type { Artifact, ArtifactMetadata, SearchArtifactsParams } from "@nexus/sdk";
import type {
  SessionContext,
  TemplarMiddleware,
  ToolHandler,
  ToolRequest,
  ToolResponse,
} from "@templar/core";
import type { ArtifactClient } from "../client.js";
import { type ArtifactToolSet, createArtifactTools } from "../tools/index.js";

/** Artifact tool names that this middleware intercepts */
const ARTIFACT_TOOL_NAMES = new Set(["create_artifact", "search_artifacts"]);

/** Maximum cached artifacts per session (prevents unbounded growth) */
const MAX_ARTIFACT_CACHE = 200;

/** Maximum cached search results per session */
const MAX_SEARCH_CACHE = 50;

/**
 * Build a deterministic cache key from search parameters.
 * Includes query, type, tags (sorted), and limit to avoid incorrect cache hits.
 */
function buildSearchCacheKey(params: SearchArtifactsParams): string {
  const parts: string[] = [params.query];
  if (params.type) parts.push(`t:${params.type}`);
  if (params.tags) parts.push(`g:${[...params.tags].sort().join(",")}`);
  if (params.limit) parts.push(`l:${params.limit}`);
  return parts.join("|");
}

/**
 * ArtifactMiddleware integrates artifact operations into the agent lifecycle.
 *
 * - onSessionStart: Fires non-blocking discover() to pre-load artifact metadata
 * - onSessionEnd: Clears session-scoped caches
 * - wrapToolCall: Intercepts artifact tool calls and routes to ArtifactClient
 */
export class ArtifactMiddleware implements TemplarMiddleware {
  readonly name = "artifact";

  private readonly client: ArtifactClient;
  private readonly toolSet: ArtifactToolSet;

  /** Lazy pre-load promise — fires at session start, resolved on first access */
  private preloadPromise: Promise<readonly ArtifactMetadata[]> | null = null;

  /** Session-scoped cache for loaded artifacts (by ID) */
  private artifactCache: Map<string, Artifact> = new Map();

  /** Session-scoped cache for search results (by query string) */
  private searchCache: Map<string, readonly { artifact: ArtifactMetadata; score: number }[]> =
    new Map();

  constructor(client: ArtifactClient) {
    this.client = client;
    this.toolSet = createArtifactTools(client);
  }

  /**
   * Fire artifact discovery in the background (non-blocking).
   *
   * The pre-load promise is stored and awaited only when the agent
   * first needs artifact data (e.g., calls search_artifacts).
   */
  async onSessionStart(_context: SessionContext): Promise<void> {
    // Fire and forget — don't await. Store the promise for later.
    this.preloadPromise = this.client.discover().catch((): readonly ArtifactMetadata[] => []);
  }

  /**
   * Clear all session-scoped caches.
   */
  async onSessionEnd(_context: SessionContext): Promise<void> {
    this.preloadPromise = null;
    this.artifactCache = new Map();
    this.searchCache = new Map();
  }

  /**
   * Intercept artifact tool calls and route to ArtifactClient.
   * Non-artifact tool calls are passed through to the next handler.
   */
  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    if (!ARTIFACT_TOOL_NAMES.has(req.toolName)) {
      return next(req);
    }

    const input = (req.input ?? {}) as Record<string, unknown>;
    const result = await this.toolSet.execute(req.toolName, input);

    return { output: result };
  }

  // ---------------------------------------------------------------------------
  // Public API for engine integration
  // ---------------------------------------------------------------------------

  /**
   * Get pre-loaded artifact metadata. Awaits the lazy pre-load if still pending.
   * Returns empty array if pre-load hasn't started or failed.
   */
  async getPreloadedMetadata(): Promise<readonly ArtifactMetadata[]> {
    if (!this.preloadPromise) return [];
    return this.preloadPromise;
  }

  /**
   * Load an artifact by ID with session-scoped caching.
   * First call for an ID hits ArtifactClient; subsequent calls return cached.
   * Cache is bounded to MAX_ARTIFACT_CACHE entries (FIFO eviction).
   */
  async loadArtifact(id: string): Promise<Artifact | undefined> {
    const cached = this.artifactCache.get(id);
    if (cached) return cached;

    const artifact = await this.client.load(id);
    if (artifact) {
      if (this.artifactCache.size >= MAX_ARTIFACT_CACHE) {
        const firstKey = this.artifactCache.keys().next().value;
        if (firstKey !== undefined) this.artifactCache.delete(firstKey);
      }
      this.artifactCache.set(id, artifact);
    }
    return artifact;
  }

  /**
   * Search artifacts with session-scoped result caching.
   * Cache key includes query, type, tags, and limit for correctness.
   * Cache is bounded to MAX_SEARCH_CACHE entries (FIFO eviction).
   */
  async searchArtifacts(
    params: SearchArtifactsParams,
  ): Promise<readonly { artifact: ArtifactMetadata; score: number }[]> {
    const cacheKey = buildSearchCacheKey(params);
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const results = await this.client.search(params);
    if (this.searchCache.size >= MAX_SEARCH_CACHE) {
      const firstKey = this.searchCache.keys().next().value;
      if (firstKey !== undefined) this.searchCache.delete(firstKey);
    }
    this.searchCache.set(cacheKey, results);
    return results;
  }

  /**
   * Get the tool definitions for engine registration.
   */
  get tools() {
    return this.toolSet.tools;
  }
}
