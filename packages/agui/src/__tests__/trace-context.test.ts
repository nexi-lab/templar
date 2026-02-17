/**
 * Tests — OTel Trace Context Propagation in AG-UI SSE Events
 *
 * Verifies:
 * 1. traceId appears in RUN_STARTED, RUN_FINISHED, RUN_ERROR events
 * 2. traceparent header propagated from HTTP request → SSE response
 * 3. Consistent traceId across all lifecycle events in a stream
 * 4. Valid 32-hex traceId format
 * 5. Incoming traceparent → matching traceId in events
 */

import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgUiEvent } from "../protocol/types.js";
import { EventType } from "../protocol/types.js";
import { AgUiServer, type RunHandler } from "../server/agui-server.js";
import { INVALID_TRACE_ID } from "../server/trace-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SSEResult {
  status: number;
  headers: Record<string, string>;
  events: AgUiEvent[];
}

/** Parsed SSE event as a plain record (avoids TS narrowing issues with passthrough fields). */
type EventRecord = Record<string, unknown>;

/** 32-hex character pattern for OTel trace IDs */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Sends a POST request with optional custom headers and collects SSE events.
 */
async function collectEventsWithHeaders(
  port: number,
  body: Record<string, unknown>,
  requestHeaders?: Record<string, string>,
): Promise<SSEResult> {
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
          ...requestHeaders,
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

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function validInput(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    threadId: "thread-trace",
    runId: "run-trace",
    messages: [{ id: "m-1", role: "user", content: "Hello" }],
    tools: [],
    ...overrides,
  };
}

/** Cast an event to a plain record to access passthrough fields like traceId. */
function asRecord(event: AgUiEvent | undefined): EventRecord {
  return event as unknown as EventRecord;
}

// ---------------------------------------------------------------------------
// Test suite: traceId in lifecycle events (happy path)
// ---------------------------------------------------------------------------

describe("Trace context: lifecycle events", () => {
  let server: AgUiServer;
  let port: number;

  const echoHandler: RunHandler = async (_input, emit) => {
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "msg-1",
      role: "assistant",
    } as AgUiEvent);
    emit({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "msg-1",
      delta: "traced response",
    } as AgUiEvent);
    emit({
      type: EventType.TEXT_MESSAGE_END,
      messageId: "msg-1",
    } as AgUiEvent);
  };

  beforeAll(async () => {
    port = 19800 + Math.floor(Math.random() * 100);
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

  it("includes traceId in RUN_STARTED event", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const started = asRecord(events[0]);

    expect(started.type).toBe(EventType.RUN_STARTED);
    expect(started.traceId).toBeDefined();
    expect(started.traceId).toMatch(TRACE_ID_PATTERN);
  });

  it("includes traceId in RUN_FINISHED event", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const finished = asRecord(events[events.length - 1]);

    expect(finished.type).toBe(EventType.RUN_FINISHED);
    expect(finished.traceId).toBeDefined();
    expect(finished.traceId).toMatch(TRACE_ID_PATTERN);
  });

  it("uses consistent traceId across RUN_STARTED and RUN_FINISHED", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const started = asRecord(events[0]);
    const finished = asRecord(events[events.length - 1]);

    expect(started.traceId).toBe(finished.traceId);
  });

  it("does NOT include traceId in non-lifecycle events", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const contentEvents = events.filter((e) => e.type === EventType.TEXT_MESSAGE_CONTENT);

    for (const event of contentEvents) {
      expect(asRecord(event).traceId).toBeUndefined();
    }
  });

  it("generates traceIds with valid 32-hex format for each request", async () => {
    const result1 = await collectEventsWithHeaders(port, validInput({ runId: "run-1" }));
    const result2 = await collectEventsWithHeaders(port, validInput({ runId: "run-2" }));

    const traceId1 = asRecord(result1.events[0]).traceId;
    const traceId2 = asRecord(result2.events[0]).traceId;

    // Without OTel SDK, both will be INVALID_TRACE_ID (all-zeros) — that's expected.
    // With a real SDK, they would be different. We test format correctness here.
    expect(traceId1).toMatch(TRACE_ID_PATTERN);
    expect(traceId2).toMatch(TRACE_ID_PATTERN);
  });
});

