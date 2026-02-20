/**
 * Runtime context — per-session context propagation via AsyncLocalStorage (#128)
 *
 * This is a controlled exception to the "zero runtime" kernel principle.
 * It provides ~30 lines of runtime code: an AsyncLocalStorage singleton,
 * two accessors, a context runner, and an env var builder.
 *
 * Every package in the monorepo can call getContext() / tryGetContext()
 * to access the current session's context without parameter drilling.
 */

import { AsyncLocalStorage } from "node:async_hooks";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Immutable per-session context available throughout the async call chain.
 *
 * Populated by the engine at session start, accessible from middleware,
 * hooks, tools, and sandbox via getContext() / tryGetContext().
 */
export interface TemplarRuntimeContext {
  /** Unique session identifier (always present) */
  readonly sessionId: string;
  /** Agent identifier */
  readonly agentId?: string;
  /** User identifier */
  readonly userId?: string;
  /** Active channel type (telegram, slack, discord, etc.) */
  readonly channelType?: string;
  /** Nexus namespace / zone ID */
  readonly zoneId?: string;
  /** Node executing the agent */
  readonly nodeId?: string;
  /** Arbitrary metadata (deep-frozen at runtime) */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Environment variable name constants (single source of truth)
// ---------------------------------------------------------------------------

/** Canonical TEMPLAR_* environment variable names, keyed by logical field. */
export const TEMPLAR_ENV_VARS = {
  USER_ID: "TEMPLAR_USER_ID",
  AGENT_ID: "TEMPLAR_AGENT_ID",
  SESSION_ID: "TEMPLAR_SESSION_ID",
  CHANNEL: "TEMPLAR_CHANNEL",
  ZONE_ID: "TEMPLAR_ZONE_ID",
  NODE_ID: "TEMPLAR_NODE_ID",
} as const;

export type TemplarEnvVarKey = keyof typeof TEMPLAR_ENV_VARS;

// ---------------------------------------------------------------------------
// AsyncLocalStorage singleton + accessors
// ---------------------------------------------------------------------------

const contextStorage = new AsyncLocalStorage<TemplarRuntimeContext>();

/**
 * Get the current session's runtime context.
 *
 * @throws {Error} if called outside an active session (no runWithContext wrapper)
 */
export function getContext(): TemplarRuntimeContext {
  const ctx = contextStorage.getStore();
  if (ctx === undefined) {
    throw new Error(
      "TemplarRuntimeContext not initialized — getContext() was called outside an active session. " +
        "Ensure the agent execution is wrapped with runWithContext().",
    );
  }
  return ctx;
}

/**
 * Try to get the current session's runtime context.
 *
 * @returns The context if inside an active session, or `undefined` otherwise.
 */
export function tryGetContext(): TemplarRuntimeContext | undefined {
  return contextStorage.getStore();
}

/**
 * Run a function within a runtime context scope.
 *
 * The context is deep-frozen (top-level + metadata) before being stored
 * to prevent mutation of core fields and metadata contents.
 *
 * @param ctx - The runtime context for the session
 * @param fn - The function to execute within the context scope
 * @returns The return value of `fn`
 */
export function runWithContext<T>(ctx: TemplarRuntimeContext, fn: () => T): T {
  const frozen = Object.freeze({
    ...ctx,
    ...(ctx.metadata !== undefined ? { metadata: Object.freeze({ ...ctx.metadata }) } : {}),
  });
  return contextStorage.run(frozen, fn);
}

// ---------------------------------------------------------------------------
// Environment variable builder (DRY utility)
// ---------------------------------------------------------------------------

/** Max length for any single TEMPLAR_* env var value. */
const MAX_ENV_VALUE_LENGTH = 1024;

/** Characters unsafe in environment variable values (null bytes, newlines). */
const UNSAFE_ENV_CHARS = /[\0\n\r]/g;

/**
 * Sanitize a value before injecting it into the child process environment.
 * Strips null bytes, newlines, and truncates to MAX_ENV_VALUE_LENGTH.
 */
function sanitizeEnvValue(value: string): string {
  const cleaned = value.replace(UNSAFE_ENV_CHARS, "");
  return cleaned.length > MAX_ENV_VALUE_LENGTH ? cleaned.slice(0, MAX_ENV_VALUE_LENGTH) : cleaned;
}

/**
 * Build a `Record<string, string>` of TEMPLAR_* environment variables
 * from the given runtime context.
 *
 * - Omits variables whose value is `undefined` or empty string `""`.
 * - Never includes `metadata` — only the 6 canonical fields.
 * - Sanitizes values: strips null/newline chars, truncates to 1024 chars.
 */
export function buildEnvVars(ctx: TemplarRuntimeContext): Record<string, string> {
  const vars: Record<string, string> = {};

  const mapping: ReadonlyArray<readonly [string, string | undefined]> = [
    [TEMPLAR_ENV_VARS.SESSION_ID, ctx.sessionId],
    [TEMPLAR_ENV_VARS.USER_ID, ctx.userId],
    [TEMPLAR_ENV_VARS.AGENT_ID, ctx.agentId],
    [TEMPLAR_ENV_VARS.CHANNEL, ctx.channelType],
    [TEMPLAR_ENV_VARS.ZONE_ID, ctx.zoneId],
    [TEMPLAR_ENV_VARS.NODE_ID, ctx.nodeId],
  ];

  for (const [envName, value] of mapping) {
    if (value !== undefined && value !== "") {
      vars[envName] = sanitizeEnvValue(value);
    }
  }

  return vars;
}
