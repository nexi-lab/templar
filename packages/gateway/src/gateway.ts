import { ConfigWatcher, type ConfigWatcherDeps } from "./config-watcher.js";
import { DeliveryTracker } from "./delivery-tracker.js";
import { LaneDispatcher } from "./lanes/lane-dispatcher.js";
import type {
  GatewayConfig,
  GatewayFrame,
  LaneMessage,
  LaneMessageAckFrame,
  LaneMessageFrame,
  NodeDeregisterFrame,
  NodeRegisterFrame,
} from "./protocol/index.js";
import { HealthMonitor } from "./registry/health-monitor.js";
import { NodeRegistry } from "./registry/node-registry.js";
import { AgentRouter } from "./router.js";
import { GatewayServer, type WsServerFactory } from "./server.js";
import { SessionManager } from "./sessions/session-manager.js";
import { createEmitter, type Emitter } from "./utils/emitter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplarGatewayDeps {
  /** WebSocket server factory — injectable for testing */
  readonly wsFactory?: WsServerFactory;
  /** Config watcher deps — injectable for testing */
  readonly configWatcherDeps?: ConfigWatcherDeps;
  /** Optional subsystem overrides for testing/customization */
  readonly registry?: NodeRegistry;
  readonly sessionManager?: SessionManager;
  readonly router?: AgentRouter;
  readonly configWatcher?: ConfigWatcher;
  readonly healthMonitor?: HealthMonitor;
}

export type GatewayEventHandler<T extends unknown[] = []> = (...args: T) => void;

// ---------------------------------------------------------------------------
// Gateway Events
// ---------------------------------------------------------------------------

type GatewayEvents = {
  "node.registered": [nodeId: string];
  "node.deregistered": [nodeId: string];
  "node.dead": [nodeId: string];
};

// ---------------------------------------------------------------------------
// TemplarGateway
// ---------------------------------------------------------------------------

/**
 * Top-level orchestrator for the gateway control plane.
 *
 * Wires all subsystems together:
 * - GatewayServer (WebSocket transport + auth)
 * - NodeRegistry (capability tracking)
 * - HealthMonitor (heartbeat sweep)
 * - SessionManager (per-node session FSM)
 * - AgentRouter (channel → node routing)
 * - LaneDispatcher (per-node priority queues)
 * - ConfigWatcher (hot-reload)
 */
export class TemplarGateway {
  private readonly registry: NodeRegistry;
  private readonly healthMonitor: HealthMonitor;
  private readonly sessionManager: SessionManager;
  private readonly router: AgentRouter;
  private readonly configWatcher: ConfigWatcher;
  private readonly server: GatewayServer;
  private readonly deliveryTracker: DeliveryTracker;
  private readonly events: Emitter<GatewayEvents> = createEmitter();

  // Bidirectional mapping between ephemeral WS connection IDs and registered node IDs.
  // Populated during node.register, cleaned up during deregister/disconnect.
  private connectionToNode = new Map<string, string>();
  private nodeToConnection = new Map<string, string>();

