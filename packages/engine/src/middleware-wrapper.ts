import type { TemplarMiddleware } from "@templar/core";

/**
 * Registered middleware wrapping function from @templar/telemetry.
 * Set via registerMiddlewareWrapper() when setupTelemetry() is called.
 */
let middlewareWrapper: ((mw: TemplarMiddleware) => TemplarMiddleware) | undefined;

/**
 * Register a middleware wrapping function (called by @templar/telemetry's setupTelemetry).
 *
 * This allows the telemetry package to hook into createTemplar() without
 * making createTemplar async or creating a circular dependency.
 */
export function registerMiddlewareWrapper(
  wrapper: (mw: TemplarMiddleware) => TemplarMiddleware,
): void {
  middlewareWrapper = wrapper;
}

/**
 * Unregister the middleware wrapper (called by shutdownTelemetry).
 */
export function unregisterMiddlewareWrapper(): void {
  middlewareWrapper = undefined;
}

/**
 * Get the currently registered middleware wrapper (used internally by createTemplar).
 */
export function getMiddlewareWrapper(): ((mw: TemplarMiddleware) => TemplarMiddleware) | undefined {
  return middlewareWrapper;
}

// ---------------------------------------------------------------------------
// Auto-middleware registry — middlewares injected by packages like @templar/telemetry
// ---------------------------------------------------------------------------

let autoMiddlewares: readonly TemplarMiddleware[] = [];

/**
 * Register a middleware to be automatically prepended in every createTemplar() call.
 *
 * Used by @templar/telemetry to inject the cache-trace middleware without
 * requiring users to pass it explicitly.
 */
export function registerAutoMiddleware(mw: TemplarMiddleware): void {
  if (autoMiddlewares.some((existing) => existing.name === mw.name)) {
    return;
  }
  autoMiddlewares = [...autoMiddlewares, mw];
}

/**
 * Remove all auto-registered middlewares (called by shutdownTelemetry).
 */
export function unregisterAutoMiddlewares(): void {
  autoMiddlewares = [];
}

/**
 * Get currently registered auto-middlewares (used internally by createTemplar).
 */
export function getAutoMiddlewares(): readonly TemplarMiddleware[] {
  return autoMiddlewares;
}
