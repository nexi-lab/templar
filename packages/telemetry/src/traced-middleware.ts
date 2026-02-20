/**
 * TracedMiddleware wrapper — non-invasive OTel instrumentation for TemplarMiddleware.
 *
 * Wraps each lifecycle hook in a span without modifying the original middleware.
 * Span names follow: `templar.middleware.{name}.{hook}`
 *
 * After onAfterTurn, enriches the span with cost attributes from context.metadata
 * (budget pressure, token usage, model info) and increments OTel cost counters.
 */

import { trace } from "@opentelemetry/api";
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
import { getCostTotal, getTokenUsage } from "./metrics.js";
import { withSpan } from "./span-helpers.js";

/**
 * Wrap a TemplarMiddleware with OpenTelemetry tracing.
 *
 * Each lifecycle hook (onSessionStart, onBeforeTurn, onAfterTurn, onSessionEnd)
 * is wrapped in a span. Undefined hooks are not included in the result.
 *
 * After onAfterTurn completes, cost-related span attributes are added from
 * context.metadata (budget pressure and token usage injected by pay middleware).
 *
 * Errors propagate unchanged — the wrapper only adds observability.
 *
 * @param middleware - The middleware to wrap
 * @returns A new middleware with tracing added to each hook
 */
export function withTracing(middleware: TemplarMiddleware): TemplarMiddleware {
  const baseName = `templar.middleware.${middleware.name}`;

  const result: TemplarMiddleware = { name: middleware.name };

  if (middleware.onSessionStart) {
    const original = middleware.onSessionStart.bind(middleware);
    (result as { onSessionStart: (ctx: SessionContext) => Promise<void> }).onSessionStart = (ctx) =>
      withSpan(`${baseName}.session_start`, { "session.id": ctx.sessionId }, () => original(ctx));
  }

  if (middleware.onBeforeTurn) {
    const original = middleware.onBeforeTurn.bind(middleware);
    (result as { onBeforeTurn: (ctx: TurnContext) => Promise<void> }).onBeforeTurn = (ctx) =>
      withSpan(
        `${baseName}.before_turn`,
        { "session.id": ctx.sessionId, "turn.number": ctx.turnNumber },
        () => original(ctx),
      );
  }

  if (middleware.onAfterTurn) {
    const original = middleware.onAfterTurn.bind(middleware);
    (result as { onAfterTurn: (ctx: TurnContext) => Promise<void> }).onAfterTurn = (ctx) =>
      withSpan(
        `${baseName}.after_turn`,
        { "session.id": ctx.sessionId, "turn.number": ctx.turnNumber },
        async () => {
          await original(ctx);
          enrichSpanWithCostAttributes(ctx);
        },
      );
  }

  if (middleware.onSessionEnd) {
    const original = middleware.onSessionEnd.bind(middleware);
    (result as { onSessionEnd: (ctx: SessionContext) => Promise<void> }).onSessionEnd = (ctx) =>
      withSpan(`${baseName}.session_end`, { "session.id": ctx.sessionId }, () => original(ctx));
  }

  // Forward wrap hooks (wrapModelCall / wrapToolCall) with tracing spans
  if (middleware.wrapModelCall) {
    const original = middleware.wrapModelCall.bind(middleware);
    (
      result as { wrapModelCall: (req: ModelRequest, next: ModelHandler) => Promise<ModelResponse> }
    ).wrapModelCall = (req, next) =>
      withSpan(`${baseName}.wrap_model_call`, {}, () => original(req, next));
  }

  if (middleware.wrapToolCall) {
    const original = middleware.wrapToolCall.bind(middleware);
    (
      result as { wrapToolCall: (req: ToolRequest, next: ToolHandler) => Promise<ToolResponse> }
    ).wrapToolCall = (req, next) =>
      withSpan(`${baseName}.wrap_tool_call`, {}, () => original(req, next));
  }

  return result;
}

/**
 * Enrich the active span with cost attributes from turn context metadata.
 *
 * Reads two metadata sources (both optional, set by other middlewares):
 * - `budget` — BudgetPressure injected by NexusPayMiddleware
 * - `usage` — TokenUsage from the engine or ModelRouter
 *
 * Also increments OTel counters for tokens and cost.
 * No-op when metadata fields are absent (non-pay sessions).
 */
function enrichSpanWithCostAttributes(ctx: TurnContext): void {
  const span = trace.getActiveSpan();
  if (span === undefined) return;

  const metadata = ctx.metadata;
  if (metadata === undefined) return;

  // Budget pressure (injected by NexusPayMiddleware.injectBudgetPressure)
  const budget = metadata.budget;
  if (budget !== null && typeof budget === "object") {
    const b = budget as Record<string, unknown>;
    if (typeof b.sessionCost === "number") {
      span.setAttribute("cost.session_total", b.sessionCost);
    }
    if (typeof b.remaining === "number") {
      span.setAttribute("cost.remaining", b.remaining);
    }
    if (typeof b.pressure === "number") {
      span.setAttribute("cost.budget_pressure", b.pressure);
    }
    if (typeof b.cacheHitRate === "number") {
      span.setAttribute("cost.cache_hit_rate", b.cacheHitRate);
    }
  }

  // Token usage (direct or from model router)
  const usage = metadata.usage;
  if (usage !== null && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    const model = typeof u.model === "string" ? u.model : "unknown";

    if (typeof u.model === "string") {
      span.setAttribute("cost.model", u.model);
    }
    if (typeof u.inputTokens === "number") {
      span.setAttribute("cost.input_tokens", u.inputTokens);
    }
    if (typeof u.outputTokens === "number") {
      span.setAttribute("cost.output_tokens", u.outputTokens);
    }
    if (typeof u.totalTokens === "number") {
      span.setAttribute("cost.total_tokens", u.totalTokens);
      getTokenUsage().add(u.totalTokens, { model });
    }
    if (typeof u.totalCost === "number") {
      span.setAttribute("cost.total_cost", u.totalCost);
      getCostTotal().add(u.totalCost, { model });
    }
  }
}
