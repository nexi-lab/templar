import { Readable, Writable } from "node:stream";
import type { Stream } from "@agentclientprotocol/sdk";
import { ndJsonStream } from "@agentclientprotocol/sdk";

/**
 * Abstract transport for ACP JSON-RPC communication.
 * Provides the bidirectional stream that the SDK's AgentSideConnection needs.
 *
 * MVP: StdioTransport. Future: HttpTransport, WebSocketTransport.
 */
export interface ACPTransport {
  /** Create the ACP Stream for the SDK connection. */
  createStream(): Stream;
  /** Tear down the transport (close pipes, free resources). */
  close(): void;
}

/**
 * Standard stdio transport — agent reads from stdin, writes to stdout.
 *
 * Wraps Node.js process.stdin/stdout into Web Streams via `ndJsonStream()`
 * as required by the ACP SDK. Includes buffered writes via the SDK's
 * internal ndjson framing and respects backpressure from the writable side.
 */
export class StdioTransport implements ACPTransport {
  private closed = false;

  createStream(): Stream {
    if (this.closed) {
      throw new Error("StdioTransport is closed");
    }
    // ACP SDK expects Web Streams: WritableStream<Uint8Array> for output,
    // ReadableStream<Uint8Array> for input.
    const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
    const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
    return ndJsonStream(output, input);
  }

  close(): void {
    this.closed = true;
  }
}
