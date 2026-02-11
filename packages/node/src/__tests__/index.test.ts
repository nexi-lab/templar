import { describe, expect, it } from "vitest";
import { NODE_STATES, NodeConfigSchema, TemplarNode } from "../index.js";

describe("@templar/node exports", () => {
  it("should export TemplarNode class", () => {
    expect(TemplarNode).toBeDefined();
    expect(typeof TemplarNode).toBe("function");
  });

  it("should export NodeConfigSchema", () => {
    expect(NodeConfigSchema).toBeDefined();
  });

  it("should export NODE_STATES", () => {
    expect(NODE_STATES).toEqual(["disconnected", "connecting", "connected", "reconnecting"]);
  });
});
