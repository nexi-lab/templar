import type {
  BudgetExhaustedData,
  BudgetWarningData,
  ContextPressureData,
  ErrorOccurredData,
  NodeConnectedData,
  NodeDisconnectedData,
  PostMessageData,
  PostModelCallData,
  PostToolUseData,
  PreCompactData,
  PreMessageData,
  PreModelCallData,
  PreModelSelectData,
  PreToolUseData,
  SessionEndData,
  SessionStartData,
  SubagentEndData,
  SubagentStartData,
} from "../types.js";

// ---------------------------------------------------------------------------
// Interceptor event data factories
// ---------------------------------------------------------------------------

export function makePreToolUseData(overrides?: Partial<PreToolUseData>): PreToolUseData {
  return {
    toolName: "test-tool",
    args: { key: "value" },
    sessionId: "session-1",
    ...overrides,
  };
}

export function makePreModelCallData(overrides?: Partial<PreModelCallData>): PreModelCallData {
  return {
    model: "test-model",
    messages: [{ role: "user", content: "hello" }],
    config: { temperature: 0.7 },
    sessionId: "session-1",
    ...overrides,
  };
}

export function makePreModelSelectData(
  overrides?: Partial<PreModelSelectData>,
): PreModelSelectData {
  return {
    candidates: ["model-a", "model-b"],
    context: { taskType: "generation" },
    sessionId: "session-1",
    ...overrides,
  };
}

export function makePreMessageData(overrides?: Partial<PreMessageData>): PreMessageData {
  return {
    message: { text: "hello" },
    channelId: "channel-1",
    sessionId: "session-1",
    ...overrides,
  };
}

export function makeBudgetExhaustedData(
  overrides?: Partial<BudgetExhaustedData>,
): BudgetExhaustedData {
  return {
    budget: 100,
    spent: 100,
    remaining: 0,
    agentId: "agent-1",
    ...overrides,
  };
}

export function makePreCompactData(overrides?: Partial<PreCompactData>): PreCompactData {
  return {
    sessionId: "session-1",
    currentTokens: 8000,
    maxTokens: 10000,
    preservedIds: ["msg-1", "msg-2"],
    injections: [{ type: "system", content: "context" }],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Observer event data factories
// ---------------------------------------------------------------------------

export function makePostToolUseData(overrides?: Partial<PostToolUseData>): PostToolUseData {
  return {
    toolName: "test-tool",
    args: { key: "value" },
    result: "ok",
    durationMs: 100,
    sessionId: "session-1",
    ...overrides,
  };
}

export function makePostModelCallData(overrides?: Partial<PostModelCallData>): PostModelCallData {
  return {
    model: "test-model",
    response: { text: "response" },
    usage: { promptTokens: 100, completionTokens: 50 },
    durationMs: 200,
    sessionId: "session-1",
    ...overrides,
  };
}

export function makePostMessageData(overrides?: Partial<PostMessageData>): PostMessageData {
  return {
    message: { text: "hello" },
    channelId: "channel-1",
    messageId: "msg-1",
    sessionId: "session-1",
    ...overrides,
  };
}

export function makeSessionStartData(overrides?: Partial<SessionStartData>): SessionStartData {
  return {
    sessionId: "session-1",
    agentId: "agent-1",
    userId: "user-1",
    ...overrides,
  };
}

export function makeSessionEndData(overrides?: Partial<SessionEndData>): SessionEndData {
  return {
    sessionId: "session-1",
    agentId: "agent-1",
    userId: "user-1",
    durationMs: 5000,
    turnCount: 3,
    ...overrides,
  };
}

export function makeBudgetWarningData(overrides?: Partial<BudgetWarningData>): BudgetWarningData {
  return {
    budget: 100,
    spent: 80,
    remaining: 20,
    threshold: 0.8,
    agentId: "agent-1",
    ...overrides,
  };
}

export function makeErrorOccurredData(overrides?: Partial<ErrorOccurredData>): ErrorOccurredData {
  return {
    error: new Error("test error"),
    sessionId: "session-1",
    ...overrides,
  };
}

export function makeContextPressureData(
  overrides?: Partial<ContextPressureData>,
): ContextPressureData {
  return {
    used: 8000,
    total: 10000,
    percentage: 80,
    sessionId: "session-1",
    ...overrides,
  };
}

export function makeNodeConnectedData(overrides?: Partial<NodeConnectedData>): NodeConnectedData {
  return {
    nodeId: "node-1",
    sessionId: "session-1",
    capabilities: { compute: true },
    ...overrides,
  };
}

export function makeNodeDisconnectedData(
  overrides?: Partial<NodeDisconnectedData>,
): NodeDisconnectedData {
  return {
    nodeId: "node-1",
    sessionId: "session-1",
    reason: "timeout",
    ...overrides,
  };
}

export function makeSubagentStartData(overrides?: Partial<SubagentStartData>): SubagentStartData {
  return {
    subagentId: "sub-1",
    parentSessionId: "session-1",
    sessionId: "sub-session-1",
    task: "research",
    model: "test-model",
    ...overrides,
  };
}

export function makeSubagentEndData(overrides?: Partial<SubagentEndData>): SubagentEndData {
  return {
    subagentId: "sub-1",
    parentSessionId: "session-1",
    sessionId: "sub-session-1",
    task: "research",
    result: { summary: "done" },
    durationMs: 3000,
    exitReason: "completed",
    ...overrides,
  };
}
