/**
 * CrystallizerMiddleware — tool pattern crystallization (#164)
 *
 * Observes agent tool usage patterns across sessions and auto-creates
 * reusable composite tool artifacts when patterns repeat. Inspired by
 * VOYAGER (skill library), OpenClaw Foundry, and Agentic Plan Caching.
 *
 * Lifecycle:
 * 1. Session start → parallel load historical sequences + existing artifacts
 *    from Nexus, validate artifacts (lazy)
 * 2. wrapToolCall → record tool call success/failure with timing
 * 3. Session end → store sequence to Memory API, run PrefixSpan,
 *    create artifacts for novel patterns above threshold
 *
 * All Nexus API calls use `safeNexusCall` for graceful degradation.
 */

import type { Artifact, ArtifactMetadata, CreateToolArtifactParams, NexusClient } from "@nexus/sdk";
import type {
  SessionContext,
  TemplarMiddleware,
  ToolHandler,
  ToolRequest,
  ToolResponse,
  TurnContext,
} from "@templar/core";
import { CrystallizerConfigurationError } from "@templar/errors";
import { safeNexusCall } from "../utils.js";
import { calculatePatternSuccessRate, mineFrequentSequences } from "./pattern-mining.js";
import type {
  CrystallizerConfig,
  ResolvedCrystallizerConfig,
  SessionSequence,
  ToolCallRecord,
} from "./types.js";
import { DEFAULT_CRYSTALLIZER_CONFIG, DEFAULT_CRYSTALLIZER_FEATURE_FLAGS } from "./types.js";

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

/**
 * Validate crystallizer middleware configuration.
 * @throws {CrystallizerConfigurationError} if config is invalid
 */
// TODO(#DRY): extract shared validation helpers across middleware configs
export function validateCrystallizerConfig(config: CrystallizerConfig): void {
  const errors: string[] = [];

  if (config.minUses !== undefined && (!Number.isFinite(config.minUses) || config.minUses < 1)) {
    errors.push(`minUses must be >= 1, got ${config.minUses}`);
  }

  if (
    config.minSuccessRate !== undefined &&
    (!Number.isFinite(config.minSuccessRate) ||
      config.minSuccessRate < 0 ||
      config.minSuccessRate > 1)
  ) {
    errors.push(`minSuccessRate must be 0–1, got ${config.minSuccessRate}`);
  }

  if (
    config.minPatternLength !== undefined &&
    (!Number.isFinite(config.minPatternLength) || config.minPatternLength < 1)
  ) {
    errors.push(`minPatternLength must be >= 1, got ${config.minPatternLength}`);
  }

  if (
    config.maxPatternLength !== undefined &&
    config.minPatternLength !== undefined &&
    config.maxPatternLength < config.minPatternLength
  ) {
    errors.push(
      `maxPatternLength (${config.maxPatternLength}) must be >= minPatternLength (${config.minPatternLength})`,
    );
  }

  if (
    config.maxPatternLength !== undefined &&
    (!Number.isFinite(config.maxPatternLength) || config.maxPatternLength < 1)
  ) {
    errors.push(`maxPatternLength must be >= 1, got ${config.maxPatternLength}`);
  }

  if (
    config.maxLoadedSequences !== undefined &&
    (!Number.isFinite(config.maxLoadedSequences) ||
      config.maxLoadedSequences < 0 ||
      config.maxLoadedSequences > 10000)
  ) {
    errors.push(`maxLoadedSequences must be 0–10000, got ${config.maxLoadedSequences}`);
  }

  if (
    config.sessionStartTimeoutMs !== undefined &&
    (!Number.isFinite(config.sessionStartTimeoutMs) || config.sessionStartTimeoutMs < 0)
  ) {
    errors.push(`sessionStartTimeoutMs must be >= 0, got ${config.sessionStartTimeoutMs}`);
  }

  if (
    config.storeTimeoutMs !== undefined &&
    (!Number.isFinite(config.storeTimeoutMs) || config.storeTimeoutMs < 0)
  ) {
    errors.push(`storeTimeoutMs must be >= 0, got ${config.storeTimeoutMs}`);
  }

  if (errors.length > 0) {
    throw new CrystallizerConfigurationError(errors);
  }
}

