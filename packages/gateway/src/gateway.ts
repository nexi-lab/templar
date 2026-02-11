import type {
  GatewayConfig,
  GatewayFrame,
  LaneMessageFrame,
  NodeDeregisterFrame,
  NodeRegisterFrame,
} from "@templar/gateway-protocol";
import { ConfigWatcher, type ConfigWatcherDeps } from "./config-watcher.js";
import { LaneDispatcher } from "./lanes/lane-dispatcher.js";
import { HealthMonitor } from "./registry/health-monitor.js";
import { NodeRegistry } from "./registry/node-registry.js";
import { AgentRouter } from "./router.js";
import { GatewayServer, type WsServerFactory } from "./server.js";
import { SessionManager } from "./sessions/session-manager.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplarGatewayDeps {
  /** WebSocket server factory — injectable for testing */
  readonly wsFactory?: WsServerFactory;
  /** Config watcher deps — injectable for testing */
  readonly configWatcherDeps?: ConfigWatcherDeps;
}

export type GatewayEventHandler<T extends unknown[] = []> = (...args: T) => void;

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

  private nodeDeadHandlers: readonly GatewayEventHandler<[string]>[] = [];
  private nodeRegisteredHandlers: readonly GatewayEventHandler<[string]>[] = [];
  private nodeDeregisteredHandlers: readonly GatewayEventHandler<[string]>[] = [];

  constructor(config: GatewayConfig, deps: TemplarGatewayDeps = {}) {
    // 1. Node registry
    this.registry = new NodeRegistry();

    // 2. Session manager
    this.sessionManager = new SessionManager({
      sessionTimeout: config.sessionTimeout,
      suspendTimeout: config.suspendTimeout,
    });

    // 3. Router
    this.router = new AgentRouter(this.registry);

    // 4. Config watcher
    this.configWatcher = new ConfigWatcher(config, 300, deps.configWatcherDeps);

    // 5. WebSocket server with token validation
    this.server = new GatewayServer(
      {
        port: config.port,
        validateToken: (token) => token === config.nexusApiKey,
      },
      deps.wsFactory,
    );

    // 6. Health monitor (sends pings via server)
    this.healthMonitor = new HealthMonitor(
      this.registry,
      { healthCheckInterval: config.healthCheckInterval },
      (nodeId) => {
        const frame: GatewayFrame = { kind: "heartbeat.ping", timestamp: Date.now() };
        this.server.sendFrame(nodeId, frame);
      },
    );

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

  // -------------------------------------------------------------------------
  // Event registration
  // -------------------------------------------------------------------------

  onNodeRegistered(handler: GatewayEventHandler<[string]>): void {
    this.nodeRegisteredHandlers = [...this.nodeRegisteredHandlers, handler];
  }

  onNodeDeregistered(handler: GatewayEventHandler<[string]>): void {
    this.nodeDeregisteredHandlers = [...this.nodeDeregisteredHandlers, handler];
  }

  onNodeDead(handler: GatewayEventHandler<[string]>): void {
    this.nodeDeadHandlers = [...this.nodeDeadHandlers, handler];
  }

  // -------------------------------------------------------------------------
  // Wiring
  // -------------------------------------------------------------------------

  private wireFrameHandlers(config: GatewayConfig): void {
    this.server.onFrame((nodeId, frame) => {
      switch (frame.kind) {
        case "node.register":
          this.handleNodeRegister(nodeId, frame as NodeRegisterFrame, config);
          break;
        case "node.deregister":
          this.handleNodeDeregister(nodeId, frame as NodeDeregisterFrame);
          break;
        case "heartbeat.pong":
          this.healthMonitor.handlePong(nodeId);
          this.sessionManager.handleEvent(nodeId, "heartbeat");
          break;
        case "lane.message":
          this.handleLaneMessage(frame as LaneMessageFrame);
          break;
        default:
          // Other frames (ack, session.update, etc.) are handled by higher layers
          break;
      }
    });
  }

  private wireConnectionHandlers(): void {
    this.server.onDisconnect((nodeId, _code, _reason) => {
      // If node was registered, handle graceful disconnect
      const session = this.sessionManager.getSession(nodeId);
      if (session) {
        this.sessionManager.handleEvent(nodeId, "disconnect");
      }
    });
  }

  private wireHealthMonitorHandlers(): void {
    this.healthMonitor.onNodeDead((node) => {
      // Deregister dead nodes
      this.cleanupNode(node.nodeId);
      for (const handler of this.nodeDeadHandlers) {
        handler(node.nodeId);
      }
    });
  }

  private wireConfigWatcherHandlers(): void {
    this.configWatcher.onUpdated((_newConfig, changedFields) => {
      // Update session manager timeouts if changed
      if (changedFields.includes("sessionTimeout") || changedFields.includes("suspendTimeout")) {
        // SessionManager uses config at creation, so we'd need to recreate or update
        // For now, notify connected nodes of the config change
      }

      // Broadcast config change to all connected nodes
      const frame: GatewayFrame = {
        kind: "config.changed",
        fields: [...changedFields],
        timestamp: Date.now(),
      };
      for (const node of this.registry.all()) {
        this.server.sendFrame(node.nodeId, frame);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Frame handlers
  // -------------------------------------------------------------------------

  private handleNodeRegister(
    wsNodeId: string,
    frame: NodeRegisterFrame,
    config: GatewayConfig,
  ): void {
    const nodeId = frame.nodeId;

    try {
      // Register in node registry
      this.registry.register(nodeId, frame.capabilities);

      // Create session
      const session = this.sessionManager.createSession(nodeId);

      // Create lane dispatcher for this node
      const dispatcher = new LaneDispatcher(config.laneCapacity);
      this.router.setDispatcher(nodeId, dispatcher);

      // Send ack
      const ackFrame: GatewayFrame = {
        kind: "node.register.ack",
        nodeId,
        sessionId: `${nodeId}-${session.connectedAt}`,
      };
      this.server.sendFrame(wsNodeId, ackFrame);

      for (const handler of this.nodeRegisteredHandlers) {
        handler(nodeId);
      }
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
      this.server.sendFrame(wsNodeId, errorFrame);
    }
  }

  private handleNodeDeregister(_wsNodeId: string, frame: NodeDeregisterFrame): void {
    const nodeId = frame.nodeId;
    this.cleanupNode(nodeId);

    for (const handler of this.nodeDeregisteredHandlers) {
      handler(nodeId);
    }
  }

  private handleLaneMessage(frame: LaneMessageFrame): void {
    this.router.route(frame.message);
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  private cleanupNode(nodeId: string): void {
    // Remove in reverse order of creation
    this.router.removeDispatcher(nodeId);

    const session = this.sessionManager.getSession(nodeId);
    if (session) {
      this.sessionManager.destroySession(nodeId);
    }

    if (this.registry.get(nodeId)) {
      this.registry.deregister(nodeId);
    }
  }
}
