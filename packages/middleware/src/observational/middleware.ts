/**
 * ObservationalMemoryMiddleware — implements the Observer + Reflector pattern (#154).
 *
 * Two background processes watch an agent's conversation:
 * - Observer: extracts key observations every N turns (decisions, preferences, tool results)
 * - Reflector: synthesizes observations into higher-level insights every M turns
 *
 * Observations and reflections are stored to Nexus Memory API and injected
 * into agent context for continuity across turns and sessions.
 *
 * Lifecycle:
 * 1. Session start → parallel load past observations + reflections from Nexus
 * 2. Before each turn → inject observations + reflections into context
 * 3. After each turn → buffer turn summary, trigger observer/reflector at intervals
 * 4. Session end → final extraction + reflection, flush remaining observations
 *
 * Wrap hooks:
 * - wrapModelCall → inject observation summary into system prompt
 * - wrapToolCall → capture tool call results for observation extraction
 *
 * All Nexus API calls use `safeNexusCall` for graceful degradation.
 * Observation extraction is async (fire-and-forget) to avoid blocking the agent.
 */

import type { NexusClient, StoreMemoryParams } from "@nexus/sdk";
import type {
  ModelHandler,
  ModelRequest,
  ModelResponse,
  SessionContext,
  TemplarMiddleware,
  ToolHandler,
  ToolRequest,
  ToolResponse,
  TurnContext,
} from "@templar/core";
import { ObservationalConfigurationError } from "@templar/errors";
import { safeNexusCall } from "../utils.js";
import type {
  Observation,
  ObservationalMemoryConfig,
  ObservationExtractor,
  ObservationReflector,
  Reflection,
  ResolvedObservationalConfig,
  TurnSummary,
} from "./types.js";
import { DEFAULT_OBSERVATIONAL_CONFIG, DEFAULT_OBSERVATIONAL_FEATURE_FLAGS } from "./types.js";

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/**
 * Validate observational memory middleware configuration.
 * @throws {ObservationalConfigurationError} if config is invalid
 */
export function validateObservationalConfig(config: ObservationalMemoryConfig): void {
  const errors: string[] = [];

  if (
    config.observerInterval !== undefined &&
    (!Number.isFinite(config.observerInterval) || config.observerInterval < 1)
  ) {
    errors.push(`observerInterval must be >= 1, got ${config.observerInterval}`);
  }

  if (
    config.maxObservations !== undefined &&
    (!Number.isFinite(config.maxObservations) ||
      config.maxObservations < 1 ||
      config.maxObservations > 10000)
  ) {
    errors.push(`maxObservations must be 1–10000, got ${config.maxObservations}`);
  }

  if (
    config.maxObserverCalls !== undefined &&
    (!Number.isFinite(config.maxObserverCalls) || config.maxObserverCalls < 1)
  ) {
    errors.push(`maxObserverCalls must be >= 1, got ${config.maxObserverCalls}`);
  }

  if (
    config.observerTimeoutMs !== undefined &&
    (!Number.isFinite(config.observerTimeoutMs) || config.observerTimeoutMs < 0)
  ) {
    errors.push(`observerTimeoutMs must be >= 0, got ${config.observerTimeoutMs}`);
  }

  if (
    config.reflectorInterval !== undefined &&
    (!Number.isFinite(config.reflectorInterval) || config.reflectorInterval < 1)
  ) {
    errors.push(`reflectorInterval must be >= 1, got ${config.reflectorInterval}`);
  }

  if (
    config.reflectorTimeoutMs !== undefined &&
    (!Number.isFinite(config.reflectorTimeoutMs) || config.reflectorTimeoutMs < 0)
  ) {
    errors.push(`reflectorTimeoutMs must be >= 0, got ${config.reflectorTimeoutMs}`);
  }

  if (
    config.sessionStartTimeoutMs !== undefined &&
    (!Number.isFinite(config.sessionStartTimeoutMs) || config.sessionStartTimeoutMs < 0)
  ) {
    errors.push(`sessionStartTimeoutMs must be >= 0, got ${config.sessionStartTimeoutMs}`);
  }

  if (
    config.maxLoadedObservations !== undefined &&
    (!Number.isFinite(config.maxLoadedObservations) ||
      config.maxLoadedObservations < 0 ||
      config.maxLoadedObservations > 1000)
  ) {
    errors.push(`maxLoadedObservations must be 0–1000, got ${config.maxLoadedObservations}`);
  }

  if (
    config.maxLoadedReflections !== undefined &&
    (!Number.isFinite(config.maxLoadedReflections) ||
      config.maxLoadedReflections < 0 ||
      config.maxLoadedReflections > 100)
  ) {
    errors.push(`maxLoadedReflections must be 0–100, got ${config.maxLoadedReflections}`);
  }

  if (
    config.storeTimeoutMs !== undefined &&
    (!Number.isFinite(config.storeTimeoutMs) || config.storeTimeoutMs < 0)
  ) {
    errors.push(`storeTimeoutMs must be >= 0, got ${config.storeTimeoutMs}`);
  }

  if (errors.length > 0) {
    throw new ObservationalConfigurationError(errors);
  }
}