// ---------------------------------------------------------------------------
// Resolve config with defaults
// ---------------------------------------------------------------------------

function resolveConfig(config: CrystallizerConfig): ResolvedCrystallizerConfig {
  return {
    enabled: {
      ...DEFAULT_CRYSTALLIZER_FEATURE_FLAGS,
      ...config.enabled,
    },
    minUses: config.minUses ?? DEFAULT_CRYSTALLIZER_CONFIG.minUses,
    minSuccessRate: config.minSuccessRate ?? DEFAULT_CRYSTALLIZER_CONFIG.minSuccessRate,
    minPatternLength: config.minPatternLength ?? DEFAULT_CRYSTALLIZER_CONFIG.minPatternLength,
    maxPatternLength: config.maxPatternLength ?? DEFAULT_CRYSTALLIZER_CONFIG.maxPatternLength,
    autoApprove: config.autoApprove ?? DEFAULT_CRYSTALLIZER_CONFIG.autoApprove,
    maxLoadedSequences: config.maxLoadedSequences ?? DEFAULT_CRYSTALLIZER_CONFIG.maxLoadedSequences,
    scope: config.scope ?? DEFAULT_CRYSTALLIZER_CONFIG.scope,
    namespace: config.namespace ?? DEFAULT_CRYSTALLIZER_CONFIG.namespace,
    sessionStartTimeoutMs:
      config.sessionStartTimeoutMs ?? DEFAULT_CRYSTALLIZER_CONFIG.sessionStartTimeoutMs,
    storeTimeoutMs: config.storeTimeoutMs ?? DEFAULT_CRYSTALLIZER_CONFIG.storeTimeoutMs,
    tags: config.tags ?? DEFAULT_CRYSTALLIZER_CONFIG.tags,
  };
}

// ---------------------------------------------------------------------------
// Middleware implementation
// ---------------------------------------------------------------------------

/**
 * CrystallizerMiddleware — observes tool patterns and creates composite artifacts.
 *
 * Feature flags allow granular opt-in. All Nexus API calls use `safeNexusCall`
 * for graceful degradation — crystallizer failures never interrupt the main
 * agent execution chain.
 */
export class CrystallizerMiddleware implements TemplarMiddleware {
  readonly name = "crystallizer";

  private readonly client: NexusClient;
  private readonly config: ResolvedCrystallizerConfig;

  // Per-session state — reassigned (not mutated) per immutability principle
  private toolCallRecords: readonly ToolCallRecord[] = [];
  private historicalSequences: readonly SessionSequence[] = [];
  private existingArtifactNames: ReadonlySet<string> = new Set();
  private turnCount = 0;
  private agentId = "";
  private sessionId = "";

  constructor(client: NexusClient, config: CrystallizerConfig = {}) {
    validateCrystallizerConfig(config);
    this.client = client;
    this.config = resolveConfig(config);
  }

  // ---------------------------------------------------------------------------
  // Session Lifecycle
  // ---------------------------------------------------------------------------

  async onSessionStart(context: SessionContext): Promise<void> {
    // Reset per-session state
    this.toolCallRecords = [];
    this.historicalSequences = [];
    this.existingArtifactNames = new Set();
    this.turnCount = 0;
    this.agentId = context.agentId ?? "";
    this.sessionId = context.sessionId;

    const label = `crystallizer:${context.sessionId}`;

    // Parallel load historical sequences + existing artifacts
    const [sequences, artifacts] = await Promise.all([
      this.config.enabled.mining
        ? safeNexusCall(() => this.loadHistoricalSequences(), {
            timeout: this.config.sessionStartTimeoutMs,
            fallback: [] as readonly SessionSequence[],
            label: `${label}:load-sequences`,
          })
        : ([] as readonly SessionSequence[]),

      this.config.enabled.validation
        ? safeNexusCall(() => this.loadExistingArtifacts(), {
            timeout: this.config.sessionStartTimeoutMs,
            fallback: [] as readonly ArtifactMetadata[],
            label: `${label}:load-artifacts`,
          })
        : ([] as readonly ArtifactMetadata[]),
    ]);

    this.historicalSequences = sequences;
    this.existingArtifactNames = new Set(artifacts.map((a) => a.name));

    // Validate existing artifacts: mark stale ones as inactive
    if (this.config.enabled.validation && artifacts.length > 0) {
      await this.validateArtifacts(artifacts, context);
    }
  }

