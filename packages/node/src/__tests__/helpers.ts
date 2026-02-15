import type { GatewayFrame } from "@templar/gateway/protocol";
import type { TemplarNode } from "../node.js";
import type { NodeConfig } from "../types.js";
import type { WebSocketClientLike } from "../ws-client.js";

// ---------------------------------------------------------------------------
// Mock WebSocket — unified for both node.test.ts and ws-client.test.ts
// ---------------------------------------------------------------------------

export interface MockWs extends WebSocketClientLike {
  _listeners: Map<string, Array<(...args: unknown[]) => void>>;
  _simulateOpen: () => void;
  _simulateMessage: (data: GatewayFrame | string) => void;
  _simulateClose: (code: number, reason: string) => void;
  _simulateError: (error: Error) => void;
  /** Parsed frames (for asserting on structured data) */
  _sent: GatewayFrame[];
  /** Raw JSON strings (for asserting on serialized data) */
  _sentRaw: string[];
}

export function createMockWs(): MockWs {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const sent: GatewayFrame[] = [];
  const sentRaw: string[] = [];

  const ws: MockWs = {
    readyState: 0,
    _listeners: listeners,
    _sent: sent,
    _sentRaw: sentRaw,

    send(data: string) {
      sentRaw.push(data);
      sent.push(JSON.parse(data) as GatewayFrame);
    },

    close(code?: number, _reason?: string) {
      ws.readyState = 3;
      const handlers = listeners.get("close") ?? [];
      for (const h of handlers) h(code ?? 1000, "");
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, handler]);
    },

    _simulateOpen() {
      ws.readyState = 1;
      const handlers = listeners.get("open") ?? [];
      for (const h of handlers) h();
    },

    _simulateMessage(data: GatewayFrame | string) {
      const raw = typeof data === "string" ? data : JSON.stringify(data);
      const handlers = listeners.get("message") ?? [];
      for (const h of handlers) h(raw);
    },

    _simulateClose(code: number, reason: string) {
      ws.readyState = 3;
      const handlers = listeners.get("close") ?? [];
      for (const h of handlers) h(code, reason);
    },

    _simulateError(error: Error) {
      const handlers = listeners.get("error") ?? [];
      for (const h of handlers) h(error);
    },
  };

  return ws;
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

/** Flush pending microtasks so async chains can progress */
export function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function makeConfig(overrides?: Partial<NodeConfig>): NodeConfig {
  return {
    nodeId: "test-node-1",
    gatewayUrl: "ws://localhost:18789",
    token: "test-token",
    capabilities: {
      agentTypes: ["high"],
      tools: ["web-search"],
      maxConcurrency: 4,
      channels: ["slack"],
    },
    ...overrides,
  };
}

/**
 * Start a TemplarNode and complete the connect + register handshake.
 * Uses tick() to properly sequence the async promise chain.
 */
export async function startAndConnect(
  node: TemplarNode,
  mockWs: MockWs,
  sessionId = "session-1",
): Promise<void> {
  const startPromise = node.start();

  // Flush microtasks so resolveToken + wsClient.connect() run
  // and WS listeners are set up
  await tick();

  // Open the WS connection
  mockWs._simulateOpen();

  // Flush microtasks so register frame is sent and waitForRegisterAck is set up
  await tick();

  // Find the register frame and send ack
  const registerFrame = mockWs._sent.find((f) => f.kind === "node.register");
  if (registerFrame?.kind === "node.register") {
    mockWs._simulateMessage({
      kind: "node.register.ack",
      nodeId: registerFrame.nodeId,
      sessionId,
    });
  }

  await startPromise;
}
