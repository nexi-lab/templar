import { BindingResolver } from "./binding-resolver.js";
import { ConfigWatcher, type ConfigWatcherDeps } from "./config-watcher.js";
import { ConversationStore } from "./conversations/conversation-store.js";
import { DelegationManager, type DelegationManagerConfig } from "./delegation-manager.js";
import type { DelegationStore } from "./delegation-store.js";
import { DeliveryTracker } from "./delivery-tracker.js";
import { timingSafeTokenCompare, verifyDeviceJwt } from "./device-auth.js";
import {
  type DeviceKeyStore,
  InMemoryDeviceKeyStore,
  importBase64urlPublicKey,
} from "./device-key-store.js";
import type {
  DelegationAcceptFrame,
  DelegationCancelFrame,
  DelegationRequestFrame,
  DelegationResultFrame,
  GatewayConfig,
  GatewayFrame,
  LaneMessage,
  LaneMessageAckFrame,
  LaneMessageFrame,
  NodeDeregisterFrame,
  NodeRegisterFrame,
  SessionIdentityContext,
} from "./protocol/index.js";
import { MessageBuffer } from "./queue/message-buffer.js";
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
  /** Delegation lifecycle manager (optional, created if delegationConfig provided) */
  readonly delegationManager?: DelegationManager;
  /** Delegation store for persistent tracking (optional, graceful degradation) */
  readonly delegationStore?: DelegationStore;
  /** Delegation config (providing this enables the delegation subsystem) */
  readonly delegationConfig?: Partial<DelegationManagerConfig>;
}

export type GatewayEventHandler<T extends unknown[] = []> = (...args: T) => void;

// ---------------------------------------------------------------------------
// Gateway Events
// ---------------------------------------------------------------------------

