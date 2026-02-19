import { describe, expect, it } from "vitest";
import { parseFrame, safeParseFrame } from "../protocol/frames.js";

describe("Delegation frame validation", () => {
  it("delegation.request frame validates correctly", () => {
    const reqFrame = {
      kind: "delegation.request",
      delegationId: "del-v1",
      fromNodeId: "node-from",
      toNodeId: "node-to",
      scope: { requiredCapabilities: ["text"] },
      intent: "summarize",
      payload: {
        id: "msg-1",
        lane: "steer",
        channelId: "ch-1",
        payload: null,
        timestamp: 1000,
      },
      fallbackNodeIds: ["fb-1"],
      timeoutMs: 5000,
    };
    expect(() => parseFrame(reqFrame)).not.toThrow();
  });

  it("delegation.accept frame validates correctly", () => {
    const acceptFrame = {
      kind: "delegation.accept",
      delegationId: "del-v1",
      nodeId: "node-to",
      estimatedDurationMs: 3000,
    };
    expect(() => parseFrame(acceptFrame)).not.toThrow();
  });

  it("delegation.accept frame without optional estimatedDurationMs", () => {
    const acceptFrame = {
      kind: "delegation.accept",
      delegationId: "del-v1",
      nodeId: "node-to",
    };
    expect(() => parseFrame(acceptFrame)).not.toThrow();
  });

  it("delegation.result frame with completed status", () => {
    const resultFrame = {
      kind: "delegation.result",
      delegationId: "del-v1",
      status: "completed",
      result: { answer: 42 },
    };
    expect(() => parseFrame(resultFrame)).not.toThrow();
  });

  it("delegation.result frame with failed status and error", () => {
    const resultFrame = {
      kind: "delegation.result",
      delegationId: "del-v1",
      status: "failed",
      error: {
        type: "about:blank",
        title: "Node error",
        status: 500,
        detail: "Internal error",
      },
    };
    expect(() => parseFrame(resultFrame)).not.toThrow();
  });

  it("delegation.cancel frame validates correctly", () => {
    const cancelFrame = {
      kind: "delegation.cancel",
      delegationId: "del-v1",
      reason: "user cancelled",
    };
    expect(() => parseFrame(cancelFrame)).not.toThrow();
  });

  it("invalid delegation.request frame → parse error", () => {
    const invalid = {
      kind: "delegation.request",
      delegationId: "del-bad",
      // missing fromNodeId, toNodeId, etc.
    };
    const result = safeParseFrame(invalid);
    expect(result.success).toBe(false);
  });

  it("invalid delegation status → parse error", () => {
    const invalid = {
      kind: "delegation.result",
      delegationId: "del-bad",
      status: "invalid_status",
    };
    const result = safeParseFrame(invalid);
    expect(result.success).toBe(false);
  });

  it("delegation scope with all optional fields", () => {
    const reqFrame = {
      kind: "delegation.request",
      delegationId: "del-scope",
      fromNodeId: "node-from",
      toNodeId: "node-to",
      scope: {
        requiredCapabilities: ["text", "image"],
        requiredTools: ["search", "analyze"],
        maxDurationMs: 30000,
      },
      intent: "complex-task",
      payload: {
        id: "msg-1",
        lane: "steer",
        channelId: "ch-1",
        payload: { text: "hello" },
        timestamp: 1000,
      },
      fallbackNodeIds: [],
      timeoutMs: 60000,
    };
    expect(() => parseFrame(reqFrame)).not.toThrow();
  });

  it("delegation scope with empty object", () => {
    const reqFrame = {
      kind: "delegation.request",
      delegationId: "del-empty-scope",
      fromNodeId: "node-from",
      toNodeId: "node-to",
      scope: {},
      intent: "simple-task",
      payload: {
        id: "msg-1",
        lane: "steer",
        channelId: "ch-1",
        payload: null,
        timestamp: 1000,
      },
      fallbackNodeIds: [],
      timeoutMs: 5000,
    };
    expect(() => parseFrame(reqFrame)).not.toThrow();
  });
});
