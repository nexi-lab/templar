import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgUiEvent } from "../protocol/types.js";
import { EventType } from "../protocol/types.js";
import { AgUiServer } from "../server/agui-server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sends a POST request to the AG-UI server and collects all SSE events.
 */
async function collectEvents(
  port: number,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<{ status: number; headers: Record<string, string>; events: AgUiEvent[] }> {
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
        let buffer = "";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();
          // Parse complete SSE events (separated by \n\n)
          const parts = buffer.split("\n\n");
          // Keep the last incomplete part in the buffer
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (part.startsWith("data: ")) {
              const json = part.slice(6);
              events.push(JSON.parse(json) as AgUiEvent);
            }
            // Ignore comments (lines starting with :)
          }
        });

        res.on("end", () => {
          // Parse any remaining data in buffer
          if (buffer.startsWith("data: ")) {
            const json = buffer.slice(6);
            events.push(JSON.parse(json) as AgUiEvent);
          }

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(res.headers)) {
            if (typeof value === "string") {
              headers[key] = value;
            }
          }

          resolve({ status: res.statusCode ?? 0, headers, events });
        });

        res.on("error", reject);
      },
    );

    if (signal) {
      signal.addEventListener("abort", () => req.destroy());
    }

    req.on("error", (err) => {
      // ECONNRESET is expected when we abort
      if ((err as NodeJS.ErrnoException).code === "ECONNRESET") {
        resolve({ status: 0, headers: {}, events: [] });
        return;
      }
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Minimal valid RunAgentInput for testing.
 */
function validInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    threadId: "thread-1",
    runId: "run-1",
    messages: [{ id: "m-1", role: "user", content: "Hello" }],
    tools: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("AgUiServer", () => {
  let server: AgUiServer;
  let port: number;

  /**
   * Simple run handler that emits a text message.
   */
  const echoHandler = async (
    input: { threadId: string; runId: string; messages: Array<{ content?: string }> },
    emit: (event: AgUiEvent) => void,
  ) => {
    const content =
      typeof input.messages[0]?.content === "string" ? input.messages[0].content : "no content";

    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "echo-msg",
      role: "assistant",
    } as AgUiEvent);

    emit({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "echo-msg",
      delta: content,
    } as AgUiEvent);

    emit({
      type: EventType.TEXT_MESSAGE_END,
      messageId: "echo-msg",
    } as AgUiEvent);
  };

  beforeAll(async () => {
    port = 18791 + Math.floor(Math.random() * 1000);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 1000,
      runHandler: echoHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("returns SSE headers on valid POST", async () => {
    const { status, headers } = await collectEvents(port, validInput());
    expect(status).toBe(200);
    expect(headers["content-type"]).toBe("text/event-stream");
    expect(headers["cache-control"]).toBe("no-cache, no-transform");
    expect(headers.connection).toBe("keep-alive");
    expect(headers["x-accel-buffering"]).toBe("no");
  });

  it("wraps handler output in RUN_STARTED and RUN_FINISHED lifecycle events", async () => {
    const { events } = await collectEvents(port, validInput());
    expect(events.length).toBeGreaterThanOrEqual(5);
    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events[events.length - 1]?.type).toBe(EventType.RUN_FINISHED);
  });

  it("includes threadId and runId in lifecycle events", async () => {
    const { events } = await collectEvents(port, validInput({ threadId: "t-42", runId: "r-99" }));
    const started = events[0] as { threadId: string; runId: string };
    expect(started.threadId).toBe("t-42");
    expect(started.runId).toBe("r-99");
  });

  it("emits handler events between lifecycle events", async () => {
    const { events } = await collectEvents(port, validInput());
    // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END, RUN_FINISHED
    const types = events.map((e) => e.type);
    expect(types).toEqual([
      EventType.RUN_STARTED,
      EventType.TEXT_MESSAGE_START,
      EventType.TEXT_MESSAGE_CONTENT,
      EventType.TEXT_MESSAGE_END,
      EventType.RUN_FINISHED,
    ]);
  });

  it("echoes the input message content", async () => {
    const { events } = await collectEvents(
      port,
      validInput({ messages: [{ id: "m-1", role: "user", content: "Ping!" }] }),
    );
    const contentEvent = events.find((e) => e.type === EventType.TEXT_MESSAGE_CONTENT);
    expect((contentEvent as { delta: string }).delta).toBe("Ping!");
  });

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  it("returns 400 for invalid input (missing threadId)", async () => {
    const { status } = await collectEvents(port, {
      runId: "r-1",
      messages: [],
      tools: [],
    });
    expect(status).toBe(400);
  });

  it("returns 400 for invalid input (missing runId)", async () => {
    const { status } = await collectEvents(port, {
      threadId: "t-1",
      messages: [],
      tools: [],
    });
    expect(status).toBe(400);
  });

  it("returns 400 for empty body", async () => {
    const { status } = await collectEvents(port, {});
    expect(status).toBe(400);
  });

  it("returns 405 for GET requests", async () => {
    const result = await new Promise<number>((resolve, reject) => {
      const req = http.get({ hostname: "127.0.0.1", port, path: "/" }, (res) =>
        resolve(res.statusCode ?? 0),
      );
      req.on("error", reject);
    });
    expect(result).toBe(405);
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  it("emits RUN_ERROR when handler throws", async () => {
    const errorHandler = async () => {
      throw new Error("Agent crashed");
    };
    const errorPort = port + 1;
    const errorServer = new AgUiServer({
      port: errorPort,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: errorHandler,
    });
    await errorServer.start();

    try {
      const { events } = await collectEvents(errorPort, validInput());
      const errorEvent = events.find((e) => e.type === EventType.RUN_ERROR);
      expect(errorEvent).toBeDefined();
      expect((errorEvent as { message: string }).message).toBe("Agent crashed");
    } finally {
      await errorServer.stop();
    }
  });
});
