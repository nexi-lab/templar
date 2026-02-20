import { describe, expect, it } from "vitest";
import { CanvasTool } from "../tool/canvas-tool.js";
import type { CanvasEventPayload } from "../types.js";

function createTool(
  overrides: Record<string, unknown> = {},
  startTime: number = 1_700_000_000_000,
) {
  let now = startTime;
  const events: CanvasEventPayload[] = [];
  const tool = new CanvasTool({
    emit: (event) => events.push(event),
    clock: { now: () => now },
    config: overrides as Record<string, unknown>,
  });
  const advanceTime = (ms: number) => {
    now += ms;
  };
  return { tool, events, advanceTime, getTime: () => now };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

describe("CanvasTool — create", () => {
  it("creates a mermaid artifact and emits create event", async () => {
    const { tool, events } = createTool();
    const result = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "graph TD; A-->B;",
    });

    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("create");
    if (events[0]?.event === "create") {
      expect(events[0]?.artifact.content.type).toBe("mermaid");
      expect(events[0]?.artifact.content.content).toBe("graph TD; A-->B;");
    }
  });

  it("creates an HTML artifact and emits create event", async () => {
    const { tool, events } = createTool();
    const result = await tool.execute({
      action: "create",
      type: "html",
      content: "<h1>Hello</h1>",
      title: "Test HTML",
    });

    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    if (events[0]?.event === "create") {
      expect(events[0]?.artifact.content.type).toBe("html");
      expect(events[0]?.artifact.title).toBe("Test HTML");
    }
  });

  it("creates a markdown artifact and emits create event", async () => {
    const { tool, events } = createTool();
    const result = await tool.execute({
      action: "create",
      type: "markdown",
      content: "# Hello World",
    });

    expect(result.success).toBe(true);
    if (events[0]?.event === "create") {
      expect(events[0]?.artifact.content.type).toBe("markdown");
    }
  });

  it("returns unique IDs for each artifact", async () => {
    const { tool } = createTool();
    const r1 = await tool.execute({ action: "create", type: "markdown", content: "A" });
    const r2 = await tool.execute({ action: "create", type: "markdown", content: "B" });

    expect(r1.id).toBeDefined();
    expect(r2.id).toBeDefined();
    expect(r1.id).not.toBe(r2.id);
  });

  it("rejects empty content", async () => {
    const { tool } = createTool();
    const result = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("rejects content exceeding maxContentSize", async () => {
    const { tool } = createTool({ maxContentSize: 10 });
    const result = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "A".repeat(20),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Content too large");
  });

  it("rejects when maxArtifacts limit is reached", async () => {
    const { tool } = createTool({ maxArtifacts: 2 });
    await tool.execute({ action: "create", type: "markdown", content: "A" });
    await tool.execute({ action: "create", type: "markdown", content: "B" });
    const result = await tool.execute({ action: "create", type: "markdown", content: "C" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Artifact limit exceeded");
  });

  it("rejects disallowed artifact type", async () => {
    const { tool } = createTool({ allowedTypes: ["markdown"] });
    const result = await tool.execute({
      action: "create",
      type: "html",
      content: "<p>test</p>",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not allowed");
  });
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

describe("CanvasTool — update", () => {
  it("updates existing artifact and emits update event", async () => {
    const { tool, events, advanceTime } = createTool();
    const created = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "graph TD; A-->B;",
    });
    advanceTime(5000);

    const result = await tool.execute({
      action: "update",
      id: created.id as string,
      content: "graph LR; A-->B;",
    });

    expect(result.success).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[1]?.event).toBe("update");
    if (events[1]?.event === "update") {
      expect(events[1]?.content.content).toBe("graph LR; A-->B;");
    }
  });

  it("changes updatedAt timestamp on update", async () => {
    const { tool, events, advanceTime } = createTool();
    await tool.execute({ action: "create", type: "markdown", content: "A" });
    const createEvent = events[0];
    advanceTime(10_000);

    if (createEvent?.event === "create") {
      await tool.execute({
        action: "update",
        id: createEvent.artifact.id,
        content: "B",
      });
    }

    const updateEvent = events[1];
    if (createEvent?.event === "create" && updateEvent?.event === "update") {
      expect(updateEvent.updatedAt).not.toBe(createEvent.artifact.createdAt);
    }
  });

  it("returns error for non-existent artifact", async () => {
    const { tool } = createTool();
    const result = await tool.execute({
      action: "update",
      id: "non-existent-id",
      content: "new content",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Artifact not found");
  });

  it("rejects oversized content on update", async () => {
    const { tool } = createTool({ maxContentSize: 10 });
    const created = await tool.execute({ action: "create", type: "markdown", content: "short" });

    const result = await tool.execute({
      action: "update",
      id: created.id as string,
      content: "A".repeat(20),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Content too large");
  });
});

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

describe("CanvasTool — delete", () => {
  it("deletes existing artifact and emits delete event", async () => {
    const { tool, events } = createTool();
    const created = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "graph TD; A-->B;",
    });

    const result = await tool.execute({ action: "delete", id: created.id as string });

    expect(result.success).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[1]?.event).toBe("delete");
    if (events[1]?.event === "delete") {
      expect(events[1]?.id).toBe(created.id);
    }
    expect(tool.getArtifacts().size).toBe(0);
  });

  it("returns error for non-existent artifact", async () => {
    const { tool } = createTool();
    const result = await tool.execute({ action: "delete", id: "non-existent-id" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Artifact not found");
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("CanvasTool — validation", () => {
  it("rejects invalid action type", async () => {
    const { tool } = createTool();
    const result = await tool.execute({ action: "invalid" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("rejects completely invalid input", async () => {
    const { tool } = createTool();
    const result = await tool.execute("not an object");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid input");
  });

  it("rejects null input", async () => {
    const { tool } = createTool();
    const result = await tool.execute(null);

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// State immutability
// ---------------------------------------------------------------------------

describe("CanvasTool — immutability", () => {
  it("getArtifacts returns a ReadonlyMap that does not change on further mutations", async () => {
    const { tool } = createTool();
    await tool.execute({ action: "create", type: "markdown", content: "A" });

    const snapshot = tool.getArtifacts();
    expect(snapshot.size).toBe(1);

    await tool.execute({ action: "create", type: "markdown", content: "B" });
    // Snapshot should still be 1 (immutable)
    expect(snapshot.size).toBe(1);
    // Current state should be 2
    expect(tool.getArtifacts().size).toBe(2);
  });
});