// ---------------------------------------------------------------------------
// Resolve config with defaults
// ---------------------------------------------------------------------------

function resolveConfig(config: ObservationalMemoryConfig): ResolvedObservationalConfig {
  return {
    enabled: {
      ...DEFAULT_OBSERVATIONAL_FEATURE_FLAGS,
      ...config.enabled,
    },
    observerInterval: config.observerInterval ?? DEFAULT_OBSERVATIONAL_CONFIG.observerInterval,
    maxObservations: config.maxObservations ?? DEFAULT_OBSERVATIONAL_CONFIG.maxObservations,
    maxObserverCalls: config.maxObserverCalls ?? DEFAULT_OBSERVATIONAL_CONFIG.maxObserverCalls,
    observerTimeoutMs: config.observerTimeoutMs ?? DEFAULT_OBSERVATIONAL_CONFIG.observerTimeoutMs,
    reflectorInterval: config.reflectorInterval ?? DEFAULT_OBSERVATIONAL_CONFIG.reflectorInterval,
    reflectorTimeoutMs:
      config.reflectorTimeoutMs ?? DEFAULT_OBSERVATIONAL_CONFIG.reflectorTimeoutMs,
    scope: config.scope ?? DEFAULT_OBSERVATIONAL_CONFIG.scope,
    namespace: config.namespace ?? DEFAULT_OBSERVATIONAL_CONFIG.namespace,
    sessionStartTimeoutMs:
      config.sessionStartTimeoutMs ?? DEFAULT_OBSERVATIONAL_CONFIG.sessionStartTimeoutMs,
    maxLoadedObservations:
      config.maxLoadedObservations ?? DEFAULT_OBSERVATIONAL_CONFIG.maxLoadedObservations,
    maxLoadedReflections:
      config.maxLoadedReflections ?? DEFAULT_OBSERVATIONAL_CONFIG.maxLoadedReflections,
    storeTimeoutMs: config.storeTimeoutMs ?? DEFAULT_OBSERVATIONAL_CONFIG.storeTimeoutMs,
  };
}

// ---------------------------------------------------------------------------
// Middleware implementation
// ---------------------------------------------------------------------------

/**
 * ObservationalMemoryMiddleware — observational memory with Observer + Reflector.
 *
 * Feature flags allow granular opt-in. All Nexus API calls use `safeNexusCall`
 * for graceful degradation — observational memory failures never interrupt
 * the main LLM chain.
 */
export class ObservationalMemoryMiddleware implements TemplarMiddleware {
  readonly name = "observational-memory";

  private readonly client: NexusClient;
  private readonly config: ResolvedObservationalConfig;
  private readonly extractor: ObservationExtractor;
  private readonly reflector: ObservationReflector | undefined;

