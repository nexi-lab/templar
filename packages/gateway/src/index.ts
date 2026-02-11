/**
 * @templar/gateway
 *
 * WebSocket control plane for routing messages between channels, nodes, and agents.
 */

export const PACKAGE_NAME = "@templar/gateway" as const;

// Config
export {
  type ConfigErrorHandler,
  type ConfigRestartRequiredHandler,
  type ConfigUpdatedHandler,
  ConfigWatcher,
  type ConfigWatcherDeps,
} from "./config-watcher.js";
// Orchestrator
export { type GatewayEventHandler, TemplarGateway, type TemplarGatewayDeps } from "./gateway.js";
// Lanes
export {
  type InterruptHandler,
  LaneDispatcher,
  type OverflowHandler,
} from "./lanes/lane-dispatcher.js";
export { BoundedFifoQueue } from "./lanes/queue.js";
export {
  HealthMonitor,
  type HealthMonitorConfig,
  type NodeDeadHandler,
  type PingSender,
} from "./registry/health-monitor.js";
// Registry
export { NodeRegistry, type RegisteredNode } from "./registry/node-registry.js";
// Router
export { AgentRouter, type MessageRouter } from "./router.js";
// Server
export {
  type ConnectionHandler,
  type DisconnectHandler,
  type FrameHandler,
  GatewayServer,
  type GatewayServerConfig,
  type TokenValidator,
  type WebSocketLike,
  type WebSocketServerLike,
  type WsServerFactory,
} from "./server.js";
