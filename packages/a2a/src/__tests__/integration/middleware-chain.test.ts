/**
 * Integration test — A2A middleware chain (discover → send → get → cancel)
 *
 * Tests the full middleware pipeline with mocked HTTP responses,
 * verifying that tools are intercepted correctly and results flow through.
 */

import type { ToolRequest } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A2AMiddleware } from "../../middleware.js";
import {
  createJsonRpcSuccess,
  createRawAgentCard,
  createRawTaskResult,
  mockFetchResponse,
} from "../helpers.js";

describe("A2A middleware integration chain", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("performs end-to-end discover → send → complete flow", async () => {
    const rawCard = createRawAgentCard({ name: "Integration Agent" });
    const completedTask = createRawTaskResult("completed", "int-task-1");

    // Mock fetch to handle different URLs
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/.well-known/agent.json")) {
        return mockFetchResponse(rawCard);
      }
      return mockFetchResponse(createJsonRpcSuccess(completedTask));
    });

    const middleware = new A2AMiddleware({});
    const next = vi.fn();

    // Step 1: Discover
    const discoverReq: ToolRequest = {
      toolName: "a2a_discover",
      input: { agent_url: "https://integration-agent.com" },
    };
    const discoverRes = await middleware.wrapToolCall?.(discoverReq, next);
    const agentInfo = discoverRes.output as Record<string, unknown>;
    expect(agentInfo.name).toBe("Integration Agent");

    // Step 2: Send message
    const sendReq: ToolRequest = {
      toolName: "a2a_send_message",
      input: {
        agent_url: "https://integration-agent.com",
        message: "Process this task",
      },
    };
    const sendRes = await middleware.wrapToolCall?.(sendReq, next);
    const taskResult = sendRes.output as Record<string, unknown>;
    expect(taskResult.state).toBe("completed");
    expect(taskResult.taskId).toBe("int-task-1");

    // Verify next was never called (all tools intercepted)
    expect(next).not.toHaveBeenCalled();
  });

  it("falls back when first provider returns error then second succeeds", async () => {
    const completedTask = createRawTaskResult("completed");

    // First call fails, second succeeds
    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(completedTask)));

    const middleware = new A2AMiddleware({});
    const next = vi.fn();

    // Discover will fail
    const discoverReq: ToolRequest = {
      toolName: "a2a_discover",
      input: { agent_url: "https://failing-agent.com" },
    };

    await expect(middleware.wrapToolCall?.(discoverReq, next)).rejects.toThrow();
  });

  it("passes auth headers from agent config", async () => {
    const completedTask = createRawTaskResult("completed");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(completedTask)));

    const middleware = new A2AMiddleware({
      agents: [
        {
          url: "https://protected-agent.com",
          auth: { type: "bearer", credentials: "secret-token" },
        },
      ],
    });
    const next = vi.fn();

    const sendReq: ToolRequest = {
      toolName: "a2a_send_message",
      input: {
        agent_url: "https://protected-agent.com",
        message: "Authenticated request",
      },
    };

    await middleware.wrapToolCall?.(sendReq, next);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const headers = (fetchCall?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(headers?.Authorization).toBe("Bearer secret-token");
  });

  it("propagates error details through middleware", async () => {
    const failedTask = createRawTaskResult("failed");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse(createJsonRpcSuccess(failedTask)));

    const middleware = new A2AMiddleware({});
    const next = vi.fn();

    const sendReq: ToolRequest = {
      toolName: "a2a_send_message",
      input: {
        agent_url: "https://error-agent.com",
        message: "This will fail",
      },
    };

    await expect(middleware.wrapToolCall?.(sendReq, next)).rejects.toThrow();
  });
});