  // Per-session state — reassigned (not mutated) per immutability principle
  // Note: one instance per session (matches ACE middleware pattern)
  private observations: readonly Observation[] = [];
  private reflections: readonly Reflection[] = [];
  private turnBuffer: readonly TurnSummary[] = [];
  private pendingToolCalls: readonly { readonly name: string; readonly result: string }[] = [];
  private turnCount = 0;
  private observerCallCount = 0;
  private agentId = "";

  constructor(
    client: NexusClient,
    extractor: ObservationExtractor,
    config: ObservationalMemoryConfig = {},
    reflector?: ObservationReflector,
  ) {
    validateObservationalConfig(config);
    this.client = client;
    this.config = resolveConfig(config);
    this.extractor = extractor;
    this.reflector = reflector;
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(context: SessionContext): Promise<void> {
    // Reset per-session state
    this.observations = [];
    this.reflections = [];
    this.turnBuffer = [];
    this.pendingToolCalls = [];
    this.turnCount = 0;
    this.observerCallCount = 0;
    this.agentId = context.agentId ?? "";

    const label = `observational:${context.sessionId}`;

    // Parallel load past observations + reflections from Nexus
    const [loadedObservations, loadedReflections] = await Promise.all([
      this.config.enabled.observer
        ? safeNexusCall(() => this.loadRecentObservations(context), {
            timeout: this.config.sessionStartTimeoutMs,
            fallback: [] as readonly Observation[],
            label: `${label}:load-observations`,
          })
        : ([] as readonly Observation[]),

      this.config.enabled.reflector
        ? safeNexusCall(() => this.loadReflections(context), {
            timeout: this.config.sessionStartTimeoutMs,
            fallback: [] as readonly Reflection[],
            label: `${label}:load-reflections`,
          })
        : ([] as readonly Reflection[]),
    ]);

    this.observations = loadedObservations;
    this.reflections = loadedReflections;
  }

  async onBeforeTurn(context: TurnContext): Promise<void> {
    // Inject observations + reflections into turn metadata
    if (!this.config.enabled.contextInjection) {
      return;
    }

    if (this.observations.length > 0 || this.reflections.length > 0) {
      const metadata = context.metadata ?? {};
      context.metadata = {
        ...metadata,
        ...(this.observations.length > 0 ? { observations: this.observations } : {}),
        ...(this.reflections.length > 0 ? { reflections: this.reflections } : {}),
      };
    }
  }

  async onAfterTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    // Buffer turn summary
    const toolCalls =
      this.pendingToolCalls.length > 0 ? ([...this.pendingToolCalls] as const) : undefined;
    const summary = {
      turnNumber: context.turnNumber,
      input:
        typeof context.input === "string" ? context.input : JSON.stringify(context.input ?? ""),
      output:
        typeof context.output === "string" ? context.output : JSON.stringify(context.output ?? ""),
      timestamp: new Date().toISOString(),
      ...(toolCalls !== undefined ? { toolCalls } : {}),
    } satisfies TurnSummary;
    this.turnBuffer = [...this.turnBuffer, summary];
    this.pendingToolCalls = [];

    // Observer: extract observations every N turns (async, fire-and-forget)
    const shouldObserve =
      this.config.enabled.observer &&
      this.turnCount % this.config.observerInterval === 0 &&
      this.observerCallCount < this.config.maxObserverCalls;

    // Reflector: synthesize reflections every M turns (async, fire-and-forget)
    const shouldReflect =
      this.config.enabled.reflector &&
      this.reflector !== undefined &&
      this.turnCount % this.config.reflectorInterval === 0;

    if (shouldObserve) {
      this.observerCallCount += 1;
      const observerPromise = this.extractAndStoreObservations(context.sessionId);

      if (shouldReflect) {
        // Chain: observer → reflector so reflections see fresh observations
        void observerPromise.then(() => this.synthesizeAndStoreReflections(context.sessionId));
      } else {
        void observerPromise;
      }
    } else if (shouldReflect) {
      void this.synthesizeAndStoreReflections(context.sessionId);
    }
  }

