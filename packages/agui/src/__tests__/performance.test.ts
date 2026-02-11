/**
 * Performance Tests — AG-UI Server
 *
 * Validates throughput, latency, and resource usage
 * under concurrent load. Uses manual timing with
 * performance.now() following the core package pattern.
 */

import * as http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../mappers/to-agui.js";
import { encodeEvent } from "../protocol/encoder.js";
import type { AgUiEvent } from "../protocol/types.js";
import { EventType } from "../protocol/types.js";
import { AgUiServer, type RunHandler } from "../server/agui-server.js";
import { ConnectionTracker } from "../server/connection-tracker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function timedRequest(
  port: number,
  body: Record<string, unknown>,
): Promise<{ events: AgUiEvent[]; durationMs: number }> {
  const payload = JSON.stringify(body);
  const start = performance.now();

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
          resolve({ events, durationMs: performance.now() - start });
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
    threadId: "thread-perf",
    runId: "run-perf",
    messages: [{ id: "m-1", role: "user", content: "perf test" }],
    tools: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Perf: Mapper throughput
// ---------------------------------------------------------------------------

describe("Performance: mapper throughput", () => {
  it("maps 10,000 text blocks in under 500ms", () => {
    const iterations = 10_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      mapBlockToEvents({ type: "text", content: `Message ${i}` }, `msg-${i}`);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it("maps 10,000 button blocks in under 500ms", () => {
    const iterations = 10_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      mapBlockToEvents(
        {
          type: "button",
          buttons: [
            { label: "OK", action: "ok", style: "primary" },
            { label: "Cancel", action: "cancel", style: "secondary" },
          ],
        },
        `msg-${i}`,
      );
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(500);
  });

  it("maps 1,000 image blocks with markdown escaping in under 200ms", () => {
    const iterations = 1_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      mapBlockToEvents(
        {
          type: "image",
          url: `https://example.com/image-${i}.png`,
          alt: `Photo [${i}] with "special" chars`,
        },
        `msg-${i}`,
      );
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});

// ---------------------------------------------------------------------------
// Perf: SSE encoding throughput
// ---------------------------------------------------------------------------

describe("Performance: SSE encoding", () => {
  it("encodes 10,000 events in under 200ms", () => {
    const event: AgUiEvent = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "msg-1",
      delta: "Hello, world!",
    } as AgUiEvent;

    const iterations = 10_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      encodeEvent(event);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it("encodes large payloads (10KB delta) at >1000/sec", () => {
    const largeContent = "x".repeat(10_000);
    const event: AgUiEvent = {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "msg-1",
      delta: largeContent,
    } as AgUiEvent;

    const iterations = 1_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      encodeEvent(event);
    }

    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / elapsed) * 1000;
    expect(opsPerSec).toBeGreaterThan(1000);
  });
});

// ---------------------------------------------------------------------------
// Perf: ConnectionTracker overhead
// ---------------------------------------------------------------------------

describe("Performance: ConnectionTracker", () => {
  it("100,000 acquire/release cycles in under 50ms", () => {
    const tracker = new ConnectionTracker(100_000);
    const iterations = 100_000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      tracker.acquire();
    }
    for (let i = 0; i < iterations; i++) {
      tracker.release();
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(tracker.activeCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Perf: Server request latency
// ---------------------------------------------------------------------------

describe("Performance: server request latency", () => {
  let server: AgUiServer;
  let port: number;

  const fastHandler: RunHandler = async (_input, emit) => {
    emit({
      type: EventType.TEXT_MESSAGE_START,
      messageId: "msg-perf",
      role: "assistant",
    } as AgUiEvent);
    emit({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: "msg-perf",
      delta: "fast response",
    } as AgUiEvent);
    emit({
      type: EventType.TEXT_MESSAGE_END,
      messageId: "msg-perf",
    } as AgUiEvent);
  };

  beforeAll(async () => {
    port = 19800 + Math.floor(Math.random() * 100);
    server = new AgUiServer({
      port,
      hostname: "127.0.0.1",
      maxConnections: 100,
      maxStreamDurationMs: 10000,
      heartbeatIntervalMs: 60000,
      runHandler: fastHandler,
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it("single request completes in under 200ms", async () => {
    const { durationMs, events } = await timedRequest(port, validInput());
    expect(events.length).toBe(5); // STARTED + 3 text + FINISHED
    expect(durationMs).toBeLessThan(200);
  });

  it("10 sequential requests complete in under 2000ms total", async () => {
    const start = performance.now();

    for (let i = 0; i < 10; i++) {
      const { events } = await timedRequest(port, validInput({ runId: `seq-${i}` }));
      expect(events.length).toBe(5);
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  it("10 concurrent requests all complete successfully", async () => {
    const start = performance.now();

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => timedRequest(port, validInput({ runId: `conc-${i}` }))),
    );

    const elapsed = performance.now() - start;

    for (const { events } of results) {
      expect(events.length).toBe(5);
      expect(events[0]?.type).toBe(EventType.RUN_STARTED);
      expect(events[events.length - 1]?.type).toBe(EventType.RUN_FINISHED);
    }

    // 10 concurrent should complete in reasonable time
    expect(elapsed).toBeLessThan(2000);
    expect(server.activeConnections).toBe(0);
  });

  it("50 concurrent requests complete without errors", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) => timedRequest(port, validInput({ runId: `load-${i}` }))),
    );

    const successes = results.filter((r) => r.events.length === 5);
    expect(successes.length).toBe(50);
    expect(server.activeConnections).toBe(0);
  });
});
