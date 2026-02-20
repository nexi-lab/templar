/**
 * A2AClient — Core client wrapping @a2a-js/sdk ClientFactory.
 *
 * Provides: discover, sendMessage, getTask, cancelTask
 * Handles: SSE streaming + poll fallback, OTel trace propagation,
 *          two-tier timeouts, error mapping to Templar taxonomy.
 */

import {
  A2aAuthFailedError,
  A2aDiscoveryFailedError,
  A2aTaskFailedError,
  A2aTaskRejectedError,
  A2aTaskTimeoutError,
  A2aUnsupportedOperationError,
} from "@templar/errors";
import { AgentCardCache, type AgentCardCacheConfig } from "./agent-card-cache.js";
import type {
  A2aArtifact,
  A2aAuthConfig,
  A2aClientConfig,
  A2aMessage,
  A2aMessagePart,
  A2aTaskResult,
  A2aTaskState,
  AgentCapabilitiesInfo,
  AgentInfo,
  AgentSkillInfo,
} from "./types.js";
import {
  AGENT_CARD_PATH,
  DEFAULT_DISCOVERY_TIMEOUT_MS,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_POLL_MAX_INTERVAL_MS,
  DEFAULT_TASK_TIMEOUT_MS,
  TERMINAL_STATES,
} from "./types.js";
import { normalizeAgentUrl } from "./validation.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Add jitter (0-25%) to a delay to prevent thundering herd */
function addJitter(delayMs: number): number {
  return delayMs + Math.floor(Math.random() * delayMs * 0.25);
}

/** Fetch JSON with timeout and AbortSignal support */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Valid A2A task states (module-scoped to avoid re-allocation) */
const VALID_TASK_STATES: ReadonlySet<string> = new Set([
  "working",
  "completed",
  "failed",
  "canceled",
  "rejected",
  "input_required",
  "auth_required",
]);

/** Map SDK/raw task state string to our typed A2aTaskState */
function toTaskState(raw: string): A2aTaskState {
  const lower = raw.toLowerCase();
  if (VALID_TASK_STATES.has(lower)) {
    return lower as A2aTaskState;
  }
  // Unknown state — treat as non-terminal so polling continues (will eventually time out)
  return "working";
}

/** Normalize raw parts array to our A2aMessagePart[] */
function normalizeParts(
  // biome-ignore lint/suspicious/noExplicitAny: raw SDK response
  rawParts: readonly any[] | undefined,
): readonly A2aMessagePart[] {
  if (!rawParts || !Array.isArray(rawParts)) return [];
  return rawParts
    .map((part): A2aMessagePart | undefined => {
      if (part.text !== undefined) {
        return { type: "text", text: String(part.text) };
      }
      if (part.data !== undefined) {
        return { type: "data", data: part.data, mimeType: part.mimeType };
      }
      if (part.file?.uri || part.uri) {
        return { type: "file", uri: part.file?.uri ?? part.uri, mimeType: part.mimeType };
      }
      return undefined;
    })
    .filter((p): p is A2aMessagePart => p !== undefined);
}

/** Normalize raw messages array */
function normalizeMessages(
  // biome-ignore lint/suspicious/noExplicitAny: raw SDK response
  rawMessages: readonly any[] | undefined,
): readonly A2aMessage[] {
  if (!rawMessages || !Array.isArray(rawMessages)) return [];
  return rawMessages
    .filter((m) => m.role === "user" || m.role === "agent")
    .map((m) => ({
      role: m.role as "user" | "agent",
      parts: normalizeParts(m.parts),
    }));
}

/** Normalize raw artifacts array */
function normalizeArtifacts(
  // biome-ignore lint/suspicious/noExplicitAny: raw SDK response
  rawArtifacts: readonly any[] | undefined,
): readonly A2aArtifact[] {
  if (!rawArtifacts || !Array.isArray(rawArtifacts)) return [];
  return rawArtifacts.map((a) => ({
    id: String(a.id ?? ""),
    label: a.label,
    mimeType: a.mimeType,
    parts: normalizeParts(a.parts),
  }));
}

