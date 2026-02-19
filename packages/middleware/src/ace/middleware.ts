/**
 * NexusAceMiddleware — Adaptive Context Engine integration for Templar agents.
 *
 * Integrates playbooks, trajectory tracking, reflection, curation, and feedback
 * via the Nexus ACE API. All features are opt-in via feature flags.
 *
 * Lifecycle:
 * 1. Session start → parallel load playbook strategies + curated memories, start trajectory
 * 2. Before each turn → inject strategies + curated memories into context
 * 3. After each turn → buffer trajectory step, flush on interval
 * 4. Session end → flush buffer, complete trajectory, trigger reflection
 *
 * Wrap hooks:
 * - wrapModelCall → inject strategies into system prompt, record model call step
 * - wrapToolCall → record tool call step, track feedback signals
 */

import type { LogStepParams, MemoryEntry, NexusClient, PlaybookStrategy } from "@nexus/sdk";
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
import { AceConfigurationError } from "@templar/errors";
import { safeNexusCall } from "../utils.js";
import {
  DEFAULT_ACE_CONFIG,
  DEFAULT_FEATURE_FLAGS,
  type NexusAceConfig,
  type ResolvedAceConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/**
 * Validate ACE middleware configuration.
 * @throws {AceConfigurationError} if config is invalid
 */
export function validateAceConfig(config: NexusAceConfig): void {
  const errors: string[] = [];

  if (
    config.maxStrategiesInjected !== undefined &&
    (!Number.isFinite(config.maxStrategiesInjected) ||
      config.maxStrategiesInjected < 1 ||
      config.maxStrategiesInjected > 100)
  ) {
    errors.push(`maxStrategiesInjected must be 1–100, got ${config.maxStrategiesInjected}`);
  }

  if (
    config.minStrategyConfidence !== undefined &&
    (!Number.isFinite(config.minStrategyConfidence) ||
      config.minStrategyConfidence < 0 ||
      config.minStrategyConfidence > 1)
  ) {
    errors.push(`minStrategyConfidence must be 0–1, got ${config.minStrategyConfidence}`);
  }

  if (
    config.playbookLoadTimeoutMs !== undefined &&
    (!Number.isFinite(config.playbookLoadTimeoutMs) || config.playbookLoadTimeoutMs < 0)
  ) {
    errors.push(`playbookLoadTimeoutMs must be >= 0, got ${config.playbookLoadTimeoutMs}`);
  }

  if (
    config.stepBufferSize !== undefined &&
    (!Number.isFinite(config.stepBufferSize) || config.stepBufferSize < 1)
  ) {
    errors.push(`stepBufferSize must be >= 1, got ${config.stepBufferSize}`);
  }

  if (
    config.stepFlushTimeoutMs !== undefined &&
    (!Number.isFinite(config.stepFlushTimeoutMs) || config.stepFlushTimeoutMs < 0)
  ) {
    errors.push(`stepFlushTimeoutMs must be >= 0, got ${config.stepFlushTimeoutMs}`);
  }

  if (
    config.reflectionMode !== undefined &&
    !["sync", "async", "deferred"].includes(config.reflectionMode)
  ) {
    errors.push(
      `reflectionMode must be "sync", "async", or "deferred", got "${config.reflectionMode}"`,
    );
  }

  if (
    config.reflectionTimeoutMs !== undefined &&
    (!Number.isFinite(config.reflectionTimeoutMs) || config.reflectionTimeoutMs < 0)
  ) {
    errors.push(`reflectionTimeoutMs must be >= 0, got ${config.reflectionTimeoutMs}`);
  }

  if (
    config.curationQueryTimeoutMs !== undefined &&
    (!Number.isFinite(config.curationQueryTimeoutMs) || config.curationQueryTimeoutMs < 0)
  ) {
    errors.push(`curationQueryTimeoutMs must be >= 0, got ${config.curationQueryTimeoutMs}`);
  }

  if (
    config.maxCuratedMemories !== undefined &&
    (!Number.isFinite(config.maxCuratedMemories) ||
      config.maxCuratedMemories < 0 ||
      config.maxCuratedMemories > 100)
  ) {
    errors.push(`maxCuratedMemories must be 0–100, got ${config.maxCuratedMemories}`);
  }

  if (errors.length > 0) {
    throw new AceConfigurationError(errors);
  }
}

// ---------------------------------------------------------------------------
// Resolve config with defaults
// ---------------------------------------------------------------------------

function resolveConfig(config: NexusAceConfig): ResolvedAceConfig {
  return {
    enabled: {
      ...DEFAULT_FEATURE_FLAGS,
      ...config.enabled,
    },
    maxStrategiesInjected: config.maxStrategiesInjected ?? DEFAULT_ACE_CONFIG.maxStrategiesInjected,
    minStrategyConfidence: config.minStrategyConfidence ?? DEFAULT_ACE_CONFIG.minStrategyConfidence,
    playbookScope: config.playbookScope ?? DEFAULT_ACE_CONFIG.playbookScope,
    playbookLoadTimeoutMs: config.playbookLoadTimeoutMs ?? DEFAULT_ACE_CONFIG.playbookLoadTimeoutMs,
    stepBufferSize: config.stepBufferSize ?? DEFAULT_ACE_CONFIG.stepBufferSize,
    stepFlushTimeoutMs: config.stepFlushTimeoutMs ?? DEFAULT_ACE_CONFIG.stepFlushTimeoutMs,
    reflectionMode: config.reflectionMode ?? DEFAULT_ACE_CONFIG.reflectionMode,
    reflectionTimeoutMs: config.reflectionTimeoutMs ?? DEFAULT_ACE_CONFIG.reflectionTimeoutMs,
    curationQueryTimeoutMs:
      config.curationQueryTimeoutMs ?? DEFAULT_ACE_CONFIG.curationQueryTimeoutMs,
    maxCuratedMemories: config.maxCuratedMemories ?? DEFAULT_ACE_CONFIG.maxCuratedMemories,
    taskType: config.taskType ?? DEFAULT_ACE_CONFIG.taskType,
  };
}

// ---------------------------------------------------------------------------
// Middleware implementation
// ---------------------------------------------------------------------------

/**
 * NexusAceMiddleware — integrates Templar agents with the Nexus ACE subsystem.
 *
 * Feature flags allow granular opt-in per session. All Nexus API calls use
 * `safeNexusCall` for timeout + graceful degradation — ACE failures never
 * interrupt the main LLM chain.
 */
export class NexusAceMiddleware implements TemplarMiddleware {
  readonly name = "nexus-ace";

  private readonly client: NexusClient;
  private readonly config: ResolvedAceConfig;

  // Per-session state — reassigned (not mutated) per immutability principle
  private trajectoryId: string | undefined = undefined;
  private stepBuffer: readonly Omit<LogStepParams, "trajectory_id">[] = [];
  private loadedStrategies: readonly PlaybookStrategy[] = [];
  private curatedMemories: readonly MemoryEntry[] = [];
  private turnCount = 0;

  constructor(client: NexusClient, config: NexusAceConfig = {}) {
    validateAceConfig(config);
    this.client = client;
    this.config = resolveConfig(config);
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(context: SessionContext): Promise<void> {
    // Reset per-session state
    this.trajectoryId = undefined;
    this.stepBuffer = [];
    this.loadedStrategies = [];
    this.curatedMemories = [];
    this.turnCount = 0;

    const label = `nexus-ace:${context.sessionId}`;

    // Parallel load: playbook strategies + curated memories (Decision 4B)
    const [strategies, curated] = await Promise.all([
      this.config.enabled.playbooks
        ? safeNexusCall(() => this.loadPlaybookStrategies(context), {
            timeout: this.config.playbookLoadTimeoutMs,
            fallback: [] as readonly PlaybookStrategy[],
            label: `${label}:playbooks`,
          })
        : ([] as readonly PlaybookStrategy[]),

      this.config.enabled.curation
        ? safeNexusCall(() => this.loadCuratedMemories(context), {
            timeout: this.config.curationQueryTimeoutMs,
            fallback: [] as readonly MemoryEntry[],
            label: `${label}:curation`,
          })
        : ([] as readonly MemoryEntry[]),
    ]);

    this.loadedStrategies = strategies;
    this.curatedMemories = curated;

    // Start trajectory (if enabled)
    if (this.config.enabled.trajectory) {
      const result = await safeNexusCall(
        () =>
          this.client.ace.trajectories.start({
            task_description:
              (context.metadata?.taskDescription as string) ?? `Session ${context.sessionId}`,
            task_type: this.config.taskType,
            metadata: {
              agent_id: context.agentId,
              user_id: context.userId,
              scope: context.scope,
            },
          }),
        {
          timeout: this.config.stepFlushTimeoutMs,
          fallback: undefined,
          label: `${label}:trajectory-start`,
        },
      );
      this.trajectoryId = result?.trajectory_id;
    }
  }

  async onBeforeTurn(context: TurnContext): Promise<void> {
    // Inject playbook strategies + curated memories into turn metadata
    if (this.loadedStrategies.length > 0 || this.curatedMemories.length > 0) {
      const metadata = context.metadata ?? {};
      context.metadata = {
        ...metadata,
        ...(this.loadedStrategies.length > 0 ? { aceStrategies: this.loadedStrategies } : {}),
        ...(this.curatedMemories.length > 0 ? { aceCuratedMemories: this.curatedMemories } : {}),
      };
    }
  }

  async onAfterTurn(context: TurnContext): Promise<void> {
    this.turnCount += 1;

    // Buffer trajectory step (Decision 13A)
    if (this.config.enabled.trajectory && this.trajectoryId !== undefined) {
      const step: Omit<LogStepParams, "trajectory_id"> = {
        step_type: "observation",
        description: `Turn ${context.turnNumber}`,
        result: context.output,
        metadata: {
          input_preview:
            typeof context.input === "string" ? context.input.slice(0, 200) : undefined,
        },
      };

      this.stepBuffer = [...this.stepBuffer, step];

      // Flush if buffer is full
      if (this.stepBuffer.length >= this.config.stepBufferSize) {
        await this.flushStepBuffer(context.sessionId);
      }
    }
  }

  async onSessionEnd(context: SessionContext): Promise<void> {
    const label = `nexus-ace:${context.sessionId}`;

    // Flush remaining buffered steps
    if (this.stepBuffer.length > 0) {
      await this.flushStepBuffer(context.sessionId);
    }

    // Complete trajectory
    const trajectoryId = this.trajectoryId;
    if (this.config.enabled.trajectory && trajectoryId !== undefined) {
      const status =
        (context.metadata?.trajectoryStatus as
          | "success"
          | "failure"
          | "partial"
          | "cancelled"
          | undefined) ?? "success";

      await safeNexusCall(
        () =>
          this.client.ace.trajectories.complete({
            trajectory_id: trajectoryId,
            status,
            metrics: { turn_count: this.turnCount },
          }),
        {
          timeout: this.config.stepFlushTimeoutMs,
          fallback: undefined,
          label: `${label}:trajectory-complete`,
        },
      );
    }

    // Trigger reflection (Decision 15A — fire-and-forget by default)
    if (this.config.enabled.reflection && trajectoryId !== undefined) {
      const reflectionFn = () =>
        this.client.ace.reflection.reflect({
          trajectory_id: trajectoryId,
        });

      if (this.config.reflectionMode === "sync") {
        await safeNexusCall(reflectionFn, {
          timeout: this.config.reflectionTimeoutMs,
          fallback: undefined,
          label: `${label}:reflection`,
        });
      } else if (this.config.reflectionMode === "async") {
        // Fire-and-forget — don't await, don't block session teardown
        void safeNexusCall(reflectionFn, {
          timeout: this.config.reflectionTimeoutMs,
          fallback: undefined,
          label: `${label}:reflection`,
        });
      }
      // "deferred" mode: no-op here, handled externally by the caller
    }
  }

  // ---------------------------------------------------------------------------
  // Wrap Hooks (Decision 2A)
  // ---------------------------------------------------------------------------

  async wrapModelCall(req: ModelRequest, next: ModelHandler): Promise<ModelResponse> {
    // Inject playbook strategies into system prompt (Decision 14A)
    const enrichedReq =
      this.loadedStrategies.length > 0
        ? {
            ...req,
            systemPrompt: this.buildEnrichedSystemPrompt(req.systemPrompt),
          }
        : req;

    const response = await next(enrichedReq);

    // Buffer trajectory step for model call
    if (this.config.enabled.trajectory && this.trajectoryId !== undefined) {
      const step: Omit<LogStepParams, "trajectory_id"> = {
        step_type: "action",
        description: `Model call: ${req.model ?? "default"}`,
        result: {
          usage: response.usage,
          content_length: response.content.length,
        },
        metadata: {
          model: response.model ?? req.model,
        },
      };
      this.stepBuffer = [...this.stepBuffer, step];
    }

    return response;
  }

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    const response = await next(req);

    // Buffer trajectory step for tool call
    if (this.config.enabled.trajectory && this.trajectoryId !== undefined) {
      const step: Omit<LogStepParams, "trajectory_id"> = {
        step_type: "tool_call",
        description: `Tool: ${req.toolName}`,
        result: {
          output_preview:
            typeof response.output === "string"
              ? response.output.slice(0, 200)
              : typeof response.output,
        },
        ...(req.metadata !== undefined ? { metadata: req.metadata } : {}),
      };
      this.stepBuffer = [...this.stepBuffer, step];
    }

    return response;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Load playbook strategies from the Nexus ACE API.
   * Filters by confidence threshold and limits to maxStrategiesInjected.
   */
  private async loadPlaybookStrategies(
    _context: SessionContext,
  ): Promise<readonly PlaybookStrategy[]> {
    const result = await this.client.ace.playbooks.query({
      scope: this.config.playbookScope as "agent" | "user" | "zone" | "global",
      limit: this.config.maxStrategiesInjected,
    });

    // Flatten all strategies from all playbooks, filter by confidence
    const allStrategies = result.playbooks.flatMap((pb) => pb.strategies);

    return allStrategies
      .filter((s) => s.confidence >= this.config.minStrategyConfidence)
      .slice(0, this.config.maxStrategiesInjected);
  }

  /**
   * Load curated memories from the Nexus Memory API.
   */
  private async loadCuratedMemories(context: SessionContext): Promise<readonly MemoryEntry[]> {
    const result = await this.client.memory.search({
      query: (context.metadata?.taskDescription as string) ?? "",
      scope: (context.scope ?? "agent") as "agent" | "user" | "zone" | "global" | "session",
      limit: this.config.maxCuratedMemories,
    });

    return result.results;
  }

  /**
   * Flush buffered trajectory steps to the Nexus ACE API.
   * On failure, retains buffer for next attempt.
   */
  private async flushStepBuffer(sessionId: string): Promise<void> {
    const trajectoryId = this.trajectoryId;
    if (trajectoryId === undefined || this.stepBuffer.length === 0) {
      return;
    }

    const toFlush = [...this.stepBuffer];
    const label = `nexus-ace:${sessionId}:step-flush`;

    // Log each step (the API takes one step at a time)
    // safeNexusCall returns undefined on failure, so we check resolved values
    const results = await Promise.all(
      toFlush.map((step) =>
        safeNexusCall(
          () =>
            this.client.ace.trajectories.logStep({
              trajectory_id: trajectoryId,
              ...step,
            }),
          {
            timeout: this.config.stepFlushTimeoutMs,
            fallback: undefined,
            label,
          },
        ),
      ),
    );

    // Only clear buffer if all steps were logged successfully
    const failedCount = results.filter((r) => r === undefined).length;
    if (failedCount === 0) {
      this.stepBuffer = [];
    } else {
      console.warn(
        `[${label}] Partial flush: ${failedCount}/${toFlush.length} steps failed, retained for retry`,
      );
    }
  }

  /**
   * Build an enriched system prompt with injected playbook strategies.
   * Appends strategies as a structured section at the end of the existing prompt.
   */
  private buildEnrichedSystemPrompt(existingPrompt?: string): string {
    if (this.loadedStrategies.length === 0) {
      return existingPrompt ?? "";
    }

    const strategiesBlock = this.loadedStrategies
      .map((s, i) => `${i + 1}. ${s.description} (confidence: ${s.confidence.toFixed(2)})`)
      .join("\n");

    const injection = `\n\n--- Playbook Strategies ---\n${strategiesBlock}\n--- End Strategies ---`;

    return (existingPrompt ?? "") + injection;
  }
}
