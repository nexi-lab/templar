/**
 * Contract Tests — AG-UI Schema Validation
 *
 * Validates that all events emitted by @templar/agui
 * conform to the AG-UI Zod schemas. This ensures
 * CopilotKit compatibility.
 */

import {
  CustomEventSchema,
  RunErrorEventSchema,
  RunFinishedEventSchema,
  RunStartedEventSchema,
  TextMessageContentEventSchema,
  TextMessageEndEventSchema,
  TextMessageStartEventSchema,
} from "@ag-ui/core";
import type { ButtonBlock, ContentBlock, FileBlock, ImageBlock, TextBlock } from "@templar/core";
import { describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../mappers/to-agui.js";
import { EventType } from "../protocol/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSchemaForEventType(type: string) {
  switch (type) {
    case EventType.TEXT_MESSAGE_START:
      return TextMessageStartEventSchema;
    case EventType.TEXT_MESSAGE_CONTENT:
      return TextMessageContentEventSchema;
    case EventType.TEXT_MESSAGE_END:
      return TextMessageEndEventSchema;
    case EventType.RUN_STARTED:
      return RunStartedEventSchema;
    case EventType.RUN_FINISHED:
      return RunFinishedEventSchema;
    case EventType.RUN_ERROR:
      return RunErrorEventSchema;
    case EventType.CUSTOM:
      return CustomEventSchema;
    default:
      throw new Error(`No schema for event type: ${type}`);
  }
}

// ---------------------------------------------------------------------------
// Contract tests for mappers
// ---------------------------------------------------------------------------

describe("Contract: mapper output validates against AG-UI schemas", () => {
  const textBlock: TextBlock = { type: "text", content: "Hello, world!" };
  const imageBlock: ImageBlock = {
    type: "image",
    url: "https://example.com/photo.png",
    alt: "A photo",
  };
  const fileBlock: FileBlock = {
    type: "file",
    url: "https://example.com/doc.pdf",
    filename: "doc.pdf",
    mimeType: "application/pdf",
  };
  const buttonBlock: ButtonBlock = {
    type: "button",
    buttons: [{ label: "OK", action: "ok", style: "primary" }],
  };

  const allBlocks: ContentBlock[] = [textBlock, imageBlock, fileBlock, buttonBlock];

  for (const block of allBlocks) {
    it(`${block.type} block events pass AG-UI schema validation`, () => {
      const events = mapBlockToEvents(block, "msg-contract-1");

      for (const event of events) {
        const schema = getSchemaForEventType(event.type);
        const result = schema.safeParse(event);
        if (!result.success) {
          throw new Error(
            `Event ${event.type} failed validation: ${JSON.stringify(result.error.issues)}`,
          );
        }
        expect(result.success).toBe(true);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Contract tests for lifecycle events
// ---------------------------------------------------------------------------

describe("Contract: lifecycle events validate against AG-UI schemas", () => {
  it("RUN_STARTED event passes schema validation", () => {
    const event = {
      type: EventType.RUN_STARTED,
      threadId: "thread-1",
      runId: "run-1",
    };
    const result = RunStartedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("RUN_FINISHED event passes schema validation", () => {
    const event = {
      type: EventType.RUN_FINISHED,
      threadId: "thread-1",
      runId: "run-1",
    };
    const result = RunFinishedEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("RUN_ERROR event passes schema validation", () => {
    const event = {
      type: EventType.RUN_ERROR,
      message: "Something went wrong",
    };
    const result = RunErrorEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it("RUN_ERROR with code passes schema validation", () => {
    const event = {
      type: EventType.RUN_ERROR,
      message: "Timeout exceeded",
      code: "AGUI_RUN_TIMEOUT",
    };
    const result = RunErrorEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Contract tests for edge cases
// ---------------------------------------------------------------------------

describe("Contract: edge case events validate against AG-UI schemas", () => {
  it("empty text content produces no events (AG-UI forbids empty delta)", () => {
    const events = mapBlockToEvents({ type: "text", content: "" }, "msg-1");
    expect(events).toHaveLength(0);
  });

  it("very long text content passes validation", () => {
    const events = mapBlockToEvents({ type: "text", content: "x".repeat(100_000) }, "msg-1");
    for (const event of events) {
      const schema = getSchemaForEventType(event.type);
      expect(schema.safeParse(event).success).toBe(true);
    }
  });

  it("unicode content passes validation", () => {
    const events = mapBlockToEvents({ type: "text", content: "Hello 🌍 你好 مرحبا" }, "msg-1");
    for (const event of events) {
      const schema = getSchemaForEventType(event.type);
      expect(schema.safeParse(event).success).toBe(true);
    }
  });

  it("image with special chars in alt passes validation", () => {
    const events = mapBlockToEvents(
      { type: "image", url: "https://example.com/pic.jpg", alt: "Photo [v2]" },
      "msg-1",
    );
    for (const event of events) {
      const schema = getSchemaForEventType(event.type);
      expect(schema.safeParse(event).success).toBe(true);
    }
  });
});
