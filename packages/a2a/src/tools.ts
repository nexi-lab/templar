/**
 * A2A tool definitions for the LLM agent pipeline.
 *
 * Four granular tools mapping 1:1 to A2A protocol operations:
 *   - a2a_discover       → Fetch Agent Card
 *   - a2a_send_message   → Send message and await result
 *   - a2a_get_task       → Poll task status
 *   - a2a_cancel_task    → Cancel running task
 */

import type { ToolConfig } from "@templar/core";

/**
 * Build the 4 A2A tool definitions with optional name prefix.
 */
export function buildA2aTools(prefix = "a2a"): readonly ToolConfig[] {
  return [
    {
      name: `${prefix}_discover`,
      description:
        "Discover a remote A2A agent by URL. Returns the agent's name, skills, and capabilities. " +
        "Use this before sending messages to verify the agent can handle your request.",
      parameters: {
        type: "object",
        properties: {
          agent_url: {
            type: "string",
            description: "The base URL of the remote A2A agent (e.g. https://agent.example.com)",
          },
        },
        required: ["agent_url"],
      },
    },
    {
      name: `${prefix}_send_message`,
      description:
        "Send a message to a remote A2A agent and wait for the response. " +
        "The remote agent will process the message and return a result. " +
        "If the task is long-running, this will poll until completion.",
      parameters: {
        type: "object",
        properties: {
          agent_url: {
            type: "string",
            description: "The base URL of the remote A2A agent",
          },
          message: {
            type: "string",
            description: "The message to send to the remote agent",
          },
          context_id: {
            type: "string",
            description: "Optional context ID for multi-turn conversations with the same agent",
          },
        },
        required: ["agent_url", "message"],
      },
    },
    {
      name: `${prefix}_get_task`,
      description:
        "Get the current status and results of a previously sent A2A task. " +
        "Use this to check on tasks that returned 'input_required' or 'auth_required' states.",
      parameters: {
        type: "object",
        properties: {
          agent_url: {
            type: "string",
            description: "The base URL of the remote A2A agent",
          },
          task_id: {
            type: "string",
            description: "The task ID returned from a previous send_message call",
          },
        },
        required: ["agent_url", "task_id"],
      },
    },
    {
      name: `${prefix}_cancel_task`,
      description: "Cancel a running A2A task. Use when a task is no longer needed.",
      parameters: {
        type: "object",
        properties: {
          agent_url: {
            type: "string",
            description: "The base URL of the remote A2A agent",
          },
          task_id: {
            type: "string",
            description: "The task ID to cancel",
          },
        },
        required: ["agent_url", "task_id"],
      },
    },
  ];
}
