/**
 * E2E Tests — AG-UI Server Full Flow
 *
 * Exercises the complete request → SSE stream → event parsing
 * flow through the real server with multiple handler scenarios.
 */

import * as http from "node:http";
import type { ContentBlock } from "@templar/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../../mappers/to-agui.js";
import type { AgUiEvent } from "../../protocol/types.js";
import { EventType } from "../../protocol/types.js";
import { AgUiServer, type RunHandler } from "../../server/agui-server.js";

// ---------------------------------------------------------------------------
// SSE Client Helper
// ---------------------------------------------------------------------------

interface SSEResult {
  status: number;
  headers: Record<string, string>;
  events: AgUiEvent[];
  rawChunks: string[];
}

async function sseRequest(port: number, body: Record<string, unknown>): Promise<SSEResult> {
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const events: AgUiEvent[] = [];
        const rawChunks: string[] = [];
        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          const str = chunk.toString();
          rawChunks.push(str);
          buffer += str;
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (part.startsWith("data: ")) {
              events.push(JSON.parse(part.slice(6)) as AgUiEvent);
            }
          }
        });

        res.on("end", () => {
          if (buffer.startsWith("data: ")) {
            events.push(JSON.parse(buffer.slice(6)) as AgUiEvent);
          }

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") {
              headers[key] = value;
            }
          }

          resolve({ status: res.statusCode ?? 0, headers, events, rawChunks });
        });

        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function validInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    threadId: "thread-e2e",
    runId: "run-e2e",
    messages: [{ id: "m-1", role: "user", content: "Hello from E2E" }],
    tools: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// E2E: Full round-trip with content block mapping
// ---------------------------------------------------------------------------

describe("E2E: AG-UI server full round-trip", () => {
  let server: AgUiServer;
  let port: number;

  /**
   * Handler that simulates a real agent: receives messages,
   * generates content blocks, maps them to AG-UI events.
   */
  const agentHandler: RunHandler = async (input, emit) => {
    const userContent =
      typeof (input.messages[0] as { content?: string })?.content === "string"
        ? (input.messages[0] as { content: string }).content
        : "no content";

    // Simulate agent producing multiple content blocks
    const blocks: ContentBlock[] = [
      { type: "text", content: `Echo: ${userContent}` },
      { type: "image", url: "https://example.com/photo.png", alt: "Result" },
      {
        type: "button",
        buttons: [
          { label: "Retry", action: "retry", style: "primary" },
          { label: "Cancel", action: "cancel", style: "secondary" },
        ],
      },
    ];

    // Map each block to AG-UI events and emit them
    for (const block of blocks) {
      const events = mapBlockToEvents(block, `msg-${block.type}`);
      for (const event of events) {
        emit(event);
      }
    }
  };

  beforeAll(async () => {
    port = 19700 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 10,
      maxStreamDurationMs: 10000,
      heartbeatIntervalMs: 60000,
      runHandler: agentHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("completes full request → SSE stream → events round-trip", async () => {
    const result = await sseRequest(port, validInput());

    // Verify HTTP layer
    expect(result.status).toBe(200);
    expect(result.headers["content-type"]).toBe("text/event-stream");
    expect(result.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(result.headers["x-accel-buffering"]).toBe("no");

    // Verify lifecycle wrapping
    expect(result.events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(result.events[result.events.length - 1]?.type).toBe(EventType.RUN_FINISHED);

    // Verify all event types present
    const types = result.events.map((e) => e.type);
    expect(types).toContain(EventType.TEXT_MESSAGE_START);
    expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types).toContain(EventType.TEXT_MESSAGE_END);
    expect(types).toContain(EventType.CUSTOM);
  });

  it("preserves user input through the full pipeline", async () => {
    const result = await sseRequest(
      port,
      validInput({
        messages: [{ id: "m-1", role: "user", content: "Test message 42" }],
      }),
    );

    // Find the first text content event (after RUN_STARTED)
    const contentEvents = result.events.filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT);
    expect(contentEvents.length).toBeGreaterThan(0);

    const firstContent = contentEvents[0] as { delta: string };
    expect(firstContent.delta).toContain("Test message 42");
  });

  it("maps image blocks to markdown in text events", async () => {
    const result = await sseRequest(port, validInput());

    const contentEvents = result.events.filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT);

    // Second content event should be the image as markdown
    const imageContent = contentEvents.find((e) => (e as { delta: string }).delta.includes("!["));
    expect(imageContent).toBeDefined();
    expect((imageContent as { delta: string }).delta).toContain(
      "![Result](https://example.com/photo.png)",
    );
  });

  it("maps button blocks to custom events with full metadata", async () => {
    const result = await sseRequest(port, validInput());

    const customEvents = result.events.filter((e) => e.type === EventType.CUSTOM);
    expect(customEvents).toHaveLength(1);

    const custom = customEvents[0] as {
      name: string;
      value: { buttons: Array<{ label: string; action: string }> };
    };
    expect(custom.name).toBe("templar.buttons");
    expect(custom.value.buttons).toHaveLength(2);
    expect(custom.value.buttons[0]?.label).toBe("Retry");
    expect(custom.value.buttons[1]?.label).toBe("Cancel");
  });

  it("includes threadId and runId in lifecycle events", async () => {
    const result = await sseRequest(port, validInput({ threadId: "t-e2e-42", runId: "r-e2e-99" }));

    const started = result.events[0] as { threadId: string; runId: string };
    expect(started.threadId).toBe("t-e2e-42");
    expect(started.runId).toBe("r-e2e-99");

    const finished = result.events[result.events.length - 1] as {
      threadId: string;
      runId: string;
    };
    expect(finished.threadId).toBe("t-e2e-42");
    expect(finished.runId).toBe("r-e2e-99");
  });

  it("SSE wire format has correct data: prefix and double-newline separators", async () => {
    const result = await sseRequest(port, validInput());
    const raw = result.rawChunks.join("");

    // Every event should be formatted as "data: {...}\n\n"
    const dataLines = raw.split("\n\n").filter((l) => l.startsWith("data: "));
    expect(dataLines.length).toBeGreaterThan(0);

    // Each data line should be valid JSON after stripping prefix
    for (const line of dataLines) {
      const json = line.slice(6);
      expect(() => JSON.parse(json)).not.toThrow();
    }
  });

  it("handles multiple sequential requests correctly", async () => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const result = await sseRequest(port, validInput({ runId: `sequential-${i}` }));
      results.push(result);
    }

    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.events[0]?.type).toBe(EventType.RUN_STARTED);
      expect(result.events[result.events.length - 1]?.type).toBe(EventType.RUN_FINISHED);
    }

    // Connections should all be released
    expect(server.activeConnections).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Trace context propagation (E2E)
  // -----------------------------------------------------------------------

  it("includes traceId in lifecycle events across full round-trip", async () => {
    const result = await sseRequest(port, validInput());

    const started = result.events[0] as unknown as Record<string, unknown>;
    const finished = result.events[result.events.length - 1] as unknown as Record<string, unknown>;

    // Both lifecycle events should have traceId
    expect(started.traceId).toBeDefined();
    expect(started.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(finished.traceId).toBeDefined();
    expect(finished.traceId).toMatch(/^[0-9a-f]{32}$/);

    // Same traceId across the stream
    expect(started.traceId).toBe(finished.traceId);
  });

  it("returns traceparent response header in SSE stream", async () => {
    const result = await sseRequest(port, validInput());

    expect(result.headers.traceparent).toBeDefined();
    expect(result.headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });
});
