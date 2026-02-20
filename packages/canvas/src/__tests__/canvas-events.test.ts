import { describe, expect, it } from "vitest";
import { CANVAS_EVENT_NAME, createCanvasCustomEvent } from "../events/canvas-events.js";
import type { CanvasEventPayload } from "../types.js";

describe("createCanvasCustomEvent", () => {
  it("returns correct shape for create event", () => {
    const payload: CanvasEventPayload = {
      event: "create",
      artifact: {
        id: "test-id",
        content: { type: "mermaid", content: "graph TD; A-->B;" },
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
    };

    const event = createCanvasCustomEvent(payload);

    expect(event.type).toBe("custom");
    expect(event.name).toBe("templar.canvas");
    expect(event.value).toBe(payload);
  });

  it("returns correct shape for update event", () => {
    const payload: CanvasEventPayload = {
      event: "update",
      id: "test-id",
      content: { type: "html", content: "<p>Updated</p>" },
      updatedAt: "2024-01-01T01:00:00.000Z",
    };

    const event = createCanvasCustomEvent(payload);

    expect(event.type).toBe("custom");
    expect(event.name).toBe("templar.canvas");
    expect(event.value.event).toBe("update");
  });

  it("returns correct shape for delete event", () => {
    const payload: CanvasEventPayload = {
      event: "delete",
      id: "test-id",
    };

    const event = createCanvasCustomEvent(payload);

    expect(event.type).toBe("custom");
    expect(event.name).toBe("templar.canvas");
    expect(event.value.event).toBe("delete");
  });

  it("always uses the templar.canvas event name", () => {
    expect(CANVAS_EVENT_NAME).toBe("templar.canvas");

    const payloads: CanvasEventPayload[] = [
      {
        event: "create",
        artifact: {
          id: "1",
          content: { type: "markdown", content: "# Hi" },
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      },
      {
        event: "update",
        id: "1",
        content: { type: "markdown", content: "# Updated" },
        updatedAt: "2024-01-01T01:00:00.000Z",
      },
      { event: "delete", id: "1" },
    ];

    for (const payload of payloads) {
      expect(createCanvasCustomEvent(payload).name).toBe("templar.canvas");
    }
  });
});