  async onBeforeTurn(_context: TurnContext): Promise<void> {
    // No-op — crystallized tools are injected via manifest, not per-turn
  }

  async onAfterTurn(_context: TurnContext): Promise<void> {
    this.turnCount += 1;
  }

  async onSessionEnd(context: SessionContext): Promise<void> {
    // 1. Build session sequence from recorded tool calls
    const sequence = this.buildSequence();
    if (sequence.sequence.length === 0) {
      return;
    }

    const label = `crystallizer:${context.sessionId}`;

    // 2. Store sequence to Nexus Memory API (one entry per session)
    if (this.config.enabled.observation) {
      await safeNexusCall(
        () =>
          this.client.memory.store({
            content: sequence as unknown as Record<string, unknown>,
            scope: this.config.scope as "agent" | "user" | "zone" | "global" | "session",
            memory_type: "tool_sequence",
            namespace: this.config.namespace,
            importance: 0.5,
            metadata: {
              sessionId: context.sessionId,
              agentId: this.agentId,
              sequenceLength: sequence.sequence.length,
            },
          }),
        {
          timeout: this.config.storeTimeoutMs,
          fallback: undefined,
          label: `${label}:store-sequence`,
        },
      );
    }

    // 3. Mine patterns and crystallize
    if (this.config.enabled.mining) {
      await this.mineAndCrystallize(context, sequence);
    }
  }

  // ---------------------------------------------------------------------------
  // Wrap Hooks
  // ---------------------------------------------------------------------------

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    if (!this.config.enabled.observation) {
      return next(req);
    }

    const start = Date.now();
    let success = true;

