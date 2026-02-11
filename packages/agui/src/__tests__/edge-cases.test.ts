/**
 * Edge Case Tests — AG-UI Server
 *
 * Exercises boundary conditions and failure modes:
 * 1. Client disconnect mid-stream
 * 2. Empty response (handler emits nothing)
 * 3. Concurrent streams
 * 4. Invalid JSON body
 * 5. Mid-stream handler error
 * 6. Connection limit (503)
 */

import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgUiEvent } from "../protocol/types.js";
import { EventType } from "../protocol/types.js";
import { AgUiServer, type RunHandler } from "../server/agui-server.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function collectEvents(
  port: number,
  body: Record<string, unknown>,
): Promise<{ status: number; events: AgUiEvent[] }> {
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
          resolve({ status: res.statusCode ?? 0, events });
        });

        res.on("error", reject);
      },
    );

    req.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ECONNRESET") {
        resolve({ status: 0, events: [] });
        return;
      }
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

function sendRaw(port: number, rawBody: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(rawBody),
        },
      },
      (res) => {
        res.resume(); // drain
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("error", reject);
    req.write(rawBody);
    req.end();
  });
}

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
// Edge case: Empty response (handler emits nothing)
// ---------------------------------------------------------------------------

describe("Edge case: empty handler response", () => {
  let server: AgUiServer;
  let port: number;

  const silentHandler: RunHandler = async () => {
    // Handler deliberately emits nothing
  };

  beforeAll(async () => {
    port = 19100 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: silentHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("wraps empty handler with RUN_STARTED and RUN_FINISHED", async () => {
    const { events } = await collectEvents(port, validInput());
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events[1]?.type).toBe(EventType.RUN_FINISHED);
  });
});

// ---------------------------------------------------------------------------
// Edge case: Client disconnect mid-stream
// ---------------------------------------------------------------------------

describe("Edge case: client disconnect", () => {
  let server: AgUiServer;
  let port: number;

  const slowHandler: RunHandler = async (_input, emit, signal) => {
    // Emit one event, then wait for abort
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "msg-slow",
      role: "assistant",
    } as AgUiEvent);

    // Wait until aborted or timeout (short timeout so test doesn't hang)
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, 1000);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener("abort", onAbort);
      // Handle race: signal may have been aborted between check and addEventListener
      if (signal.aborted) {
        clearTimeout(timer);
        resolve();
      }
    });
  };

  beforeAll(async () => {
    port = 19200 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: slowHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("server cleans up when client disconnects", async () => {
    const initialConnections = server.activeConnections;

    // Start a request then abort it after receiving first data
    await new Promise<void>((resolve) => {
      const payload = JSON.stringify(validInput());
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
          res.on("data", () => {
            req.destroy();
          });
        },
      );
      req.on("error", () => {
        // Expected ECONNRESET
      });
      req.on("close", () => resolve());
      req.write(payload);
      req.end();
    });

    // Poll until cleanup completes (abort propagation + handler teardown)
    const deadline = Date.now() + 3000;
    while (server.activeConnections > initialConnections && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(server.activeConnections).toBe(initialConnections);
  });
});

// ---------------------------------------------------------------------------
// Edge case: Invalid JSON body
// ---------------------------------------------------------------------------

describe("Edge case: invalid JSON body", () => {
  let server: AgUiServer;
  let port: number;

  const noopHandler: RunHandler = async () => {};

  beforeAll(async () => {
    port = 19300 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: noopHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("returns 400 for malformed JSON", async () => {
    const { status } = await sendRaw(port, "{not valid json}}}");
    expect(status).toBe(400);
  });

  it("returns 400 for empty string body", async () => {
    const { status } = await sendRaw(port, "");
    expect(status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Edge case: Mid-stream handler error
// ---------------------------------------------------------------------------

describe("Edge case: mid-stream handler error", () => {
  let server: AgUiServer;
  let port: number;

  const crashHandler: RunHandler = async (_input, emit) => {
    // Emit one event then crash
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "msg-crash",
      role: "assistant",
    } as AgUiEvent);

    throw new Error("Handler exploded mid-stream");
  };

  beforeAll(async () => {
    port = 19400 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: crashHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("emits RUN_ERROR after partial events when handler throws", async () => {
    const { events } = await collectEvents(port, validInput());

    expect(events[0]?.type).toBe(EventType.RUN_STARTED);
    expect(events[1]?.type).toBe(EventType.TEXT_MESSAGE_START);

    const errorEvent = events.find((e) => e.type === EventType.RUN_ERROR);
    expect(errorEvent).toBeDefined();
    expect((errorEvent as { message: string }).message).toBe("Handler exploded mid-stream");

    // Should NOT have RUN_FINISHED after error
    const finishedEvent = events.find((e) => e.type === EventType.RUN_FINISHED);
    expect(finishedEvent).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge case: Concurrent streams
// ---------------------------------------------------------------------------

describe("Edge case: concurrent streams", () => {
  let server: AgUiServer;
  let port: number;

  const echoHandler: RunHandler = async (input, emit) => {
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId: `msg-${input.runId}`,
      role: "assistant",
    } as AgUiEvent);
    emit({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `msg-${input.runId}`,
      delta: input.runId,
    } as AgUiEvent);
    emit({
      type: EventType.TEXT_MESSAGE_END,
      messageId: `msg-${input.runId}`,
    } as AgUiEvent);
  };

  beforeAll(async () => {
    port = 19500 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 5,
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: echoHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("handles multiple concurrent streams independently", async () => {
    const results = await Promise.all([
      collectEvents(port, validInput({ runId: "run-A" })),
      collectEvents(port, validInput({ runId: "run-B" })),
      collectEvents(port, validInput({ runId: "run-C" })),
    ]);

    for (const { status, events } of results) {
      expect(status).toBe(200);
      expect(events).toHaveLength(5); // STARTED + 3 text + FINISHED
      expect(events[0]?.type).toBe(EventType.RUN_STARTED);
      expect(events[events.length - 1]?.type).toBe(EventType.RUN_FINISHED);
    }

    // Each stream should have its own runId in content
    const deltas = results.map((r) => {
      const content = r.events.find((e) => e.type === EventType.TEXT_MESSAGE_CONTENT);
      return (content as { delta: string }).delta;
    });
    expect(deltas.sort()).toEqual(["run-A", "run-B", "run-C"]);
  });
});

// ---------------------------------------------------------------------------
// Edge case: Connection limit (503)
// ---------------------------------------------------------------------------

describe("Edge case: connection limit", () => {
  let server: AgUiServer;
  let port: number;

  const blockingHandler: RunHandler = async (_input, _emit, signal) => {
    // Block until aborted
    await new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      signal.addEventListener("abort", () => resolve());
    });
  };

  beforeAll(async () => {
    port = 19600 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 1, // Only allow 1 connection
      maxStreamDurationMs: 5000,
      heartbeatIntervalMs: 60000,
      runHandler: blockingHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("returns 503 when connection limit is reached", async () => {
    // Start a blocking connection that holds the slot
    const payload = JSON.stringify(validInput());
    const holdReq = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    });
    holdReq.write(payload);
    holdReq.end();

    // Wait for the server to accept the first connection
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Second request should get 503
    const { status } = await collectEvents(port, validInput());
    expect(status).toBe(503);

    // Clean up the holding request
    holdReq.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
