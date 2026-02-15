import { PassThrough, Readable, Writable } from "node:stream";
import type { Stream } from "@agentclientprotocol/sdk";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import type { ACPTransport } from "../../transport.js";

/**
 * In-memory transport for testing.
 *
 * Creates paired PassThrough streams so that agent and client can
 * communicate without real stdio.
 */
export interface MemoryTransportPair {
  /** Transport for the agent (ACPServer) side. */
  readonly agentTransport: ACPTransport;
  /** ACP Stream for the client (ClientSideConnection) side. */
  readonly clientStream: Stream;
  /** Destroy all streams. */
  destroy(): void;
}

export function createMemoryTransportPair(): MemoryTransportPair {
  // Two pipes: client→agent and agent→client
  const clientToAgent = new PassThrough();
  const agentToClient = new PassThrough();

  // Agent reads from clientToAgent, writes to agentToClient
  const agentTransport: ACPTransport = {
    createStream() {
      const output = Writable.toWeb(agentToClient) as WritableStream<Uint8Array>;
      const input = Readable.toWeb(clientToAgent) as ReadableStream<Uint8Array>;
      return ndJsonStream(output, input);
    },
    close() {
      clientToAgent.destroy();
      agentToClient.destroy();
    },
  };

  // Client reads from agentToClient, writes to clientToAgent
  const clientStream = ndJsonStream(
    Writable.toWeb(clientToAgent) as WritableStream<Uint8Array>,
    Readable.toWeb(agentToClient) as ReadableStream<Uint8Array>,
  );

  return {
    agentTransport,
    clientStream,
    destroy() {
      clientToAgent.destroy();
      agentToClient.destroy();
    },
  };
}
