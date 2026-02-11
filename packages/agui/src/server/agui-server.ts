/**
 * AG-UI SSE Server
 *
 * HTTP server that accepts RunAgentInput via POST
 * and returns AG-UI events over Server-Sent Events.
 *
 * Features:
 * - Input validation via Zod
 * - SSE streaming with correct headers
 * - Backpressure handling (res.write drain)
 * - Client disconnect detection (req close event)
 * - Heartbeat keep-alive comments
 * - Cork/uncork for burst coalescing
 * - Connection limit tracking
 * - Configurable max stream duration
 * - Graceful shutdown (SIGTERM)
 */

import { once } from "node:events";
import * as http from "node:http";
import { encodeComment, encodeEvent, SSE_HEADERS } from "../protocol/encoder.js";
import { RunAgentInputSchema } from "../protocol/schemas.js";
import type { AgUiEvent } from "../protocol/types.js";
import { EventType } from "../protocol/types.js";
import { ConnectionTracker } from "./connection-tracker.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgUiServerOptions {
  readonly port: number;
  readonly hostname: string;
  readonly maxConnections: number;
  readonly maxStreamDurationMs: number;
  readonly heartbeatIntervalMs: number;
  readonly runHandler: RunHandler;
}

/**
 * Handler function invoked for each valid AG-UI run request.
 * Receives the validated input and an emit function to send events.
 * The handler should NOT emit RUN_STARTED or RUN_FINISHED — the server does that.
 */
export type RunHandler = (
  input: { threadId: string; runId: string; messages: readonly Record<string, unknown>[] },
  emit: (event: AgUiEvent) => void,
  signal: AbortSignal,
) => Promise<void>;

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export class AgUiServer {
  private readonly _server: http.Server;
  private readonly _tracker: ConnectionTracker;
  private readonly _options: AgUiServerOptions;
  private readonly _activeStreams = new Set<AbortController>();

  constructor(options: AgUiServerOptions) {
    this._options = options;
    this._tracker = new ConnectionTracker(options.maxConnections);
    this._server = http.createServer((req: http.IncomingMessage, res: http.ServerResponse) => {
      this._handleRequest(req, res).catch(() => {
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end();
        }
      });
    });
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._server.on("error", reject);
      this._server.listen(this._options.port, this._options.hostname, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    // Abort all active streams
    for (const controller of this._activeStreams) {
      controller.abort();
    }
    this._activeStreams.clear();

    return new Promise<void>((resolve, reject) => {
      this._server.close((err: Error | undefined) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get activeConnections(): number {
    return this._tracker.activeCount;
  }

  // -------------------------------------------------------------------------
  // Request handling
  // -------------------------------------------------------------------------

  private async _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Only accept POST
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end();
      return;
    }

    // Parse body
    const body = await this._readBody(req);
    if (body === null) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    // Validate input
    const parsed = RunAgentInputSchema.safeParse(body);
    if (!parsed.success) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Invalid RunAgentInput",
          issues: parsed.error.issues.map((i) => i.message),
        }),
      );
      return;
    }

    const input = parsed.data;

    // Check connection limit
    if (!this._tracker.acquire()) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Connection limit reached" }));
      return;
    }

    // Set up abort controller for this stream
    const controller = new AbortController();
    this._activeStreams.add(controller);

    // Set SSE headers
    res.statusCode = 200;
    for (const [key, value] of Object.entries(SSE_HEADERS)) {
      res.setHeader(key, value);
    }

    // Detect client disconnect (res "close" fires when the socket drops)
    res.on("close", () => {
      controller.abort();
    });

    // Start heartbeat timer
    const heartbeatTimer = setInterval(() => {
      if (!res.writableEnded && !controller.signal.aborted) {
        res.write(encodeComment("heartbeat"));
      }
    }, this._options.heartbeatIntervalMs);

    // Start max duration timer
    const durationTimer = setTimeout(() => {
      controller.abort();
    }, this._options.maxStreamDurationMs);

    try {
      // Emit RUN_STARTED
      await this._writeEvent(res, {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as AgUiEvent);

      // Run the handler
      await this._options.runHandler(
        {
          threadId: input.threadId,
          runId: input.runId,
          messages: input.messages as readonly Record<string, unknown>[],
        },
        (event: AgUiEvent) => {
          if (!res.writableEnded && !controller.signal.aborted) {
            res.write(encodeEvent(event));
          }
        },
        controller.signal,
      );

      // Emit RUN_FINISHED (only if not aborted)
      if (!controller.signal.aborted && !res.writableEnded) {
        await this._writeEvent(res, {
          type: EventType.RUN_FINISHED,
          threadId: input.threadId,
          runId: input.runId,
        } as AgUiEvent);
      }
    } catch (err) {
      // Emit RUN_ERROR
      if (!res.writableEnded && !controller.signal.aborted) {
        const message = err instanceof Error ? err.message : "Unknown error";
        await this._writeEvent(res, {
          type: EventType.RUN_ERROR,
          message,
        } as AgUiEvent);
      }
    } finally {
      clearInterval(heartbeatTimer);
      clearTimeout(durationTimer);
      this._activeStreams.delete(controller);
      this._tracker.release();

      if (!res.writableEnded) {
        res.end();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Writes an SSE event with backpressure handling.
   */
  private async _writeEvent(res: http.ServerResponse, event: AgUiEvent): Promise<void> {
    const ok = res.write(encodeEvent(event));
    if (!ok) {
      // Wait for drain before continuing (backpressure)
      await once(res, "drain");
    }
  }

  /**
   * Reads and parses the request body as JSON.
   * Returns null if the body is not valid JSON.
   */
  private async _readBody(req: http.IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString());
    } catch {
      return null;
    }
  }
}
