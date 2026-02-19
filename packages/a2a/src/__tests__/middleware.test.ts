import type { ToolRequest, ToolResponse } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A2AMiddleware } from "../middleware.js";
import {
  createJsonRpcSuccess,
  createRawAgentCard,
  createRawTaskResult,
  mockFetchResponse,
} from "./helpers.js";

describe("A2AMiddleware", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createMiddleware(config?: Record<string, unknown>): A2AMiddleware {
    return new A2AMiddleware({ ...config } as never);
  }

  // -------------------------------------------------------------------------
  // Pass-through
  // -------------------------------------------------------------------------

  it("passes through non-matching tool calls", async () => {
    const middleware = createMiddleware();
    const req: ToolRequest = {
      toolName: "other_tool",
      input: { data: "something" },
    };
    const expected: ToolResponse = { output: "other result" };
    const next = vi.fn().mockResolvedValue(expected);

    const response = await middleware.wrapToolCall!(req, next);

    expect(next).toHaveBeenCalledWith(req);
    expect(response).toBe(expected);
  });

  // -------------------------------------------------------------------------
  // a2a_discover
  // -------------------------------------------------------------------------

  it("intercepts a2a_discover and returns agent info", async () => {
    const rawCard = createRawAgentCard();
    globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

    const middleware = createMiddleware();
    const req: ToolRequest = {
      toolName: "a2a_discover",
      input: { agent_url: "https://agent.com" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);

    expect(next).not.toHaveBeenCalled();
    const output = response.output as Record<string, unknown>;
    expect(output.name).toBe("Test Agent");
    expect(response.metadata).toEqual({
      provider: "a2a",
      operation: "discover",
    });
  });

  // -------------------------------------------------------------------------
  // a2a_send_message
  // -------------------------------------------------------------------------

  it("intercepts a2a_send_message and returns task result", async () => {
    const taskResult = createRawTaskResult("completed");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

    const middleware = createMiddleware();
    const req: ToolRequest = {
      toolName: "a2a_send_message",
      input: {
        agent_url: "https://agent.com",
        message: "Hello agent",
      },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);

    expect(next).not.toHaveBeenCalled();
    const output = response.output as Record<string, unknown>;
    expect(output.state).toBe("completed");
    expect(response.metadata).toMatchObject({
      provider: "a2a",
      operation: "send_message",
    });
  });

  // -------------------------------------------------------------------------
  // a2a_get_task
  // -------------------------------------------------------------------------

  it("intercepts a2a_get_task and returns task state", async () => {
    const taskResult = createRawTaskResult("working");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

    const middleware = createMiddleware();
    const req: ToolRequest = {
      toolName: "a2a_get_task",
      input: { agent_url: "https://agent.com", task_id: "task-123" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);

    expect(next).not.toHaveBeenCalled();
    const output = response.output as Record<string, unknown>;
    expect(output.state).toBe("working");
    expect(response.metadata).toMatchObject({
      provider: "a2a",
      operation: "get_task",
      taskId: "task-123",
    });
  });

  // -------------------------------------------------------------------------
  // a2a_cancel_task
  // -------------------------------------------------------------------------

  it("intercepts a2a_cancel_task and returns task state", async () => {
    const taskResult = createRawTaskResult("canceled");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(taskResult)));

    const middleware = createMiddleware();
    const req: ToolRequest = {
      toolName: "a2a_cancel_task",
      input: { agent_url: "https://agent.com", task_id: "task-123" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.metadata).toMatchObject({
      provider: "a2a",
      operation: "cancel_task",
    });
  });

  // -------------------------------------------------------------------------
  // Custom prefix
  // -------------------------------------------------------------------------

  it("uses custom tool prefix", async () => {
    const rawCard = createRawAgentCard();
    globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(rawCard));

    const middleware = new A2AMiddleware({ toolPrefix: "remote" });
    const req: ToolRequest = {
      toolName: "remote_discover",
      input: { agent_url: "https://agent.com" },
    };
    const next = vi.fn();

    const response = await middleware.wrapToolCall!(req, next);
    expect(next).not.toHaveBeenCalled();
    expect((response.output as Record<string, unknown>).name).toBe("Test Agent");
  });

  it("does not intercept default prefix when custom is set", async () => {
    const middleware = new A2AMiddleware({ toolPrefix: "remote" });
    const req: ToolRequest = {
      toolName: "a2a_discover",
      input: { agent_url: "https://agent.com" },
    };
    const expected: ToolResponse = { output: "passthrough" };
    const next = vi.fn().mockResolvedValue(expected);

    const response = await middleware.wrapToolCall!(req, next);
    expect(next).toHaveBeenCalledWith(req);
    expect(response).toBe(expected);
  });
});
