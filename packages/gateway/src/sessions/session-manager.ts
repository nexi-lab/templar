import { GatewayNodeAlreadyRegisteredError, GatewayNodeNotFoundError } from "@templar/errors";
import type { SessionEvent, SessionInfo } from "@templar/gateway-protocol";
import { mapDelete, mapSet } from "../utils/immutable-map.js";
import { type TransitionResult, transition } from "./state-machine.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionManagerConfig {
  /** Idle timeout in ms before CONNECTED → IDLE */
  readonly sessionTimeout: number;
  /** Suspend timeout in ms before IDLE → SUSPENDED */
  readonly suspendTimeout: number;
}

export type SessionEventHandler = (
  nodeId: string,
  result: TransitionResult,
  session: SessionInfo,
) => void;

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

/**
 * Manages per-node sessions with timer-driven lifecycle transitions.
 *
 * Each session tracks its state and transitions automatically:
 * CONNECTED → (idle timeout) → IDLE → (suspend timeout) → SUSPENDED → (cleanup) → DISCONNECTED
 */
export class SessionManager {
  private sessions: ReadonlyMap<string, SessionInfo> = new Map();
  private idleTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private suspendTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onTransitionHandlers: SessionEventHandler[] = [];
  private readonly config: SessionManagerConfig;

  constructor(config: SessionManagerConfig) {
    this.config = config;
  }

  /**
   * Create a new session for a node.
   */
  createSession(nodeId: string): SessionInfo {
    if (this.sessions.has(nodeId)) {
      throw new GatewayNodeAlreadyRegisteredError(nodeId);
    }
    const now = Date.now();
    const session: SessionInfo = {
      nodeId,
      state: "connected",
      connectedAt: now,
      lastActivityAt: now,
      reconnectCount: 0,
    };
    this.sessions = mapSet(this.sessions, nodeId, session);
    this.startIdleTimer(nodeId);
    return session;
  }

  /**
   * Apply an event to a node's session.
   */
  handleEvent(nodeId: string, event: SessionEvent): TransitionResult {
    const session = this.sessions.get(nodeId);
    if (!session) {
      throw new GatewayNodeNotFoundError(nodeId);
    }

    const result = transition(session.state, event);
    if (!result.valid) {
      this.emitTransition(nodeId, result, session);
      return result;
    }

    const now = Date.now();
    const updatedSession: SessionInfo = {
      ...session,
      state: result.state,
      lastActivityAt: now,
      ...(event === "reconnect" ? { reconnectCount: session.reconnectCount + 1 } : {}),
    };

    this.sessions = mapSet(this.sessions, nodeId, updatedSession);
    this.updateTimers(nodeId, result);
    this.emitTransition(nodeId, result, updatedSession);

    if (result.state === "disconnected") {
      this.cleanupSession(nodeId);
    }

    return result;
  }

  /**
   * Get the current session for a node.
   */
  getSession(nodeId: string): SessionInfo | undefined {
    return this.sessions.get(nodeId);
  }

  /**
   * Destroy a session and clean up all timers.
   */
  destroySession(nodeId: string): void {
    if (!this.sessions.has(nodeId)) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    this.cleanupSession(nodeId);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): readonly SessionInfo[] {
    return [...this.sessions.values()];
  }

  /**
   * Register a handler for state transitions.
   */
  onTransition(handler: SessionEventHandler): void {
    this.onTransitionHandlers = [...this.onTransitionHandlers, handler];
  }

  /**
   * Clean up all sessions and timers. Call on shutdown.
   */
  dispose(): void {
    for (const nodeId of this.sessions.keys()) {
      this.clearTimers(nodeId);
    }
    this.sessions = new Map();
    this.onTransitionHandlers = [];
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private startIdleTimer(nodeId: string): void {
    this.clearIdleTimer(nodeId);
    const timer = setTimeout(() => {
      this.handleEvent(nodeId, "idle_timeout");
    }, this.config.sessionTimeout);
    this.idleTimers.set(nodeId, timer);
  }

  private startSuspendTimer(nodeId: string): void {
    this.clearSuspendTimer(nodeId);
    const timer = setTimeout(() => {
      this.handleEvent(nodeId, "suspend_timeout");
    }, this.config.suspendTimeout);
    this.suspendTimers.set(nodeId, timer);
  }

  private updateTimers(nodeId: string, result: TransitionResult): void {
    switch (result.state) {
      case "connected":
        // Reset idle timer on activity
        this.clearSuspendTimer(nodeId);
        this.startIdleTimer(nodeId);
        break;
      case "idle":
        // Clear idle timer, start suspend timer
        this.clearIdleTimer(nodeId);
        this.startSuspendTimer(nodeId);
        break;
      case "suspended":
        // Clear all timers — waiting for reconnect or disconnect
        this.clearTimers(nodeId);
        break;
      case "disconnected":
        this.clearTimers(nodeId);
        break;
    }
  }

  private cleanupSession(nodeId: string): void {
    this.clearTimers(nodeId);
    this.sessions = mapDelete(this.sessions, nodeId);
  }

  private clearTimers(nodeId: string): void {
    this.clearIdleTimer(nodeId);
    this.clearSuspendTimer(nodeId);
  }

  private clearIdleTimer(nodeId: string): void {
    const timer = this.idleTimers.get(nodeId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.idleTimers.delete(nodeId);
    }
  }

  private clearSuspendTimer(nodeId: string): void {
    const timer = this.suspendTimers.get(nodeId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.suspendTimers.delete(nodeId);
    }
  }

  private emitTransition(nodeId: string, result: TransitionResult, session: SessionInfo): void {
    for (const handler of this.onTransitionHandlers) {
      handler(nodeId, result, session);
    }
  }
}
