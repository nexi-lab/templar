/**
 * Core types for the A2A protocol client.
 *
 * These are Templar-specific types that wrap or complement the
 * @a2a-js/sdk types for integration with the middleware pipeline.
 */

// ---------------------------------------------------------------------------
// Agent Card (discovery result — Templar-normalized)
// ---------------------------------------------------------------------------

/**
 * Normalized agent information returned by discovery.
 * Extracts the fields most useful for LLM tool context.
 */
export interface AgentInfo {
  readonly name: string;
  readonly description: string | undefined;
  readonly url: string;
  readonly version: string | undefined;
  readonly skills: readonly AgentSkillInfo[];
  readonly capabilities: AgentCapabilitiesInfo;
  readonly provider: string | undefined;
}

/** Simplified skill descriptor for LLM context */
export interface AgentSkillInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly tags: readonly string[] | undefined;
}

/** Simplified capabilities descriptor */
export interface AgentCapabilitiesInfo {
  readonly streaming: boolean;
  readonly pushNotifications: boolean;
}

// ---------------------------------------------------------------------------
// Task result (Templar-normalized)
// ---------------------------------------------------------------------------

/**
 * A2A task states as defined by the protocol spec.
 */
export type A2aTaskState =
  | "working"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected"
  | "input_required"
  | "auth_required";

/** Terminal states — no further polling needed */
export const TERMINAL_STATES: ReadonlySet<A2aTaskState> = new Set([
  "completed",
  "failed",
  "canceled",
  "rejected",
]);

/**
 * Normalized task result returned to the middleware pipeline.
 */
export interface A2aTaskResult {
  readonly taskId: string;
  readonly contextId: string | undefined;
  readonly state: A2aTaskState;
  readonly messages: readonly A2aMessage[];
  readonly artifacts: readonly A2aArtifact[];
}

export interface A2aMessage {
  readonly role: "user" | "agent";
  readonly parts: readonly A2aMessagePart[];
}

export type A2aMessagePart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "data"; readonly data: unknown; readonly mimeType: string | undefined }
  | { readonly type: "file"; readonly uri: string; readonly mimeType: string | undefined };

export interface A2aArtifact {
  readonly id: string;
  readonly label: string | undefined;
  readonly mimeType: string | undefined;
  readonly parts: readonly A2aMessagePart[];
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a single A2A agent endpoint.
 */
export interface A2aAgentConfig {
  readonly url: string;
  readonly auth?: A2aAuthConfig | undefined;
}

/**
 * Authentication configuration for a remote A2A agent.
 */
export interface A2aAuthConfig {
  readonly type: "apiKey" | "bearer" | "oauth2";
  readonly credentials: string;
  readonly headerName?: string | undefined;
}

/**
 * Configuration for the A2AClient.
 */
export interface A2aClientConfig {
  /** Discovery timeout in milliseconds (default: 10_000) */
  readonly discoveryTimeoutMs?: number | undefined;
  /** Task completion timeout in milliseconds (default: 300_000) */
  readonly taskTimeoutMs?: number | undefined;
  /** Polling interval for async tasks in milliseconds (default: 2_000) */
  readonly pollIntervalMs?: number | undefined;
  /** Maximum polling interval after backoff in milliseconds (default: 30_000) */
  readonly pollMaxIntervalMs?: number | undefined;
  /** Agent Card cache TTL in milliseconds (default: 300_000) */
  readonly cacheTtlMs?: number | undefined;
  /** Maximum Agent Card cache entries (default: 100) */
  readonly cacheMaxEntries?: number | undefined;
}

/**
 * Configuration for the A2AMiddleware (wrapToolCall integration).
 */
export interface A2aMiddlewareConfig extends A2aClientConfig {
  /** Authentication configs per agent URL */
  readonly agents?: readonly A2aAgentConfig[] | undefined;
  /** Tool name prefix (default: "a2a") — tools are named `{prefix}_discover`, etc. */
  readonly toolPrefix?: string | undefined;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default discovery timeout */
export const DEFAULT_DISCOVERY_TIMEOUT_MS = 10_000;

/** Default task completion timeout */
export const DEFAULT_TASK_TIMEOUT_MS = 300_000;

/** Default polling interval for async tasks */
export const DEFAULT_POLL_INTERVAL_MS = 2_000;

/** Default maximum polling interval after backoff */
export const DEFAULT_POLL_MAX_INTERVAL_MS = 30_000;

/** Default Agent Card cache TTL */
export const DEFAULT_CACHE_TTL_MS = 300_000;

/** Default maximum cache entries */
export const DEFAULT_CACHE_MAX_ENTRIES = 100;

/** Default tool name prefix */
export const DEFAULT_TOOL_PREFIX = "a2a";

/** Well-known Agent Card path */
export const AGENT_CARD_PATH = "/.well-known/agent.json";
