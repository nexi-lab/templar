/**
 * E2E test — Spins up a local A2A-compatible JSON-RPC server and exercises
 * the full A2AClient + A2AMiddleware pipeline against it (discover → send →
 * get → cancel).
 *
 * No external dependencies needed — runs in CI without network access.
 */

import * as http from "node:http";
import type { ToolRequest } from "@templar/core";
import { A2aTaskFailedError, A2aTaskRejectedError } from "@templar/errors";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { A2AClient } from "../../a2a-client.js";
import { A2AMiddleware } from "../../middleware.js";

// ---------------------------------------------------------------------------
// Minimal A2A JSON-RPC Server
// ---------------------------------------------------------------------------

interface TaskStore {
  [id: string]: { state: string; message: string };
}

function createA2AServer(): {
  server: http.Server;
  port: number;
  tasks: TaskStore;
  start: () => Promise<number>;
  stop: () => Promise<void>;
} {
  const tasks: TaskStore = {};

  const agentCard = {
    name: "E2E Test Agent",
    description: "Local agent for E2E testing",
    version: "1.0.0",
    skills: [
      {
        id: "echo",
        name: "Echo",
        description: "Echoes back the user message",
        tags: ["echo", "test"],
      },
    ],
    capabilities: { streaming: false, pushNotifications: false },
    provider: { organization: "Templar E2E" },
  };

  let port = 0;

  const server = http.createServer((req, res) => {
    // Agent Card discovery
    if (req.url === "/.well-known/agent.json" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(agentCard));
      return;
    }

    // JSON-RPC endpoint
    if (req.method === "POST") {
      let body = "";
      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const rpc = JSON.parse(body);
          const result = handleJsonRpc(rpc, tasks);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, ...result }));
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: { code: -32700, message: "Parse error" },
            }),
          );
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return {
    server,
    get port() {
      return port;
    },
    tasks,
    start: () =>
      new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as { port: number };
          port = addr.port;
          resolve(port);
        });
      }),
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function handleJsonRpc(
  rpc: { method: string; params?: Record<string, unknown> },
  tasks: TaskStore,
): { result?: unknown; error?: unknown } {
  switch (rpc.method) {
    case "message/send": {
      const msg = rpc.params?.message as { parts?: Array<{ text?: string }> } | undefined;
      const text = msg?.parts?.[0]?.text ?? "";
      const taskId = `e2e-${Date.now()}`;

      // Special messages trigger different states
      if (text.startsWith("REJECT:")) {
        tasks[taskId] = { state: "REJECTED", message: text };
        return {
          result: {
            id: taskId,
            status: {
              state: "REJECTED",
              message: { role: "agent", parts: [{ text: text.slice(7) }] },
            },
            artifacts: [],
          },
        };
      }

      if (text.startsWith("FAIL:")) {
        tasks[taskId] = { state: "FAILED", message: text };
        return {
          result: {
            id: taskId,
            status: {
              state: "FAILED",
              message: { role: "agent", parts: [{ text: text.slice(5) }] },
            },
            artifacts: [],
          },
        };
      }

      if (text === "WORKING") {
        tasks[taskId] = { state: "WORKING", message: text };
        return {
          result: {
            id: taskId,
            status: {
              state: "WORKING",
              message: { role: "agent", parts: [{ text: "Working on it..." }] },
            },
            artifacts: [],
          },
        };
      }

      // Default: immediate completion
      tasks[taskId] = { state: "COMPLETED", message: text };
      return {
        result: {
          id: taskId,
          status: {
            state: "COMPLETED",
            message: { role: "agent", parts: [{ text: `Echo: ${text}` }] },
          },
          artifacts: [
            {
              id: "art-1",
              label: "Echo result",
              parts: [{ text: `Processed: ${text}` }],
            },
          ],
        },
      };
    }

    case "tasks/get": {
      const id = rpc.params?.id as string;
      const task = tasks[id];
      if (!task) {
        return { error: { code: -32001, message: "Task not found" } };
      }

      // Simulate async: WORKING tasks complete on second poll
      if (task.state === "WORKING") {
        task.state = "COMPLETED";
      }

      return {
        result: {
          id,
          status: {
            state: task.state,
            message: { role: "agent", parts: [{ text: task.message }] },
          },
          artifacts: [],
        },
      };
    }

    case "tasks/cancel": {
      const id = rpc.params?.id as string;
      const task = tasks[id];
      if (!task) {
        return { error: { code: -32001, message: "Task not found" } };
      }
      task.state = "CANCELED";
      return {
        result: {
          id,
          status: {
            state: "CANCELED",
            message: { role: "agent", parts: [{ text: "Task canceled" }] },
          },
          artifacts: [],
        },
      };
    }

    default:
      return { error: { code: -32002, message: `Method not supported: ${rpc.method}` } };
  }
}

// ---------------------------------------------------------------------------
// E2E Tests
// ---------------------------------------------------------------------------