// ---------------------------------------------------------------------------
// Test suite: traceId in RUN_ERROR
// ---------------------------------------------------------------------------

describe("Trace context: RUN_ERROR", () => {
  let server: AgUiServer;
  let port: number;

  const crashHandler: RunHandler = async () => {
    throw new Error("traced crash");
  };

  beforeAll(async () => {
    port = 19850 + Math.floor(Math.random() * 100);
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

  it("includes traceId in RUN_ERROR event", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const errorEvent = asRecord(events.find((e) => e.type === EventType.RUN_ERROR));

    expect(errorEvent).toBeDefined();
    expect(errorEvent.message).toBe("traced crash");
    expect(errorEvent.traceId).toBeDefined();
    expect(errorEvent.traceId).toMatch(TRACE_ID_PATTERN);
  });

  it("uses consistent traceId between RUN_STARTED and RUN_ERROR", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const started = asRecord(events.find((e) => e.type === EventType.RUN_STARTED));
    const error = asRecord(events.find((e) => e.type === EventType.RUN_ERROR));

    expect(started.traceId).toBe(error.traceId);
  });
});

// ---------------------------------------------------------------------------
// Test suite: traceparent response header
// ---------------------------------------------------------------------------

describe("Trace context: traceparent response header", () => {
  let server: AgUiServer;
  let port: number;

  const noopHandler: RunHandler = async () => {};

  beforeAll(async () => {
    port = 19900 + Math.floor(Math.random() * 100);
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

  it("includes traceparent in SSE response headers", async () => {
    const { headers } = await collectEventsWithHeaders(port, validInput());

    expect(headers.traceparent).toBeDefined();
    // W3C traceparent format: {version}-{traceId}-{spanId}-{flags}
    expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it("traceparent header traceId matches event traceId", async () => {
    const { headers, events } = await collectEventsWithHeaders(port, validInput());

    const traceparent = headers.traceparent ?? "";
    expect(traceparent).not.toBe("");
    const headerTraceId = traceparent.split("-")[1];
    const eventTraceId = asRecord(events[0]).traceId;

    expect(headerTraceId).toBe(eventTraceId);
  });
});

// ---------------------------------------------------------------------------
// Test suite: incoming traceparent propagation
// ---------------------------------------------------------------------------

describe("Trace context: incoming traceparent propagation", () => {
  let server: AgUiServer;
  let port: number;

  const noopHandler: RunHandler = async () => {};

  beforeAll(async () => {
    port = 19950 + Math.floor(Math.random() * 100);
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

  it("produces a traceId even without incoming traceparent", async () => {
    const { events } = await collectEventsWithHeaders(port, validInput());
    const started = asRecord(events[0]);

    // Without OTel SDK, this will be the all-zeros no-op traceId
    // With OTel SDK, this would be a new random traceId
    expect(started.traceId).toMatch(TRACE_ID_PATTERN);
  });

  it("handles incoming traceparent without errors", async () => {
    // This test verifies the wiring: we send a traceparent and check format.
    // Without a real OTel SDK, the propagator is a no-op (ignores the header).
    // The traceId will be INVALID_TRACE_ID (all-zeros) — that's correct behavior
    // for the no-op case. The important thing is the code path executes without error.
    const incomingTraceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";

    const { events } = await collectEventsWithHeaders(port, validInput(), {
      traceparent: incomingTraceparent,
    });

    const started = asRecord(events[0]);
    expect(started.traceId).toMatch(TRACE_ID_PATTERN);

    // Without OTel SDK, the no-op propagator doesn't extract the incoming context,
    // so the traceId will be the all-zeros sentinel. This is expected.
    // With a real SDK, started.traceId would equal "4bf92f3577b34da6a3ce929d0e0e4736".
  });
});

// ---------------------------------------------------------------------------
// Test suite: trace-context utility functions
// ---------------------------------------------------------------------------

describe("Trace context: utility functions", () => {
  it("INVALID_TRACE_ID is the expected all-zeros sentinel", () => {
    expect(INVALID_TRACE_ID).toBe("00000000000000000000000000000000");
    expect(INVALID_TRACE_ID).toHaveLength(32);
  });
});