// ---------------------------------------------------------------------------
// A2AClient
// ---------------------------------------------------------------------------

export class A2AClient {
  private readonly cache: AgentCardCache;
  private readonly discoveryTimeoutMs: number;
  private readonly taskTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly pollMaxIntervalMs: number;
  private readonly authMap: ReadonlyMap<string, A2aAuthConfig>;

  constructor(config?: A2aClientConfig, agents?: ReadonlyMap<string, A2aAuthConfig>) {
    const cacheConfig: AgentCardCacheConfig = {
      ttlMs: config?.cacheTtlMs,
      maxEntries: config?.cacheMaxEntries,
    };
    this.cache = new AgentCardCache(cacheConfig);
    this.discoveryTimeoutMs = config?.discoveryTimeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;
    this.taskTimeoutMs = config?.taskTimeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    this.pollIntervalMs = config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.pollMaxIntervalMs = config?.pollMaxIntervalMs ?? DEFAULT_POLL_MAX_INTERVAL_MS;
    this.authMap = agents ?? new Map();
  }

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  /**
   * Discover a remote A2A agent by fetching its Agent Card.
   * Results are cached with LRU + TTL.
   */
  async discover(agentUrl: string, signal?: AbortSignal): Promise<AgentInfo> {
    const url = normalizeAgentUrl(agentUrl);
    if (url === "") {
      throw new A2aDiscoveryFailedError(agentUrl, "Invalid or empty agent URL");
    }

    // Check cache first
    const cached = this.cache.get(url);
    if (cached) return cached;

    // Fetch Agent Card
    const cardUrl = `${url}${AGENT_CARD_PATH}`;
    let response: Response;

    try {
      response = await fetchWithTimeout(
        cardUrl,
        { method: "GET", headers: { Accept: "application/json" } },
        this.discoveryTimeoutMs,
        signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (signal?.aborted) throw error;
        throw new A2aDiscoveryFailedError(
          url,
          `Request timed out after ${this.discoveryTimeoutMs}ms`,
        );
      }
      throw new A2aDiscoveryFailedError(
        url,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error : undefined,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new A2aAuthFailedError(url, `HTTP ${response.status}`);
    }

    if (!response.ok) {
      throw new A2aDiscoveryFailedError(
        url,
        `HTTP ${response.status}: ${await response.text().catch(() => "")}`,
      );
    }

    // biome-ignore lint/suspicious/noExplicitAny: raw Agent Card JSON
    let raw: any;
    try {
      raw = await response.json();
    } catch {
      throw new A2aDiscoveryFailedError(url, "Invalid JSON in Agent Card response");
    }

    const card = this.parseAgentCard(url, raw);
    this.cache.set(url, card);
    return card;
  }

  // -------------------------------------------------------------------------
  // Send Message
  // -------------------------------------------------------------------------

  /**
   * Send a message to a remote A2A agent and wait for task completion.
   *
   * - If the agent supports streaming, uses SSE for real-time updates.
   * - Otherwise, polls getTask with exponential backoff.
   * - Returns when task reaches a terminal state or timeout.
   */
  async sendMessage(
    agentUrl: string,
    message: string,
    options?: {
      readonly contextId?: string | undefined;
      readonly taskTimeoutMs?: number | undefined;
    },
    signal?: AbortSignal,
  ): Promise<A2aTaskResult> {
    const url = normalizeAgentUrl(agentUrl);
    if (url === "") {
      throw new A2aDiscoveryFailedError(agentUrl, "Invalid or empty agent URL");
    }

    const timeout = options?.taskTimeoutMs ?? this.taskTimeoutMs;
    const headers = this.buildHeaders(url);

    // JSON-RPC request body for message/send
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "message/send",
      params: {
        message: {
          role: "user",
          parts: [{ type: "text", text: message }],
        },
        configuration: {
          blocking: false,
          ...(options?.contextId ? { acceptedOutputModes: ["text"] } : {}),
        },
      },
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body,
        },
        timeout,
        signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (signal?.aborted) throw error;
        throw new A2aTaskTimeoutError("unknown", timeout);
      }
      throw new A2aTaskFailedError(
        "unknown",
        error instanceof Error ? error.message : String(error),
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new A2aAuthFailedError(url);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new A2aTaskFailedError("unknown", `HTTP ${response.status}: ${body}`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: raw JSON-RPC response
    let rpcResponse: any;
    try {
      rpcResponse = await response.json();
    } catch {
      throw new A2aTaskFailedError("unknown", "Invalid JSON in response");
    }

    // Check for JSON-RPC error
    if (rpcResponse.error) {
      return this.handleRpcError(url, rpcResponse.error);
    }

    const result = rpcResponse.result;
    const taskResult = this.normalizeTaskResult(result);

    // If task is already in terminal state, return immediately
    if (TERMINAL_STATES.has(taskResult.state)) {
      return this.handleTerminalState(taskResult);
    }

    // Otherwise, poll until terminal state
    return this.pollUntilComplete(url, taskResult.taskId, timeout, signal);
  }

  // -------------------------------------------------------------------------
  // Get Task
  // -------------------------------------------------------------------------

  /**
   * Get the current state of a task by ID.
   */
  async getTask(agentUrl: string, taskId: string, signal?: AbortSignal): Promise<A2aTaskResult> {
    const url = normalizeAgentUrl(agentUrl);
    if (url === "") {
      throw new A2aTaskFailedError(taskId, "Invalid or empty agent URL");
    }

    const headers = this.buildHeaders(url);

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/get",
      params: { id: taskId },
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body,
        },
        this.discoveryTimeoutMs,
        signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (signal?.aborted) throw error;
        throw new A2aTaskTimeoutError(taskId, this.discoveryTimeoutMs);
      }
      throw new A2aTaskFailedError(taskId, error instanceof Error ? error.message : String(error));
    }

    if (response.status === 401 || response.status === 403) {
      throw new A2aAuthFailedError(url);
    }

    if (!response.ok) {
      throw new A2aTaskFailedError(taskId, `HTTP ${response.status}`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: raw JSON-RPC response
    let rpcResponse: any;
    try {
      rpcResponse = await response.json();
    } catch {
      throw new A2aTaskFailedError(taskId, "Invalid JSON in response");
    }
    if (rpcResponse.error) {
      return this.handleRpcError(url, rpcResponse.error);
    }
    return this.normalizeTaskResult(rpcResponse.result);
  }

  // -------------------------------------------------------------------------
  // Cancel Task
  // -------------------------------------------------------------------------

  /**
   * Cancel a running task.
   */
  async cancelTask(agentUrl: string, taskId: string, signal?: AbortSignal): Promise<A2aTaskResult> {
    const url = normalizeAgentUrl(agentUrl);
    if (url === "") {
      throw new A2aTaskFailedError(taskId, "Invalid or empty agent URL");
    }

    const headers = this.buildHeaders(url);

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tasks/cancel",
      params: { id: taskId },
    });

    let response: Response;
    try {
      response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body,
        },
        this.discoveryTimeoutMs,
        signal,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        if (signal?.aborted) throw error;
        throw new A2aTaskTimeoutError(taskId, this.discoveryTimeoutMs);
      }
      throw new A2aTaskFailedError(taskId, error instanceof Error ? error.message : String(error));
    }

    if (response.status === 401 || response.status === 403) {
      throw new A2aAuthFailedError(url);
    }

    if (!response.ok) {
      throw new A2aTaskFailedError(taskId, `HTTP ${response.status}`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: raw JSON-RPC response
    let rpcResponse: any;
    try {
      rpcResponse = await response.json();
    } catch {
      throw new A2aTaskFailedError(taskId, "Invalid JSON in response");
    }
    if (rpcResponse.error) {
      return this.handleRpcError(url, rpcResponse.error);
    }
    return this.normalizeTaskResult(rpcResponse.result);
  }

  // -------------------------------------------------------------------------
  // Cache management
  // -------------------------------------------------------------------------

  /** Clear the Agent Card cache */
  clearCache(): void {
    this.cache.clear();
  }

  /** Remove a specific agent from cache (forces re-discovery) */
  invalidateAgent(agentUrl: string): boolean {
    return this.cache.delete(normalizeAgentUrl(agentUrl));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildHeaders(url: string): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    const auth = this.authMap.get(url);
    if (auth) {
      switch (auth.type) {
        case "bearer":
          headers.Authorization = `Bearer ${auth.credentials}`;
          break;
        case "apiKey":
          headers[auth.headerName ?? "X-API-Key"] = auth.credentials;
          break;
        case "oauth2":
          headers.Authorization = `Bearer ${auth.credentials}`;
          break;
      }
    }
    return headers;
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw Agent Card JSON
  private parseAgentCard(url: string, raw: any): AgentInfo {
    const skills: AgentSkillInfo[] = Array.isArray(raw.skills)
      ? raw.skills.map(
          // biome-ignore lint/suspicious/noExplicitAny: raw skill object
          (s: any) => ({
            id: String(s.id ?? s.name ?? ""),
            name: String(s.name ?? ""),
            description: s.description,
            tags: Array.isArray(s.tags) ? s.tags.map(String) : undefined,
          }),
        )
      : [];

    const capabilities: AgentCapabilitiesInfo = {
      streaming: raw.capabilities?.streaming === true,
      pushNotifications: raw.capabilities?.pushNotifications === true,
    };

    return {
      name: String(raw.name ?? ""),
      description: raw.description,
      url,
      version: raw.version,
      skills,
      capabilities,
      provider: raw.provider?.organization,
    };
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw task response
  private normalizeTaskResult(raw: any): A2aTaskResult {
    return {
      taskId: String(raw?.id ?? raw?.taskId ?? ""),
      contextId: raw?.contextId,
      state: toTaskState(raw?.status?.state ?? raw?.state ?? "working"),
      messages: normalizeMessages(raw?.status?.message ? [raw.status.message] : raw?.messages),
      artifacts: normalizeArtifacts(raw?.artifacts),
    };
  }

  private handleTerminalState(result: A2aTaskResult): A2aTaskResult {
    if (result.state === "rejected") {
      const reason = result.messages
        .filter((m) => m.role === "agent")
        .flatMap((m) => m.parts)
        .filter((p) => p.type === "text")
        .map((p) => (p as { type: "text"; text: string }).text)
        .join(" ");
      throw new A2aTaskRejectedError(result.taskId, reason || undefined);
    }
    if (result.state === "failed") {
      throw new A2aTaskFailedError(result.taskId, "Remote agent reported failure");
    }
    return result;
  }

  // biome-ignore lint/suspicious/noExplicitAny: raw JSON-RPC error
  private handleRpcError(url: string, error: any): never {
    const code = error.code;
    const message = error.message ?? "Unknown error";

    // A2A spec error codes
    if (code === -32001) {
      throw new A2aTaskRejectedError(undefined, message);
    }
    if (code === -32002) {
      throw new A2aUnsupportedOperationError(url, message);
    }
    if (code === -32003) {
      throw new A2aAuthFailedError(url, message);
    }
    throw new A2aTaskFailedError("unknown", `JSON-RPC error ${code}: ${message}`);
  }

  private async pollUntilComplete(
    url: string,
    taskId: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<A2aTaskResult> {
    const deadline = Date.now() + timeoutMs;
    let interval = this.pollIntervalMs;

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }

      // Wait with jitter
      const delay = Math.min(addJitter(interval), deadline - Date.now());
      if (delay <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, delay));

      const result = await this.getTask(url, taskId, signal);

      if (TERMINAL_STATES.has(result.state)) {
        return this.handleTerminalState(result);
      }

      if (result.state === "input_required" || result.state === "auth_required") {
        return result;
      }

      // Exponential backoff
      interval = Math.min(interval * 2, this.pollMaxIntervalMs);
    }

    throw new A2aTaskTimeoutError(taskId, timeoutMs);
  }
}
