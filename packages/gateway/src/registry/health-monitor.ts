import type { NodeRegistry, RegisteredNode } from "./node-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeDeadHandler = (node: RegisteredNode) => void;
export type PingSender = (nodeId: string) => void;

export interface HealthMonitorConfig {
  /** Health check interval in ms */
  readonly healthCheckInterval: number;
}

// ---------------------------------------------------------------------------
// HealthMonitor
// ---------------------------------------------------------------------------

/**
 * Single sweep heartbeat monitor following the ws library pattern.
 *
 * One interval sweeps all nodes:
 * 1. For each node: if !isAlive → dead (missed last pong)
 * 2. Mark all as !isAlive
 * 3. Send ping to all
 * 4. On pong → mark isAlive = true
 */
export class HealthMonitor {
  private timer: ReturnType<typeof setInterval> | undefined;
  private nodeDeadHandlers: readonly NodeDeadHandler[] = [];
  private readonly registry: NodeRegistry;
  private readonly config: HealthMonitorConfig;
  private readonly sendPing: PingSender;

  constructor(registry: NodeRegistry, config: HealthMonitorConfig, sendPing: PingSender) {
    this.registry = registry;
    this.config = config;
    this.sendPing = sendPing;
  }

  /**
   * Start the periodic health check sweep.
   */
  start(): void {
    if (this.timer !== undefined) return;
    this.timer = setInterval(() => this.sweep(), this.config.healthCheckInterval);
  }

  /**
   * Stop the health monitor.
   */
  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Register a handler for when a node is detected as dead.
   */
  onNodeDead(handler: NodeDeadHandler): void {
    this.nodeDeadHandlers = [...this.nodeDeadHandlers, handler];
  }

  /**
   * Handle a pong response from a node.
   */
  handlePong(nodeId: string): void {
    this.registry.markAlive(nodeId);
  }

  /**
   * Whether the monitor is currently running.
   */
  get isRunning(): boolean {
    return this.timer !== undefined;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private sweep(): void {
    const nodes = this.registry.all();
    for (const node of nodes) {
      if (!node.isAlive) {
        // Node missed last pong — it's dead
        this.registry.markDead(node.nodeId);
        for (const handler of this.nodeDeadHandlers) {
          handler(node);
        }
      } else {
        // Mark as not alive, then ping. Next sweep checks if pong arrived.
        this.registry.markDead(node.nodeId);
        this.sendPing(node.nodeId);
      }
    }
  }
}