  async onSessionEnd(context: SessionContext): Promise<void> {
    // Final observation extraction (if any buffered turns remain)
    if (this.turnBuffer.length > 0 && this.config.enabled.observer) {
      await this.extractAndStoreObservations(context.sessionId);
    }

    // Final reflection (if enabled and observations exist)
    if (
      this.config.enabled.reflector &&
      this.reflector !== undefined &&
      this.observations.length > 0
    ) {
      await this.synthesizeAndStoreReflections(context.sessionId);
    }
  }

  // ---------------------------------------------------------------------------
  // Wrap Hooks
  // ---------------------------------------------------------------------------

  async wrapModelCall(req: ModelRequest, next: ModelHandler): Promise<ModelResponse> {
    // Inject observation summary into system prompt
    const enrichedReq =
      this.config.enabled.contextInjection && this.observations.length > 0
        ? {
            ...req,
            systemPrompt: this.buildEnrichedPrompt(req.systemPrompt),
          }
        : req;

    return next(enrichedReq);
  }

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    const response = await next(req);

    // Capture tool call result for observation extraction
    const resultStr =
      typeof response.output === "string"
        ? response.output.slice(0, 200)
        : JSON.stringify(response.output).slice(0, 200);

    this.pendingToolCalls = [...this.pendingToolCalls, { name: req.toolName, result: resultStr }];

    return response;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Extract observations from buffered turns and store to Nexus.
   * Clears the turn buffer on success, retains on failure.
   */
  private async extractAndStoreObservations(sessionId: string): Promise<void> {
    const label = `observational:${sessionId}:extract`;
    const turnsToProcess = [...this.turnBuffer];

    if (turnsToProcess.length === 0) {
      return;
    }

    // Extract observations via the pluggable extractor
    const newObservations = await safeNexusCall(
      () =>
        this.extractor.extract(turnsToProcess, {
          sessionId,
          agentId: this.agentId,
          existingObservations: this.observations,
        }),
      {
        timeout: this.config.observerTimeoutMs,
        fallback: [] as readonly Observation[],
        label,
      },
    );

    if (newObservations.length === 0) {
      // Clear buffer even if no observations extracted (turns were processed)
      this.turnBuffer = [];
      return;
    }

    // Append new observations and trim to rolling window (immutable)
    const allObservations = [...this.observations, ...newObservations];
    this.observations =
      allObservations.length > this.config.maxObservations
        ? allObservations.slice(allObservations.length - this.config.maxObservations)
        : allObservations;

    // Clear turn buffer (turns were processed)
    this.turnBuffer = [];

    // Store to Nexus via batchStore (fire-and-forget for mid-session)
    const storeParams: StoreMemoryParams[] = newObservations.map((obs) => ({
      content: obs.content,
      scope: this.config.scope as "agent" | "user" | "zone" | "global" | "session",
      memory_type: "observation",
      namespace: this.config.namespace,
      importance: obs.priority === "critical" ? 0.9 : obs.priority === "important" ? 0.7 : 0.4,
      metadata: {
        priority: obs.priority,
        sourceType: obs.sourceType,
        turnNumbers: obs.turnNumbers,
        sessionId,
      },
    }));

    void safeNexusCall(() => this.client.memory.batchStore({ memories: storeParams }), {
      timeout: this.config.storeTimeoutMs,
      fallback: undefined,
      label: `${label}:store`,
    });
  }

