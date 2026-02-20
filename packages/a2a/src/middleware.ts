/**
 * A2AMiddleware — wrapToolCall integration for the agent pipeline.
 *
 * Intercepts a2a_* tool calls and delegates to A2AClient.
 */

import type { TemplarMiddleware, ToolHandler, ToolRequest, ToolResponse } from "@templar/core";
import { A2AClient } from "./a2a-client.js";
import type { A2aAuthConfig, A2aMiddlewareConfig } from "./types.js";
import { DEFAULT_TOOL_PREFIX } from "./types.js";
import { A2aMiddlewareConfigSchema } from "./validation.js";

export class A2AMiddleware implements TemplarMiddleware {
  readonly name = "a2a";
  private readonly client: A2AClient;
  private readonly toolPrefix: string;

  constructor(config: A2aMiddlewareConfig) {
    const authMap = new Map<string, A2aAuthConfig>();
    if (config.agents) {
      for (const agent of config.agents) {
        if (agent.auth) {
          authMap.set(agent.url.replace(/\/+$/, ""), agent.auth);
        }
      }
    }
    this.client = new A2AClient(config, authMap);
    this.toolPrefix = config.toolPrefix ?? DEFAULT_TOOL_PREFIX;
  }

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    const { toolName } = req;

    if (toolName === `${this.toolPrefix}_discover`) {
      return this.handleDiscover(req);
    }
    if (toolName === `${this.toolPrefix}_send_message`) {
      return this.handleSendMessage(req);
    }
    if (toolName === `${this.toolPrefix}_get_task`) {
      return this.handleGetTask(req);
    }
    if (toolName === `${this.toolPrefix}_cancel_task`) {
      return this.handleCancelTask(req);
    }

    return next(req);
  }

  private async handleDiscover(req: ToolRequest): Promise<ToolResponse> {
    const input = req.input as Record<string, unknown> | undefined;
    const agentUrl = typeof input?.agent_url === "string" ? input.agent_url : "";

    const agentInfo = await this.client.discover(agentUrl);

    return {
      output: agentInfo,
      metadata: { provider: "a2a", operation: "discover" },
    };
  }

  private async handleSendMessage(req: ToolRequest): Promise<ToolResponse> {
    const input = req.input as Record<string, unknown> | undefined;
    const agentUrl = typeof input?.agent_url === "string" ? input.agent_url : "";
    const message = typeof input?.message === "string" ? input.message : "";
    const contextId = typeof input?.context_id === "string" ? input.context_id : undefined;

    const options = contextId !== undefined ? { contextId } : {};
    const result = await this.client.sendMessage(agentUrl, message, options);

    return {
      output: result,
      metadata: {
        provider: "a2a",
        operation: "send_message",
        taskId: result.taskId,
        state: result.state,
      },
    };
  }

  private async handleGetTask(req: ToolRequest): Promise<ToolResponse> {
    const input = req.input as Record<string, unknown> | undefined;
    const agentUrl = typeof input?.agent_url === "string" ? input.agent_url : "";
    const taskId = typeof input?.task_id === "string" ? input.task_id : "";

    const result = await this.client.getTask(agentUrl, taskId);

    return {
      output: result,
      metadata: {
        provider: "a2a",
        operation: "get_task",
        taskId: result.taskId,
        state: result.state,
      },
    };
  }

  private async handleCancelTask(req: ToolRequest): Promise<ToolResponse> {
    const input = req.input as Record<string, unknown> | undefined;
    const agentUrl = typeof input?.agent_url === "string" ? input.agent_url : "";
    const taskId = typeof input?.task_id === "string" ? input.task_id : "";

    const result = await this.client.cancelTask(agentUrl, taskId);

    return {
      output: result,
      metadata: {
        provider: "a2a",
        operation: "cancel_task",
        taskId: result.taskId,
        state: result.state,
      },
    };
  }
}

/**
 * Factory — creates a validated A2AMiddleware.
 */
export function createA2aMiddleware(config: A2aMiddlewareConfig): A2AMiddleware {
  A2aMiddlewareConfigSchema.parse(config);
  return new A2AMiddleware(config);
}
