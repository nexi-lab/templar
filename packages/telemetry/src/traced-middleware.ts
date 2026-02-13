/**
 * TracedMiddleware wrapper — non-invasive OTel instrumentation for TemplarMiddleware.
 *
 * Wraps each lifecycle hook in a span without modifying the original middleware.
 * Span names follow: `templar.middleware.{name}.{hook}`
 */

import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import { withSpan } from "./span-helpers.js";

/**
 * Wrap a TemplarMiddleware with OpenTelemetry tracing.
 *
 * Each lifecycle hook (onSessionStart, onBeforeTurn, onAfterTurn, onSessionEnd)
 * is wrapped in a span. Undefined hooks are not included in the result.
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
        () => original(ctx),
      );
  }

  if (middleware.onSessionEnd) {
    const original = middleware.onSessionEnd.bind(middleware);
    (result as { onSessionEnd: (ctx: SessionContext) => Promise<void> }).onSessionEnd = (ctx) =>
      withSpan(`${baseName}.session_end`, { "session.id": ctx.sessionId }, () => original(ctx));
  }

  return result;
}