  /**
   * Synthesize reflections from current observations and store to Nexus.
   */
  private async synthesizeAndStoreReflections(sessionId: string): Promise<void> {
    if (this.reflector === undefined || this.observations.length === 0) {
      return;
    }

    const label = `observational:${sessionId}:reflect`;

    const newReflections = await safeNexusCall(
      () =>
        // biome-ignore lint/style/noNonNullAssertion: guarded by undefined check above
        this.reflector!.reflect({
          observations: this.observations,
          sessionId,
          agentId: this.agentId,
        }),
      {
        timeout: this.config.reflectorTimeoutMs,
        fallback: [] as readonly Reflection[],
        label,
      },
    );

    if (newReflections.length === 0) {
      return;
    }

    // Append reflections and cap at maxLoadedReflections * 2 (immutable)
    const maxReflections = this.config.maxLoadedReflections * 2;
    const allReflections = [...this.reflections, ...newReflections];
    this.reflections =
      allReflections.length > maxReflections
        ? allReflections.slice(allReflections.length - maxReflections)
        : allReflections;

    // Store to Nexus
    const storeParams: StoreMemoryParams[] = newReflections.map((ref) => ({
      content: ref.insight,
      scope: this.config.scope as "agent" | "user" | "zone" | "global" | "session",
      memory_type: "reflection",
      namespace: this.config.namespace,
      importance: 0.8,
      metadata: {
        sourceObservationCount: ref.sourceObservationCount,
        sessionId,
      },
    }));

    void safeNexusCall(() => this.client.memory.batchStore({ memories: storeParams }), {
      timeout: this.config.storeTimeoutMs,
      fallback: undefined,
      label: `${label}:store`,
    });
  }

  /**
   * Load recent observations from Nexus Memory API.
   */
  private async loadRecentObservations(_context: SessionContext): Promise<readonly Observation[]> {
    const result = await this.client.memory.query({
      memory_type: "observation",
      scope: this.config.scope,
      namespace: this.config.namespace,
      limit: this.config.maxLoadedObservations,
      state: "active",
    });

    // Nexus API returns metadata on entries but the SDK type omits it
    type EntryWithMeta = (typeof result.results)[number] & {
      metadata?: Record<string, unknown>;
    };
    return result.results.map((raw) => {
      const entry = raw as EntryWithMeta;
      return {
        timestamp: entry.created_at ?? new Date().toISOString(),
        priority: (entry.metadata?.priority as Observation["priority"]) ?? "informational",
        content: typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content),
        sourceType: (entry.metadata?.sourceType as Observation["sourceType"]) ?? "turn",
        turnNumbers: (entry.metadata?.turnNumbers as readonly number[]) ?? [],
      };
    });
  }

  /**
   * Load reflections from Nexus Memory API.
   */
  private async loadReflections(_context: SessionContext): Promise<readonly Reflection[]> {
    const result = await this.client.memory.query({
      memory_type: "reflection",
      scope: this.config.scope,
      namespace: this.config.namespace,
      limit: this.config.maxLoadedReflections,
      state: "active",
    });

    // Nexus API returns metadata on entries but the SDK type omits it
    type EntryWithMeta = (typeof result.results)[number] & {
      metadata?: Record<string, unknown>;
    };
    return result.results.map((raw) => {
      const entry = raw as EntryWithMeta;
      return {
        timestamp: entry.created_at ?? new Date().toISOString(),
        insight: typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content),
        sourceObservationCount: (entry.metadata?.sourceObservationCount as number) ?? 0,
      };
    });
  }

  /**
   * Build an enriched system prompt with observation summary.
   */
  private buildEnrichedPrompt(existingPrompt?: string): string {
    if (this.observations.length === 0) {
      return existingPrompt ?? "";
    }

    // Include most recent observations (max 20 for prompt size)
    const recentObservations = this.observations.slice(-20);

    const observationBlock = recentObservations
      .map((obs) => `- [${obs.priority.toUpperCase()}] ${obs.content}`)
      .join("\n");

    const reflectionBlock =
      this.reflections.length > 0
        ? `\n\n--- Key Insights ---\n${this.reflections.map((r) => `- ${r.insight}`).join("\n")}\n--- End Insights ---`
        : "";

    const injection = `\n\n--- Conversation Observations ---\n${observationBlock}\n--- End Observations ---${reflectionBlock}`;

    return (existingPrompt ?? "") + injection;
  }
}
