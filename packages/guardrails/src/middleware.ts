import type {
  ModelHandler,
  ModelRequest,
  ModelResponse,
  TemplarMiddleware,
  ToolHandler,
  ToolRequest,
  ToolResponse,
  TurnContext,
} from "@templar/core";
import { GuardrailSchemaError } from "@templar/errors";
import { resolveGuardrailsConfig } from "./config.js";
import { PACKAGE_NAME } from "./constants.js";
import { SchemaGuard } from "./guards/schema-guard.js";
import { buildFeedbackMessage, RetryExecutor } from "./retry.js";
import { GuardRunner } from "./runner.js";
import type {
  AggregatedGuardResult,
  Guard,
  GuardContext,
  GuardIssue,
  GuardrailsConfig,
  ResolvedGuardrailsConfig,
  ValidationMetrics,
} from "./types.js";

/**
 * Creates a Templar middleware that validates LLM outputs against guards.
 */
export function createGuardrailsMiddleware(config: GuardrailsConfig): TemplarMiddleware {
  const resolved = resolveGuardrailsConfig(config);
  return new GuardrailsMiddleware(resolved);
}

class GuardrailsMiddleware implements TemplarMiddleware {
  readonly name = PACKAGE_NAME;
  private readonly config: ResolvedGuardrailsConfig;

  constructor(config: ResolvedGuardrailsConfig) {
    this.config = config;
  }

  async wrapModelCall(req: ModelRequest, next: ModelHandler): Promise<ModelResponse> {
    if (!this.config.validateModelCalls) {
      return next(req);
    }

    const guards = this.resolveGuards(req.metadata);
    if (guards.length === 0) {
      return next(req);
    }

    const runner = new GuardRunner(
      guards,
      this.config.executionStrategy,
      this.config.validationTimeoutMs,
    );

    const executor = new RetryExecutor<ModelRequest, ModelResponse>({
      maxRetries: this.config.maxRetries,
      onFailure: this.config.onFailure,
      ...(this.config.onWarning ? { onWarning: this.config.onWarning } : {}),
    });

    const { response, metrics } = await executor.execute(
      req,
      next,
      (res, attempt, previousIssues) =>
        this.validateResponse(runner, "model", req, res, attempt, previousIssues),
      injectModelFeedback,
      "model",
    );

    return attachMetrics(response, metrics);
  }

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    if (!this.config.validateToolCalls) {
      return next(req);
    }

    const guards = this.resolveGuards(req.metadata);
    if (guards.length === 0) {
      return next(req);
    }

    const runner = new GuardRunner(
      guards,
      this.config.executionStrategy,
      this.config.validationTimeoutMs,
    );

    const executor = new RetryExecutor<ToolRequest, ToolResponse>({
      maxRetries: this.config.maxRetries,
      onFailure: this.config.onFailure,
      ...(this.config.onWarning ? { onWarning: this.config.onWarning } : {}),
    });

    const { response, metrics } = await executor.execute(
      req,
      next,
      (res, attempt, previousIssues) =>
        this.validateResponse(runner, "tool", req, res, attempt, previousIssues),
      // Tool calls retry with the same request (no feedback injection)
      (r) => r,
      "tool",
    );

    return attachMetrics(response, metrics);
  }

  async onAfterTurn(context: TurnContext): Promise<void> {
    if (!this.config.validateTurns) {
      return;
    }

    const guards = this.resolveGuards(context.metadata);
    if (guards.length === 0) {
      return;
    }

    const runner = new GuardRunner(
      guards,
      this.config.executionStrategy,
      this.config.validationTimeoutMs,
    );

    const guardContext: GuardContext = {
      hook: "turn",
      response: context.output,
      attempt: 1,
      previousIssues: [],
      metadata: context.metadata ?? {},
    };

    const result = await runner.run(guardContext);

    const metrics: ValidationMetrics = {
      hook: "turn",
      totalAttempts: 1,
      totalDurationMs: result.guardResults.reduce((sum, r) => sum + r.durationMs, 0),
      passed: result.valid,
      guardResults: result.guardResults,
    };

    // Attach metrics to turn context metadata
    context.metadata = {
      ...context.metadata,
      guardrails: metrics,
    };

    if (!result.valid) {
      const errorIssues = result.issues.filter((i) => i.severity === "error");

      if (this.config.onFailure === "warn") {
        this.config.onWarning?.(result.issues);
        return;
      }

      // No retry in onAfterTurn — throw directly
      throw new GuardrailSchemaError(
        `Turn validation failed with ${errorIssues.length} error(s)`,
        result.issues,
      );
    }
  }

  private resolveGuards(metadata: Record<string, unknown> | undefined): readonly Guard[] {
    const overrideSchema = metadata?.guardrailSchema;
    const configGuards = [...this.config.guards];

    if (overrideSchema) {
      // Per-request schema override: prepend a SchemaGuard
      const schemaGuard = new SchemaGuard(
        overrideSchema as import("zod").ZodType,
        this.config.validationTimeoutMs,
      );
      return [schemaGuard, ...configGuards];
    }

    if (this.config.schema) {
      const schemaGuard = new SchemaGuard(this.config.schema, this.config.validationTimeoutMs);
      return [schemaGuard, ...configGuards];
    }

    return configGuards;
  }

  private async validateResponse(
    runner: GuardRunner,
    hook: "model" | "tool",
    request: ModelRequest | ToolRequest,
    response: ModelResponse | ToolResponse,
    attempt: number,
    previousIssues: readonly GuardIssue[],
  ): Promise<AggregatedGuardResult> {
    const context: GuardContext = {
      hook,
      request,
      response,
      attempt,
      previousIssues,
      metadata: request.metadata ?? {},
    };

    return runner.run(context);
  }
}

function injectModelFeedback(req: ModelRequest, issues: readonly GuardIssue[]): ModelRequest {
  const feedback = buildFeedbackMessage(issues);
  return {
    ...req,
    messages: [...req.messages, { role: "user", content: feedback }],
  };
}

function attachMetrics<T extends { readonly metadata?: Record<string, unknown> }>(
  response: T,
  metrics: ValidationMetrics,
): T {
  return {
    ...response,
    metadata: {
      ...response.metadata,
      guardrails: metrics,
    },
  };
}
