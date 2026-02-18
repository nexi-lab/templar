/**
 * @templar/gateway
 *
 * WebSocket control plane for routing messages between channels, nodes, and agents.
 */

export const PACKAGE_NAME = "@templar/gateway" as const;

// Binding resolver
export {
  BindingResolver,
  type CompiledBinding,
  compileBindings,
  compilePattern,
  type FieldMatcher,
  matchField,
} from "./binding-resolver.js";
// Config
export {
  type ConfigErrorHandler,
  type ConfigRestartRequiredHandler,
  type ConfigUpdatedHandler,
  ConfigWatcher,
  type ConfigWatcherDeps,
} from "./config-watcher.js";
// Conversations
export {
  type CapacityWarningHandler,
  type ConversationBinding,
  ConversationStore,
  type ConversationStoreConfig,
} from "./conversations/index.js";
// Delivery tracking
export { DeliveryTracker, type PendingMessage } from "./delivery-tracker.js";
// Device auth
export { type DeviceJwtResult, timingSafeTokenCompare, verifyDeviceJwt } from "./device-auth.js";
export {
  type DeviceKeyStore,
  InMemoryDeviceKeyStore,
  type InMemoryDeviceKeyStoreOptions,
  importBase64urlPublicKey,
} from "./device-key-store.js";
// Orchestrator
export { type GatewayEventHandler, TemplarGateway, type TemplarGatewayDeps } from "./gateway.js";
// Protocol (shared with @templar/node via @templar/gateway/protocol subpath)
export * from "./protocol/index.js";
export { BoundedFifoQueue } from "./queue/bounded-fifo.js";
// Queue (priority message buffer)
export {
  type InterruptHandler,
  MessageBuffer,
  type OverflowHandler,
} from "./queue/message-buffer.js";
export {
  HealthMonitor,
  type HealthMonitorConfig,
  type NodeDeadHandler,
  type PingSender,
  type SweepHandler,
} from "./registry/health-monitor.js";
// Registry
export { NodeRegistry, type RegisteredNode } from "./registry/node-registry.js";
// Router
export { type AgentNodeResolver, AgentRouter, type DegradationHandler } from "./router.js";
// Server
export {
  type AuthResult,
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
// Utils
export { createEmitter, type Emitter, type EventMap } from "./utils/emitter.js";
export { mapDelete, mapFilter, mapSet } from "./utils/immutable-map.js";