describe("A2A E2E — local JSON-RPC server", () => {
  const a2aServer = createA2AServer();
  let baseUrl: string;

  beforeAll(async () => {
    const port = await a2aServer.start();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await a2aServer.stop();
  });

  // -------------------------------------------------------------------------
  // Discovery
  // -------------------------------------------------------------------------

  it("discovers the agent card from /.well-known/agent.json", async () => {
    const client = new A2AClient();
    const card = await client.discover(baseUrl);

    expect(card.name).toBe("E2E Test Agent");
    expect(card.url).toBe(baseUrl);
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]?.id).toBe("echo");
    expect(card.capabilities.streaming).toBe(false);
    expect(card.provider).toBe("Templar E2E");
  });

  it("caches the agent card across calls", async () => {
    const client = new A2AClient();
    const card1 = await client.discover(baseUrl);
    const card2 = await client.discover(baseUrl);
    expect(card1).toEqual(card2);
  });

  // -------------------------------------------------------------------------
  // Send Message — happy path
  // -------------------------------------------------------------------------

  it("sends a message and receives COMPLETED result", async () => {
    const client = new A2AClient();
    const result = await client.sendMessage(baseUrl, "Hello from E2E");

    expect(result.state).toBe("completed");
    expect(result.taskId).toMatch(/^e2e-/);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.parts[0]).toEqual({
      type: "text",
      text: "Echo: Hello from E2E",
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.label).toBe("Echo result");
  });

  // -------------------------------------------------------------------------
  // Send Message — polling (WORKING → COMPLETED)
  // -------------------------------------------------------------------------

  it("polls WORKING task to completion", async () => {
    const client = new A2AClient({
      pollIntervalMs: 50,
      taskTimeoutMs: 5_000,
    });
    const result = await client.sendMessage(baseUrl, "WORKING");

    expect(result.state).toBe("completed");
    expect(result.taskId).toMatch(/^e2e-/);
  });

  // -------------------------------------------------------------------------
  // Send Message — rejection
  // -------------------------------------------------------------------------

  it("throws A2aTaskRejectedError on rejected message", async () => {
    const client = new A2AClient();
    await expect(client.sendMessage(baseUrl, "REJECT:not allowed")).rejects.toThrow(
      A2aTaskRejectedError,
    );
  });

  // -------------------------------------------------------------------------
  // Send Message — failure
  // -------------------------------------------------------------------------

  it("throws A2aTaskFailedError on failed message", async () => {
    const client = new A2AClient();
    await expect(client.sendMessage(baseUrl, "FAIL:internal error")).rejects.toThrow(
      A2aTaskFailedError,
    );
  });

  // -------------------------------------------------------------------------
  // Get Task
  // -------------------------------------------------------------------------

  it("retrieves task state via getTask", async () => {
    // First send a message to create a task
    const client = new A2AClient();
    const sendResult = await client.sendMessage(baseUrl, "For get test");
    const result = await client.getTask(baseUrl, sendResult.taskId);

    expect(result.taskId).toBe(sendResult.taskId);
    expect(result.state).toBe("completed");
  });

  it("throws on getTask with nonexistent task ID", async () => {
    const client = new A2AClient();
    await expect(client.getTask(baseUrl, "nonexistent-id")).rejects.toThrow(A2aTaskRejectedError);
  });

  // -------------------------------------------------------------------------
  // Cancel Task
  // -------------------------------------------------------------------------

  it("cancels a task via cancelTask", async () => {
    const client = new A2AClient();
    const sendResult = await client.sendMessage(baseUrl, "For cancel test");
    const result = await client.cancelTask(baseUrl, sendResult.taskId);

    expect(result.state).toBe("canceled");
    expect(result.taskId).toBe(sendResult.taskId);
  });

  // -------------------------------------------------------------------------
  // Middleware Integration
  // -------------------------------------------------------------------------

  describe("middleware integration", () => {
    it("full flow: discover → send → get via middleware", async () => {
      const middleware = new A2AMiddleware({});
      const next = () => Promise.resolve({ output: "should not be called" });

      // Step 1: Discover
      const discoverRes = await middleware.wrapToolCall!(
        {
          toolName: "a2a_discover",
          input: { agent_url: baseUrl },
        } as ToolRequest,
        next,
      );
      const agentInfo = discoverRes.output as Record<string, unknown>;
      expect(agentInfo.name).toBe("E2E Test Agent");

      // Step 2: Send message
      const sendRes = await middleware.wrapToolCall!(
        {
          toolName: "a2a_send_message",
          input: { agent_url: baseUrl, message: "E2E middleware test" },
        } as ToolRequest,
        next,
      );
      const taskResult = sendRes.output as Record<string, unknown>;
      expect(taskResult.state).toBe("completed");
      expect(taskResult.taskId).toMatch(/^e2e-/);

      // Step 3: Get task
      const getRes = await middleware.wrapToolCall!(
        {
          toolName: "a2a_get_task",
          input: { agent_url: baseUrl, task_id: taskResult.taskId },
        } as ToolRequest,
        next,
      );
      const getResult = getRes.output as Record<string, unknown>;
      expect(getResult.state).toBe("completed");
    });

    it("cancel flow via middleware", async () => {
      const middleware = new A2AMiddleware({});
      const next = () => Promise.resolve({ output: "unused" });

      // Send first
      const sendRes = await middleware.wrapToolCall!(
        {
          toolName: "a2a_send_message",
          input: { agent_url: baseUrl, message: "For middleware cancel" },
        } as ToolRequest,
        next,
      );
      const taskId = (sendRes.output as Record<string, unknown>).taskId;

      // Cancel
      const cancelRes = await middleware.wrapToolCall!(
        {
          toolName: "a2a_cancel_task",
          input: { agent_url: baseUrl, task_id: taskId },
        } as ToolRequest,
        next,
      );
      const cancelResult = cancelRes.output as Record<string, unknown>;
      expect(cancelResult.state).toBe("canceled");
    });
  });

  // -------------------------------------------------------------------------
  // Cache invalidation
  // -------------------------------------------------------------------------

  it("invalidateAgent forces re-discovery on next call", async () => {
    const client = new A2AClient();

    // Populate cache
    const card1 = await client.discover(baseUrl);
    expect(card1.name).toBe("E2E Test Agent");

    // Invalidate
    expect(client.invalidateAgent(baseUrl)).toBe(true);
    expect(client.invalidateAgent(baseUrl)).toBe(false);

    // Re-discover (should hit the server again)
    const card2 = await client.discover(baseUrl);
    expect(card2.name).toBe("E2E Test Agent");
  });
});