    try {
      const response = await next(req);

      // Check for error in response metadata
      if (response.metadata?.error) {
        success = false;
      }

      return response;
    } catch (err) {
      success = false;
      throw err;
    } finally {
      const record: ToolCallRecord = {
        toolName: req.toolName,
        success,
        durationMs: Date.now() - start,
        turnNumber: this.turnCount,
        timestamp: new Date().toISOString(),
      };

      // Immutable append
      this.toolCallRecords = [...this.toolCallRecords, record];
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Load historical sequences from Nexus Memory API */
  private async loadHistoricalSequences(): Promise<readonly SessionSequence[]> {
    const result = await this.client.memory.query({
      memory_type: "tool_sequence",
      scope: this.config.scope,
      namespace: this.config.namespace,
      limit: this.config.maxLoadedSequences,
      state: "active",
    });

    return result.results.map((entry) => {
      const content =
        typeof entry.content === "string"
          ? (JSON.parse(entry.content) as SessionSequence)
          : (entry.content as unknown as SessionSequence);
      return {
        sessionId: content.sessionId ?? "",
        sequence: content.sequence ?? [],
        successMap: content.successMap ?? {},
        timestamp: content.timestamp ?? entry.created_at ?? new Date().toISOString(),
      };
    });
  }

  /** Load existing crystallized artifacts from Nexus Artifacts API */
  private async loadExistingArtifacts(): Promise<readonly ArtifactMetadata[]> {
    const result = await this.client.artifacts.list({
      type: "tool",
      tags: ["crystallized", ...this.config.tags],
    });

    return result.data;
  }

  /** Validate loaded artifacts — mark stale ones as inactive */
  private async validateArtifacts(
    artifacts: readonly ArtifactMetadata[],
    context: SessionContext,
  ): Promise<void> {
    const label = `crystallizer:${context.sessionId}:validate`;

    for (const artifact of artifacts) {
      if (artifact.status !== "active") continue;

      // Fetch full artifact to check composition
      const full = await safeNexusCall(() => this.client.artifacts.get(artifact.id), {
        timeout: this.config.sessionStartTimeoutMs,
        fallback: undefined as unknown as Artifact,
        label: `${label}:get-${artifact.id}`,
      });

      if (!full || full.type !== "tool") continue;

      const schema = full.schema as { composition?: readonly string[] };
      if (!schema.composition || !Array.isArray(schema.composition)) continue;

      // Check if all component tools still exist by verifying they appear
      // in historical sequences (lightweight validation)
      const knownTools = new Set<string>();
      for (const seq of this.historicalSequences) {
        for (const tool of seq.sequence) {
          knownTools.add(tool);
        }
      }

      const hasStaleTools = schema.composition.some(
        (tool: string) => knownTools.size > 0 && !knownTools.has(tool),
      );

      if (hasStaleTools) {
        void safeNexusCall(
          () => this.client.artifacts.update(artifact.id, { status: "inactive" }),
          {
            timeout: this.config.storeTimeoutMs,
            fallback: undefined,
            label: `${label}:deactivate-${artifact.id}`,
          },
        );
      }
    }
  }

  /** Build a SessionSequence from the current session's tool call records */
  private buildSequence(): SessionSequence {
    const sequence = this.toolCallRecords.map((r) => r.toolName);

    const successMap: Record<string, { success: number; failure: number }> = {};
    for (const record of this.toolCallRecords) {
      const existing = successMap[record.toolName] ?? { success: 0, failure: 0 };
      successMap[record.toolName] = {
        success: existing.success + (record.success ? 1 : 0),
        failure: existing.failure + (record.success ? 0 : 1),
      };
    }

    return {
      sessionId: this.sessionId,
      sequence,
      successMap,
      timestamp: new Date().toISOString(),
    };
  }

  /** Run PrefixSpan mining and create artifacts for novel patterns */
  private async mineAndCrystallize(
    context: SessionContext,
    currentSequence: SessionSequence,
  ): Promise<void> {
    const label = `crystallizer:${context.sessionId}:mine`;

    // Combine historical + current sequence for mining
    const allSequences = [...this.historicalSequences, currentSequence];
    const allToolSequences = allSequences.map((s) => s.sequence);

    // Run PrefixSpan
    const patterns = mineFrequentSequences(
      allToolSequences,
      this.config.minUses,
      this.config.minPatternLength,
      this.config.maxPatternLength,
    );

    if (patterns.length === 0) {
      return;
    }

    // Calculate success rates and filter
    const enrichedPatterns = patterns.map((p) => ({
      ...p,
      successRate: calculatePatternSuccessRate(p.tools, allSequences),
    }));

    const qualifiedPatterns = enrichedPatterns.filter(
      (p) => p.successRate >= this.config.minSuccessRate,
    );

    if (!this.config.enabled.crystallization || qualifiedPatterns.length === 0) {
      return;
    }

    // Create artifacts for novel patterns
    for (const pattern of qualifiedPatterns) {
      const name = patternName(pattern.tools);
      const hash = patternHash(pattern.tools);

      // Deduplicate against existing artifacts
      if (this.existingArtifactNames.has(name)) {
        continue;
      }

      const params: CreateToolArtifactParams = {
        name,
        description: `Crystallized composite tool: ${pattern.tools.join(" → ")} (support: ${pattern.support}, success rate: ${(pattern.successRate * 100).toFixed(0)}%)`,
        type: "tool",
        tags: ["crystallized", ...this.config.tags],
        schema: {
          input: {},
          output: {},
          composition: [...pattern.tools],
          patternHash: hash,
          support: pattern.support,
          successRate: pattern.successRate,
        },
      };

      const created = await safeNexusCall(() => this.client.artifacts.create(params), {
        timeout: this.config.storeTimeoutMs,
        fallback: undefined as unknown as Artifact,
        label: `${label}:create-${name}`,
      });

      if (created && !this.config.autoApprove) {
        // Set to inactive if auto-approve is off
        void safeNexusCall(() => this.client.artifacts.update(created.id, { status: "inactive" }), {
          timeout: this.config.storeTimeoutMs,
          fallback: undefined,
          label: `${label}:deactivate-${created.id}`,
        });
      }

      // Track newly created to prevent duplicates within this session
      this.existingArtifactNames = new Set([...this.existingArtifactNames, name]);
    }
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/** Generate a deterministic name for a pattern */
function patternName(tools: readonly string[]): string {
  return `crystallized:${tools.join("+")}`;
}

/** Generate a deterministic hash for deduplication */
function patternHash(tools: readonly string[]): string {
  // Simple deterministic hash from tool names
  const str = tools.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `ph-${(hash >>> 0).toString(36)}`;
}
