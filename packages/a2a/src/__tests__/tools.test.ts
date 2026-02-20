import { describe, expect, it } from "vitest";
import { buildA2aTools } from "../tools.js";

describe("buildA2aTools", () => {
  it("returns 4 tools with default prefix", () => {
    const tools = buildA2aTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "a2a_discover",
      "a2a_send_message",
      "a2a_get_task",
      "a2a_cancel_task",
    ]);
  });

  it("applies custom prefix", () => {
    const tools = buildA2aTools("remote");
    expect(tools.map((t) => t.name)).toEqual([
      "remote_discover",
      "remote_send_message",
      "remote_get_task",
      "remote_cancel_task",
    ]);
  });

  it("discover tool requires agent_url", () => {
    const tools = buildA2aTools();
    const discover = tools[0]!;
    const params = discover.parameters as Record<string, unknown>;
    expect(params.required).toEqual(["agent_url"]);
  });

  it("send_message tool requires agent_url and message", () => {
    const tools = buildA2aTools();
    const send = tools[1]!;
    const params = send.parameters as Record<string, unknown>;
    expect(params.required).toEqual(["agent_url", "message"]);
  });

  it("get_task tool requires agent_url and task_id", () => {
    const tools = buildA2aTools();
    const get = tools[2]!;
    const params = get.parameters as Record<string, unknown>;
    expect(params.required).toEqual(["agent_url", "task_id"]);
  });

  it("cancel_task tool requires agent_url and task_id", () => {
    const tools = buildA2aTools();
    const cancel = tools[3]!;
    const params = cancel.parameters as Record<string, unknown>;
    expect(params.required).toEqual(["agent_url", "task_id"]);
  });

  it("all tools have descriptions", () => {
    const tools = buildA2aTools();
    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });
});
