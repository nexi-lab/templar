/**
 * Test helpers for @templar/a2a
 */

import type { A2aArtifact, A2aMessage, A2aTaskResult, A2aTaskState, AgentInfo } from "../types.js";

// ---------------------------------------------------------------------------
// Mock Agent Card
// ---------------------------------------------------------------------------

export function createMockAgentCard(overrides?: Partial<AgentInfo>): AgentInfo {
  return {
    name: "Test Agent",
    description: "A test A2A agent",
    url: "https://agent.example.com",
    version: "1.0.0",
    skills: [
      {
        id: "search",
        name: "Search",
        description: "Search the web",
        tags: ["search", "web"],
      },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    provider: "Test Corp",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Task Results
// ---------------------------------------------------------------------------

export function createMockTaskResult(overrides?: Partial<A2aTaskResult>): A2aTaskResult {
  return {
    taskId: "task-123",
    contextId: undefined,
    state: "completed",
    messages: [
      {
        role: "agent",
        parts: [{ type: "text", text: "Hello from the agent" }],
      },
    ],
    artifacts: [],
    ...overrides,
  };
}

export function createMockMessage(role: "user" | "agent", text: string): A2aMessage {
  return {
    role,
    parts: [{ type: "text", text }],
  };
}

export function createMockArtifact(overrides?: Partial<A2aArtifact>): A2aArtifact {
  return {
    id: "artifact-1",
    label: "Result",
    mimeType: "text/plain",
    parts: [{ type: "text", text: "artifact content" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock JSON-RPC Responses
// ---------------------------------------------------------------------------

export function createJsonRpcSuccess(result: unknown, id = "req-1"): unknown {
  return { jsonrpc: "2.0", id, result };
}

export function createJsonRpcError(code: number, message: string, id = "req-1"): unknown {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ---------------------------------------------------------------------------
// Mock Agent Card JSON (raw, as returned by HTTP)
// ---------------------------------------------------------------------------

export function createRawAgentCard(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    name: "Test Agent",
    description: "A test A2A agent",
    version: "1.0.0",
    skills: [
      {
        id: "search",
        name: "Search",
        description: "Search the web",
        tags: ["search", "web"],
      },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    provider: { organization: "Test Corp" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

export function mockFetchResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers({ "content-type": "application/json" }),
  } as Response;
}

// ---------------------------------------------------------------------------
// Mock Task JSON-RPC result (raw, as returned by server)
// ---------------------------------------------------------------------------

export function createRawTaskResult(
  state: A2aTaskState = "completed",
  taskId = "task-123",
): Record<string, unknown> {
  return {
    id: taskId,
    status: {
      state: state.toUpperCase(),
      message: {
        role: "agent",
        parts: [{ text: `Result in ${state} state` }],
      },
    },
    artifacts: [],
  };
}
