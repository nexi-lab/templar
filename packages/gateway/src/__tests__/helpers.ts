/**
 * Shared test helpers for @templar/gateway tests.
 *
 * Eliminates duplication of mock WebSocket, config fixtures,
 * and frame simulation helpers across server, gateway, and integration tests.
 */

import { vi } from "vitest";
import type { TemplarGatewayDeps } from "../gateway.js";
import { TemplarGateway } from "../gateway.js";
import type { GatewayConfig, GatewayFrame, NodeCapabilities } from "../protocol/index.js";
import type { WebSocketLike, WebSocketServerLike, WsServerFactory } from "../server.js";

// ---------------------------------------------------------------------------
// Default fixtures
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG: GatewayConfig = {
  port: 0,
  nexusUrl: "https://api.nexus.test",
  nexusApiKey: "test-key",
  sessionTimeout: 60_000,
  suspendTimeout: 300_000,
  healthCheckInterval: 30_000,
  laneCapacity: 256,
  maxConnections: 1024,
  maxFramesPerSecond: 100,
  defaultConversationScope: "per-channel-peer",
  maxConversations: 100_000,
  conversationTtl: 86_400_000,
};

export const DEFAULT_CAPS: NodeCapabilities = {
  agentTypes: ["high"],
  tools: [],
  maxConcurrency: 4,
  channels: [],
};

// ---------------------------------------------------------------------------
// Mock WebSocket
// ---------------------------------------------------------------------------

export interface MockWs extends WebSocketLike {
  handlers: Map<string, ((...args: unknown[]) => unknown)[]>;
  sentFrames: () => GatewayFrame[];
}

export function createMockWs(): MockWs {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  const sendMock = vi.fn();
  return {
    handlers,
    readyState: 1, // OPEN
    send: sendMock,
    close: vi.fn(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    },
    sentFrames(): GatewayFrame[] {
      return sendMock.mock.calls.map((call) => JSON.parse(String(call[0])) as GatewayFrame);
    },
  };
}

// ---------------------------------------------------------------------------
// Mock WebSocket Server
// ---------------------------------------------------------------------------

export interface MockWss extends WebSocketServerLike {
  handlers: Map<string, ((...args: unknown[]) => unknown)[]>;
  simulateConnection: (ws: WebSocketLike) => void;
  connect: (label?: string) => MockWs;
}

export function createMockWss(): MockWss {
  const handlers = new Map<string, ((...args: unknown[]) => unknown)[]>();
  return {
    handlers,
    clients: new Set<WebSocketLike>(),
    on(event: string, handler: (...args: unknown[]) => void) {
      const existing = handlers.get(event) ?? [];
      handlers.set(event, [...existing, handler]);
    },
    close(cb?: (err?: Error) => void) {
      cb?.();
    },
    simulateConnection(ws: WebSocketLike) {
      const connectionHandlers = handlers.get("connection") ?? [];
      for (const h of connectionHandlers) {
        h(ws, { headers: { host: "localhost" } });
      }
    },
    connect(_label?: string): MockWs {
      const ws = createMockWs();
      const connectionHandlers = handlers.get("connection") ?? [];
      for (const h of connectionHandlers) {
        h(ws, { headers: { host: "localhost" } });
      }
      return ws;
    },
  };
}

export function createMockFactory(wss: WebSocketServerLike): WsServerFactory {
  return vi.fn().mockReturnValue(wss);
}

// ---------------------------------------------------------------------------
// Frame simulation
// ---------------------------------------------------------------------------

/**
 * Simulate sending a frame through a mock WebSocket.
 */
export function sendFrame(ws: MockWs, frame: GatewayFrame): void {
  const messageHandlers = ws.handlers.get("message") ?? [];
  for (const h of messageHandlers) {
    h(JSON.stringify(frame));
  }
}

/**
 * Simulate a WebSocket close event.
 */
export function closeWs(ws: MockWs, code = 1000, reason = ""): void {
  const closeHandlers = ws.handlers.get("close") ?? [];
  for (const h of closeHandlers) {
    h(code, reason);
  }
}

// ---------------------------------------------------------------------------
// Gateway factory
// ---------------------------------------------------------------------------

/**
 * Create a test gateway with mock WebSocket server and config watcher.
 */
export function createTestGateway(configOverrides: Partial<GatewayConfig> = {}): {
  gateway: TemplarGateway;
  wss: MockWss;
} {
  const wss = createMockWss();
  const factory: WsServerFactory = vi.fn().mockReturnValue(wss);
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const deps: TemplarGatewayDeps = {
    wsFactory: factory,
    configWatcherDeps: {
      watch: () => ({
        on: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
  const gateway = new TemplarGateway(config, deps);
  return { gateway, wss };
}