  constructor(config: GatewayConfig, deps: TemplarGatewayDeps = {}) {
    // 1. Node registry (injectable)
    this.registry = deps.registry ?? new NodeRegistry();

    // 2. Session manager (injectable)
    this.sessionManager =
      deps.sessionManager ??
      new SessionManager({
        sessionTimeout: config.sessionTimeout,
        suspendTimeout: config.suspendTimeout,
      });

    // 3. Router (injectable)
    this.router = deps.router ?? new AgentRouter(this.registry);

    // 4. Config watcher (injectable)
    this.configWatcher =
      deps.configWatcher ?? new ConfigWatcher(config, 300, deps.configWatcherDeps);

    // 5. WebSocket server with token validation
    this.server = new GatewayServer(
      {
        port: config.port,
        validateToken: (token) => token === config.nexusApiKey,
      },
      deps.wsFactory,
    );

    // 6. Health monitor (injectable, sends pings via server)
    this.healthMonitor =
      deps.healthMonitor ??
      new HealthMonitor(
        this.registry,
        { healthCheckInterval: config.healthCheckInterval },
        (nodeId) => {
          this.sendToNode(nodeId, { kind: "heartbeat.ping", timestamp: Date.now() });
        },
      );

    // 7. Delivery tracker for lane message ack
    this.deliveryTracker = new DeliveryTracker(config.laneCapacity);

    // Wire all event handlers
    this.wireFrameHandlers(config);
    this.wireConnectionHandlers();
    this.wireHealthMonitorHandlers();
    this.wireConfigWatcherHandlers();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start all gateway subsystems.
   */
  async start(): Promise<void> {
    await this.server.start();
    this.healthMonitor.start();
  }

  /**
   * Start watching a config file for hot-reload.
   */
  async watchConfig(path: string): Promise<void> {
    await this.configWatcher.watch(path);
  }

  /**
   * Stop all gateway subsystems gracefully.
   */
  async stop(): Promise<void> {
    this.healthMonitor.stop();
    await this.configWatcher.stop();
    this.sessionManager.dispose();
    this.registry.clear();
    this.deliveryTracker.clear();
    this.connectionToNode.clear();
    this.nodeToConnection.clear();
    this.events.clear();
    await this.server.stop();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Bind a channel to a specific node.
   */
  bindChannel(channelId: string, nodeId: string): void {
    this.router.bind(channelId, nodeId);
  }

  /**
   * Unbind a channel from its node.
   */
  unbindChannel(channelId: string): void {
    this.router.unbind(channelId);
  }

  /**
   * Drain all queued messages for a node in priority order.
   * Returns steer → collect → followup messages.
   */
  drainNode(nodeId: string): readonly LaneMessage[] {
    return this.router.drainNode(nodeId);
  }

  /**
   * Get the current gateway config.
   */
  getConfig(): GatewayConfig {
    return this.configWatcher.getConfig();
  }

  /**
   * Get the number of active WebSocket connections.
   */
  get connectionCount(): number {
    return this.server.connectionCount;
  }

  /**
   * Get the number of registered nodes.
   */
  get nodeCount(): number {
    return this.registry.size;
  }

  /**
   * Get the node registry (read-only access).
   */
  getRegistry(): NodeRegistry {
    return this.registry;
  }

  /**
   * Get the session manager (read-only access).
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the router (read-only access).
   */
  getRouter(): AgentRouter {
    return this.router;
  }

  /**
   * Get the delivery tracker (read-only access).
   */
  getDeliveryTracker(): DeliveryTracker {
    return this.deliveryTracker;
  }

  // -------------------------------------------------------------------------
  // Event registration (returns disposers)
  // -------------------------------------------------------------------------

  onNodeRegistered(handler: GatewayEventHandler<[string]>): () => void {
    return this.events.on("node.registered", handler);
  }

  onNodeDeregistered(handler: GatewayEventHandler<[string]>): () => void {
    return this.events.on("node.deregistered", handler);
  }

  onNodeDead(handler: GatewayEventHandler<[string]>): () => void {
    return this.events.on("node.dead", handler);
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  private wireFrameHandlers(config: GatewayConfig): void {
    this.server.onFrame((connectionId, frame) => {
      switch (frame.kind) {
        case "node.register":
          this.handleNodeRegister(connectionId, frame as NodeRegisterFrame, config);
          break;
        case "node.deregister":
          this.handleNodeDeregister(connectionId, frame as NodeDeregisterFrame);
          break;
        case "heartbeat.pong": {
          // Translate ephemeral connection ID → registered node ID
          const nodeId = this.connectionToNode.get(connectionId);
          if (nodeId) {
            this.healthMonitor.handlePong(nodeId);
            this.sessionManager.handleEvent(nodeId, "heartbeat");
          }
          break;
        }
        case "lane.message":
          this.handleLaneMessage(connectionId, frame as LaneMessageFrame);
          break;
        case "lane.message.ack":
          this.handleLaneMessageAck(connectionId, frame as LaneMessageAckFrame);
          break;
        default:
          // Other frames (session.update, etc.) are handled by higher layers
          break;
      }
    });
  }

  private wireConnectionHandlers(): void {
    this.server.onDisconnect((connectionId, _code, _reason) => {
      // Translate ephemeral connection ID → registered node ID
      const nodeId = this.connectionToNode.get(connectionId);
      if (nodeId) {
        const session = this.sessionManager.getSession(nodeId);
        if (session) {
          this.sessionManager.handleEvent(nodeId, "disconnect");
        }
        // Clean up connection mapping
        this.connectionToNode.delete(connectionId);
        this.nodeToConnection.delete(nodeId);
      }
    });
  }

  private wireHealthMonitorHandlers(): void {
    this.healthMonitor.onNodeDead((node) => {
      // Deregister dead nodes
      this.cleanupNode(node.nodeId);
      this.events.emit("node.dead", node.nodeId);
    });
  }

  private wireConfigWatcherHandlers(): void {
    this.configWatcher.onUpdated((_newConfig, changedFields) => {
      // Broadcast config change to all connected nodes
      const frame: GatewayFrame = {
        kind: "config.changed",
        fields: [...changedFields],
        timestamp: Date.now(),
      };
      for (const node of this.registry.all()) {
        this.sendToNode(node.nodeId, frame);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Frame handlers
  // -------------------------------------------------------------------------

  private handleNodeRegister(
    connectionId: string,
    frame: NodeRegisterFrame,
    config: GatewayConfig,
  ): void {
    const nodeId = frame.nodeId;

    try {
      // Clean up stale mappings before overwriting to prevent corruption.
      // Case 1: this connection was previously mapped to a different node
      const previousNodeId = this.connectionToNode.get(connectionId);
      if (previousNodeId && previousNodeId !== nodeId) {
        this.nodeToConnection.delete(previousNodeId);
      }
      // Case 2: this nodeId was previously mapped to a different connection
      const previousConnectionId = this.nodeToConnection.get(nodeId);
      if (previousConnectionId && previousConnectionId !== connectionId) {
        this.connectionToNode.delete(previousConnectionId);
      }

      // Register in node registry
      this.registry.register(nodeId, frame.capabilities);

      // Map ephemeral connection ID ↔ node ID
      this.connectionToNode.set(connectionId, nodeId);
      this.nodeToConnection.set(nodeId, connectionId);

      // Create session
      const session = this.sessionManager.createSession(nodeId);

      // Create lane dispatcher for this node
      const dispatcher = new LaneDispatcher(config.laneCapacity);
      this.router.setDispatcher(nodeId, dispatcher);

      // Send ack via the connection
      const ackFrame: GatewayFrame = {
        kind: "node.register.ack",
        nodeId,
        sessionId: `${nodeId}-${session.connectedAt}`,
      };
      this.server.sendFrame(connectionId, ackFrame);

      this.events.emit("node.registered", nodeId);
    } catch (err) {
      // Send error frame if registration fails (e.g., already registered)
      const errorFrame: GatewayFrame = {
        kind: "error",
        error: {
          type: "about:blank",
          title: "Registration failed",
          status: 409,
          detail: err instanceof Error ? err.message : String(err),
        },
        timestamp: Date.now(),
      };
      this.server.sendFrame(connectionId, errorFrame);
    }
  }

  private handleNodeDeregister(connectionId: string, frame: NodeDeregisterFrame): void {
    const nodeId = frame.nodeId;

    // Verify the connection owns this node — prevent cross-node deregistration
    const ownerConnection = this.nodeToConnection.get(nodeId);
    if (ownerConnection && ownerConnection !== connectionId) {
      const errorFrame: GatewayFrame = {
        kind: "error",
        error: {
          type: "about:blank",
          title: "Unauthorized deregistration",
          status: 403,
          detail: `Connection is not the owner of node '${nodeId}'`,
        },
        timestamp: Date.now(),
      };
      this.server.sendFrame(connectionId, errorFrame);
      return;
    }

    this.cleanupNode(nodeId);
    this.events.emit("node.deregistered", nodeId);
  }

  private handleLaneMessage(connectionId: string, frame: LaneMessageFrame): void {
    const nodeId = this.connectionToNode.get(connectionId);
    if (!nodeId) {
      const errorFrame: GatewayFrame = {
        kind: "error",
        error: {
          type: "about:blank",
          title: "Not registered",
          status: 403,
          detail: "Connection must register before sending lane messages",
        },
        timestamp: Date.now(),
      };
      this.server.sendFrame(connectionId, errorFrame);
      return;
    }

    try {
      this.router.route(frame.message);

      // Track the message for delivery guarantees
      this.deliveryTracker.track(nodeId, frame.message);

      // Send ack back to the originating connection
      const ackFrame: GatewayFrame = {
        kind: "lane.message.ack",
        messageId: frame.message.id,
      };
      this.server.sendFrame(connectionId, ackFrame);
    } catch (err) {
      // Send error frame back on routing failure
      const errorFrame: GatewayFrame = {
        kind: "error",
        error: {
          type: "about:blank",
          title: "Message routing failed",
          status: 500,
          detail: err instanceof Error ? err.message : String(err),
        },
        timestamp: Date.now(),
      };
      this.server.sendFrame(connectionId, errorFrame);
    }
  }

  private handleLaneMessageAck(connectionId: string, frame: LaneMessageAckFrame): void {
    const nodeId = this.connectionToNode.get(connectionId);
    if (nodeId) {
      this.deliveryTracker.ack(nodeId, frame.messageId);
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Send a frame to a registered node by translating nodeId → connectionId.
   */
  private sendToNode(nodeId: string, frame: GatewayFrame): void {
    const connectionId = this.nodeToConnection.get(nodeId);
    if (connectionId) {
      this.server.sendFrame(connectionId, frame);
    }
  }

  private cleanupNode(nodeId: string): void {
    // Remove in reverse order of creation
    this.router.removeDispatcher(nodeId);
    this.deliveryTracker.removeNode(nodeId);

    const session = this.sessionManager.getSession(nodeId);
    if (session) {
      this.sessionManager.destroySession(nodeId);
    }

    if (this.registry.get(nodeId)) {
      this.registry.deregister(nodeId);
    }

    // Clean up connection mapping
    const connectionId = this.nodeToConnection.get(nodeId);
    if (connectionId) {
      this.connectionToNode.delete(connectionId);
    }
    this.nodeToConnection.delete(nodeId);
  }
}
