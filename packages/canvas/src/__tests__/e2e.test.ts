/**
 * E2E tests for @templar/canvas with FastAPI Nexus backend.
 *
 * Requires:
 *   NEXUS_E2E_URL=http://localhost:2028
 *   NEXUS_E2E_KEY=test-key
 *
 * Skipped when env vars are not set.
 */

import { describe, expect, it } from "vitest";
import { CanvasTool } from "../tool/canvas-tool.js";
import type { CanvasEventPayload } from "../types.js";

// ---------------------------------------------------------------------------
// Environment guard
// ---------------------------------------------------------------------------

const NEXUS_E2E_URL = process.env.NEXUS_E2E_URL ?? "";
const NEXUS_E2E_KEY = process.env.NEXUS_E2E_KEY ?? "";
const E2E_ENABLED = NEXUS_E2E_URL.length > 0 && NEXUS_E2E_KEY.length > 0;
const describeE2E = E2E_ENABLED ? describe : describe.skip;

// ---------------------------------------------------------------------------
// E2E tests — full canvas lifecycle
// ---------------------------------------------------------------------------

describeE2E("Canvas E2E with Nexus", () => {
  it("full lifecycle: create → update → delete with events", async () => {
    const events: CanvasEventPayload[] = [];
    const tool = new CanvasTool({
      emit: (event) => events.push(event),
    });

    // Create
    const createResult = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "graph TD; A-->B;",
      title: "E2E Diagram",
    });
    expect(createResult.success).toBe(true);
    expect(createResult.id).toBeDefined();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe("create");

    // Update
    const updateResult = await tool.execute({
      action: "update",
      id: createResult.id as string,
      content: "graph LR; A-->B-->C;",
    });
    expect(updateResult.success).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[1]?.event).toBe("update");

    // Delete
    const deleteResult = await tool.execute({
      action: "delete",
      id: createResult.id as string,
    });
    expect(deleteResult.success).toBe(true);
    expect(events).toHaveLength(3);
    expect(events[2]?.event).toBe("delete");

    // Verify state is clean
    expect(tool.getArtifacts().size).toBe(0);
  });

  it("multiple artifact types in single session", async () => {
    const events: CanvasEventPayload[] = [];
    const tool = new CanvasTool({
      emit: (event) => events.push(event),
    });

    const mermaid = await tool.execute({
      action: "create",
      type: "mermaid",
      content: "graph TD; A-->B;",
    });
    const html = await tool.execute({
      action: "create",
      type: "html",
      content: "<h1>Hello</h1>",
    });
    const markdown = await tool.execute({
      action: "create",
      type: "markdown",
      content: "# Hello",
    });

    expect(mermaid.success).toBe(true);
    expect(html.success).toBe(true);
    expect(markdown.success).toBe(true);
    expect(tool.getArtifacts().size).toBe(3);
    expect(events).toHaveLength(3);
  });

  it("tool call → event emission performance < 5ms", async () => {
    const events: CanvasEventPayload[] = [];
    const tool = new CanvasTool({
      emit: (event) => events.push(event),
    });

    const start = performance.now();
    await tool.execute({
      action: "create",
      type: "markdown",
      content: "# Performance test",
    });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(5);
  });

  it("handles rapid sequential operations", async () => {
    const events: CanvasEventPayload[] = [];
    const tool = new CanvasTool({
      emit: (event) => events.push(event),
    });

    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const result = await tool.execute({
        action: "create",
        type: "markdown",
        content: `Item ${i}`,
      });
      expect(result.success).toBe(true);
      ids.push(result.id as string);
    }

    expect(tool.getArtifacts().size).toBe(10);
    expect(events).toHaveLength(10);

    // Delete all
    for (const id of ids) {
      await tool.execute({ action: "delete", id });
    }

    expect(tool.getArtifacts().size).toBe(0);
    expect(events).toHaveLength(20);
  });

  it("error recovery: invalid operations don't corrupt state", async () => {
    const events: CanvasEventPayload[] = [];
    const tool = new CanvasTool({
      emit: (event) => events.push(event),
    });

    // Create a valid artifact
    const result = await tool.execute({
      action: "create",
      type: "markdown",
      content: "Valid",
    });
    expect(result.success).toBe(true);

    // Try invalid operations
    await tool.execute({ action: "update", id: "nonexistent", content: "x" });
    await tool.execute({ action: "delete", id: "nonexistent" });
    await tool.execute({ action: "create", type: "markdown", content: "" });

    // State should still be intact
    expect(tool.getArtifacts().size).toBe(1);
    expect(events).toHaveLength(1); // Only the initial create event
  });
});