type GatewayEvents = {
  "node.registered": [nodeId: string];
  "node.deregistered": [nodeId: string];
  "node.dead": [nodeId: string];
  "delegation.started": [delegationId: string, fromNodeId: string, toNodeId: string];
  "delegation.accepted": [delegationId: string, nodeId: string];
  "delegation.failed": [delegationId: string, nodeId: string, reason: string];
  "delegation.exhausted": [delegationId: string, failedNodes: readonly string[]];
  "delegation.completed": [delegationId: string, nodeId: string];
  "delegation.cancelled": [delegationId: string, reason: string];
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
 * - MessageBuffer (per-node priority queues)
 * - ConfigWatcher (hot-reload)
 * - ConversationStore (conversation-to-node bindings with TTL)
 */
export class TemplarGateway {
  private readonly registry: NodeRegistry;
  private readonly healthMonitor: HealthMonitor;
  private readonly sessionManager: SessionManager;
  private readonly router: AgentRouter;
  private readonly configWatcher: ConfigWatcher;
  private readonly server: GatewayServer;
  private readonly deliveryTracker: DeliveryTracker;
  private readonly conversationStore: ConversationStore;
  private readonly deviceKeyStore: DeviceKeyStore;
  private readonly delegationManager: DelegationManager | undefined;
  private readonly events: Emitter<GatewayEvents> = createEmitter();

  // Bidirectional mapping between ephemeral WS connection IDs and registered node IDs.
  // Populated during node.register, cleaned up during deregister/disconnect.
  private connectionToNode = new Map<string, string>();
  private nodeToConnection = new Map<string, string>();

  private bindingResolver: BindingResolver | undefined;

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

    // 5. Device key store for Ed25519 auth
    this.deviceKeyStore = new InMemoryDeviceKeyStore({
      maxKeys: config.deviceAuth?.maxDeviceKeys ?? 10_000,
    });
    if (config.deviceAuth?.knownKeys) {
      (this.deviceKeyStore as InMemoryDeviceKeyStore).loadFromConfig(config.deviceAuth.knownKeys);
    }

    // 6. WebSocket server with token validation
    this.server = new GatewayServer(
      {
        port: config.port,
        validateToken: (token) => {
          // Ed25519 JWTs start with "eyJ" — lightweight format check, full verify in frame handler
          if (
            (config.authMode === "ed25519" || config.authMode === "dual") &&
            token.startsWith("eyJ")
          ) {
            return { valid: true, authMethod: "ed25519" as const };
          }
          // Legacy token comparison with timing-safe check
          if (config.authMode === "legacy" || config.authMode === "dual") {
            return timingSafeTokenCompare(token, config.nexusApiKey);
          }
          // ed25519-only mode but non-JWT token → reject
          return false;
        },
      },
      deps.wsFactory,
    );

    // 7. Health monitor (injectable, sends pings via server)
    this.healthMonitor =
      deps.healthMonitor ??
      new HealthMonitor(
        this.registry,
        { healthCheckInterval: config.healthCheckInterval },
        (nodeId) => {
          this.sendToNode(nodeId, { kind: "heartbeat.ping", timestamp: Date.now() });
        },
      );

    // 8. Delivery tracker for lane message ack
    this.deliveryTracker = new DeliveryTracker(config.laneCapacity);

    // 9. Conversation store for session scoping
    this.conversationStore = new ConversationStore({
      maxConversations: config.maxConversations,
      conversationTtl: config.conversationTtl,
    });
    this.router.setConversationStore(this.conversationStore);
    this.router.setConversationScope(config.defaultConversationScope);

    // 10. Binding resolver for multi-agent routing
    if (config.bindings && config.bindings.length > 0) {
      this.bindingResolver = new BindingResolver();
      this.bindingResolver.updateBindings(config.bindings);
      this.router.setBindingResolver(this.bindingResolver);
    }
    // Agent resolution is delegated to the registry's reverse index.
    // NodeRegistry maintains agentId → nodeId automatically during register/deregister.
    this.router.setAgentNodeResolver((agentId) => this.registry.resolveAgent(agentId));

    // 11. Delegation manager (optional — created when config or deps provided)
    if (deps.delegationManager) {
      this.delegationManager = deps.delegationManager;
    } else if (deps.delegationConfig) {
      this.delegationManager = new DelegationManager(
        deps.delegationConfig,
        this.registry,
        (nodeId, frame) => this.sendToNode(nodeId, frame),
        deps.delegationStore,
      );
    }

    // Wire all event handlers
    this.wireFrameHandlers(config);
    this.wireConnectionHandlers();
    this.wireHealthMonitorHandlers();
    this.wireConfigWatcherHandlers();
    this.wireSessionTransitionHandlers();
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
    this.delegationManager?.dispose();
    await this.configWatcher.stop();
    this.sessionManager.dispose();
    this.registry.clear();
    this.deliveryTracker.clear();
    this.conversationStore.clear();
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

  /**
   * Get the conversation store (read-only access).
   */
  getConversationStore(): ConversationStore {
    return this.conversationStore;
  }

  /**
   * Update the identity context for a session.
   *
   * Emits a `session.identity.update` frame to the node if the identity changed.
   * Returns the updated session, or undefined if identity was unchanged.
   * Throws if nodeId is not found.
   */
  updateSessionIdentity(
    nodeId: string,
    identityContext: SessionIdentityContext | undefined,
  ): boolean {
    const updated = this.sessionManager.updateIdentityContext(nodeId, identityContext);
    if (!updated) return false;

    // Emit identity update frame to the node (use frozen clone from session, not raw input)
    const frame: GatewayFrame = {
      kind: "session.identity.update",
      sessionId: updated.sessionId,
      nodeId,
      identity: updated.identityContext?.identity ?? {},
      timestamp: Date.now(),
    };
    this.sendToNode(nodeId, frame);
    return true;
  }

  /**
   * Get the identity context for a session.
   */
  getSessionIdentity(nodeId: string): SessionIdentityContext | undefined {
    return this.sessionManager.getSession(nodeId)?.identityContext;
  }

  /**
   * Get the binding resolver (for testing/inspection).
   */
  getBindingResolver(): BindingResolver | undefined {
    return this.bindingResolver;
  }

  /**
   * Get the delegation manager (for testing/inspection).
   */
  getDelegationManager(): DelegationManager | undefined {
    return this.delegationManager;
  }

  /**
   * Get the agentId → nodeId map (for testing/inspection).
   * Delegates to NodeRegistry's reverse index.
   */
  getAgentToNodeMap(): ReadonlyMap<string, string> {
    return this.registry.getAgentIndex();
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
        case "delegation.request": {
          const reqNodeId = this.connectionToNode.get(connectionId);
          if (!reqNodeId) {
            this.sendAuthError(connectionId, 403, "Connection must register before delegating");
            break;
          }
          const reqFrame = frame as DelegationRequestFrame;
          if (reqNodeId !== reqFrame.fromNodeId) {
            this.sendAuthError(connectionId, 403, "Cannot delegate on behalf of another node");
            break;
          }
          this.handleDelegationRequest(connectionId, reqFrame);
          break;
        }
        case "delegation.accept":
        case "delegation.result": {
          const respNodeId = this.connectionToNode.get(connectionId);
          if (!respNodeId || !this.delegationManager) break;
          this.delegationManager.handleDelegationFrame(
            frame as DelegationAcceptFrame | DelegationResultFrame,
          );
          break;
        }
        case "delegation.cancel": {
          const cancelNodeId = this.connectionToNode.get(connectionId);
          if (!cancelNodeId || !this.delegationManager) break;
          const cancelFrame = frame as DelegationCancelFrame;
          this.delegationManager.cancel(cancelFrame.delegationId, cancelFrame.reason);
          break;
        }
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

    // Piggyback conversation TTL sweep on health check interval
    this.healthMonitor.onSweep(() => {
      this.conversationStore.sweep();
      this.delegationManager?.sweep();
    });
  }

  private wireConfigWatcherHandlers(): void {
    this.configWatcher.onUpdated((newConfig, changedFields) => {
      // Handle conversation scope changes — clear store to prevent stale bindings
      if (changedFields.includes("defaultConversationScope")) {
        this.router.setConversationScope(newConfig.defaultConversationScope);
        this.conversationStore.clear();
      }

      // Handle binding changes — recompile and swap
      if (changedFields.includes("bindings")) {
        if (newConfig.bindings && newConfig.bindings.length > 0) {
          if (this.bindingResolver) {
            this.bindingResolver.updateBindings(newConfig.bindings);
          } else {
            // Bindings added to a config that didn't have them before
            this.bindingResolver = new BindingResolver();
            this.bindingResolver.updateBindings(newConfig.bindings);
            this.router.setBindingResolver(this.bindingResolver);
          }
        }
        // When bindings are removed from config, we clear the resolver's compiled
        // list rather than removing the resolver entirely. An empty resolver produces
        // no matches, so route() falls through to channel bindings — which is the
        // correct backward-compatible behavior. We intentionally keep the resolver
        // instance because router.setBindingResolver() was already called and there
        // is no clearBindingResolver() API (nor should there be — empty resolver
        // achieves the same effect with less complexity).
        if (this.bindingResolver && (!newConfig.bindings || newConfig.bindings.length === 0)) {
          this.bindingResolver.updateBindings([]);
        }
      }

      // Update conversation store config on relevant field changes
      if (changedFields.includes("maxConversations") || changedFields.includes("conversationTtl")) {
        this.conversationStore.updateConfig({
          maxConversations: newConfig.maxConversations,
          conversationTtl: newConfig.conversationTtl,
        });
      }

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

  private wireSessionTransitionHandlers(): void {
    this.sessionManager.onTransition((nodeId, result, session) => {
      if (!result.valid) return;

      const frame: GatewayFrame = {
        kind: "session.update",
        sessionId: session.sessionId,
        nodeId,
        state: session.state,
        timestamp: Date.now(),
      };
      this.sendToNode(nodeId, frame);
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
    const authMode = config.authMode;

    // Async wrapper for Ed25519 verification (sync path for legacy)
    const proceed = () => this.completeNodeRegister(connectionId, frame, config);

    // --- Ed25519 auth path ---
    if (frame.signature && (authMode === "ed25519" || authMode === "dual")) {
      void this.verifyAndRegister(connectionId, frame, config, proceed);
      return;
    }

    // --- Legacy token path ---
    if (frame.token && !frame.signature) {
      if (authMode === "ed25519") {
        // ed25519-only mode rejects legacy tokens
        this.sendAuthError(connectionId, 403, "Legacy token auth is disabled");
        return;
      }
      // Verify legacy token
      if (!timingSafeTokenCompare(frame.token, config.nexusApiKey)) {
        this.sendAuthError(connectionId, 401, "Invalid authentication token");
        return;
      }
      if (authMode === "dual") {
        console.warn(
          `[TemplarGateway] DEPRECATION: Node '${nodeId}' using legacy token auth. Migrate to Ed25519 device keys.`,
        );
      }
      proceed();
      return;
    }

    // No token and no signature
    this.sendAuthError(connectionId, 401, "Missing authentication credentials");
  }

  private async verifyAndRegister(
    connectionId: string,
    frame: NodeRegisterFrame,
    config: GatewayConfig,
    proceed: () => void,
  ): Promise<void> {
    const nodeId = frame.nodeId;

    try {
      // Look up stored public key
      let publicKey = this.deviceKeyStore.get(nodeId);

      if (!publicKey) {
        // TOFU: accept and store the key from the frame
        const allowTofu = config.deviceAuth?.allowTofu ?? false;
        if (allowTofu && frame.publicKey) {
          publicKey = importBase64urlPublicKey(frame.publicKey);
          this.deviceKeyStore.set(nodeId, publicKey);
          console.warn(`[TemplarGateway] TOFU: Accepted new device key for node '${nodeId}'`);
        } else {
          this.sendAuthError(
            connectionId,
            403,
            "Unknown device key and TOFU is disabled; pre-register the key",
          );
          return;
        }
      } else if (frame.publicKey) {
        // Key already stored — verify the presented key matches
        const presentedKey = importBase64urlPublicKey(frame.publicKey);
        const storedDer = (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString(
          "base64url",
        );
        const presentedDer = (
          presentedKey.export({ type: "spki", format: "der" }) as Buffer
        ).toString("base64url");
        if (storedDer !== presentedDer) {
          this.sendAuthError(
            connectionId,
            403,
            "Device key mismatch: public key does not match previously registered key",
          );
          return;
        }
      }

      // Verify the JWT signature
      // signature is guaranteed non-undefined here (checked at call site)
      const signature = frame.signature as string;
      const result = await verifyDeviceJwt(signature, publicKey);
      if (!result.valid) {
        this.sendAuthError(connectionId, 401, result.error ?? "JWT verification failed");
        return;
      }

      // Verify JWT sub matches frame nodeId
      if (result.nodeId !== nodeId) {
        this.sendAuthError(connectionId, 401, "JWT subject does not match nodeId");
        return;
      }

      proceed();
    } catch (err) {
      this.sendAuthError(
        connectionId,
        401,
        `Device auth failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private completeNodeRegister(
    connectionId: string,
    frame: NodeRegisterFrame,
    config: GatewayConfig,
  ): void {
    const nodeId = frame.nodeId;

    try {
      // Clean up stale mappings before overwriting to prevent corruption.
      const previousNodeId = this.connectionToNode.get(connectionId);
      if (previousNodeId && previousNodeId !== nodeId) {
        this.nodeToConnection.delete(previousNodeId);
      }
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

      // Create message buffer for this node
      const dispatcher = new MessageBuffer(config.laneCapacity);
      this.router.setDispatcher(nodeId, dispatcher);

      // Send ack via the connection
      const ackFrame: GatewayFrame = {
        kind: "node.register.ack",
        nodeId,
        sessionId: session.sessionId,
      };
      this.server.sendFrame(connectionId, ackFrame);

      this.events.emit("node.registered", nodeId);
    } catch (err) {
      this.sendErrorFrame(
        connectionId,
        "Registration failed",
        409,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private sendAuthError(connectionId: string, status: number, detail: string): void {
    this.sendErrorFrame(connectionId, "Authentication failed", status, detail);
  }

  private sendErrorFrame(
    connectionId: string,
    title: string,
    status: number,
    detail: string,
  ): void {
    this.server.sendFrame(connectionId, {
      kind: "error",
      error: { type: "about:blank", title, status, detail },
      timestamp: Date.now(),
    });
  }

  private handleNodeDeregister(connectionId: string, frame: NodeDeregisterFrame): void {
    const nodeId = frame.nodeId;

    // Verify the connection owns this node — prevent cross-node deregistration
    const ownerConnection = this.nodeToConnection.get(nodeId);
    if (ownerConnection && ownerConnection !== connectionId) {
      this.sendErrorFrame(
        connectionId,
        "Unauthorized deregistration",
        403,
        `Connection is not the owner of node '${nodeId}'`,
      );
      return;
    }

    this.cleanupNode(nodeId);
    this.events.emit("node.deregistered", nodeId);
  }

  /**
   * Handle lane.message frames from the WebSocket transport.
   *
   * Note: This uses route() (scope-free) intentionally. Conversation scoping
   * is applied by channel adapters at a higher layer via router.routeWithScope().
   * The raw frame handler is the low-level transport path — it routes messages
   * to the correct node but does not create conversation bindings.
   */
  private handleLaneMessage(connectionId: string, frame: LaneMessageFrame): void {
    const nodeId = this.connectionToNode.get(connectionId);
    if (!nodeId) {
      this.sendErrorFrame(
        connectionId,
        "Not registered",
        403,
        "Connection must register before sending lane messages",
      );
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
      this.sendErrorFrame(
        connectionId,
        "Message routing failed",
        500,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  private handleDelegationRequest(connectionId: string, frame: DelegationRequestFrame): void {
    if (!this.delegationManager) {
      const errorFrame: GatewayFrame = {
        kind: "error",
        error: {
          type: "about:blank",
          title: "Delegation not enabled",
          status: 501,
          detail: "Delegation subsystem is not configured on this gateway",
        },
        timestamp: Date.now(),
      };
      this.server.sendFrame(connectionId, errorFrame);
      return;
    }

    void this.delegationManager.delegate(frame).then(
      (result) => {
        this.sendToNode(frame.fromNodeId, result);
      },
      (err) => {
        const errorFrame: GatewayFrame = {
          kind: "error",
          error: {
            type: "about:blank",
            title: "Delegation failed",
            status: 500,
            detail: err instanceof Error ? err.message : String(err),
          },
          timestamp: Date.now(),
        };
        this.sendToNode(frame.fromNodeId, errorFrame);
      },
    );
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
    // Cancel all delegations involving this node
    this.delegationManager?.cleanupNode(nodeId);

    // Remove in reverse order of creation
    this.router.removeDispatcher(nodeId);
    this.conversationStore.removeNode(nodeId);
    this.deliveryTracker.removeNode(nodeId);

    // Note: agentId → nodeId cleanup is handled by registry.deregister() below.

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
