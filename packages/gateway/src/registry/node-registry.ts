import { GatewayNodeAlreadyRegisteredError, GatewayNodeNotFoundError } from "@templar/errors";
import type { NodeCapabilities, TaskRequirements } from "@templar/gateway-protocol";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A registered node in the gateway.
 */
export interface RegisteredNode {
  readonly nodeId: string;
  readonly capabilities: NodeCapabilities;
  readonly registeredAt: number;
  readonly isAlive: boolean;
  readonly lastPong: number;
}

// ---------------------------------------------------------------------------
// NodeRegistry
// ---------------------------------------------------------------------------

/**
 * Registry of connected nodes with capability-based lookup.
 */
export class NodeRegistry {
  private nodes: ReadonlyMap<string, RegisteredNode> = new Map();

  /**
   * Register a node with the gateway.
   */
  register(nodeId: string, capabilities: NodeCapabilities): RegisteredNode {
    if (this.nodes.has(nodeId)) {
      throw new GatewayNodeAlreadyRegisteredError(nodeId);
    }
    const now = Date.now();
    const node: RegisteredNode = {
      nodeId,
      capabilities,
      registeredAt: now,
      isAlive: true,
      lastPong: now,
    };
    this.nodes = new Map([...this.nodes, [nodeId, node]]);
    return node;
  }

  /**
   * Deregister a node from the gateway.
   */
  deregister(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    const next = new Map(this.nodes);
    next.delete(nodeId);
    this.nodes = next;
  }

  /**
   * Get a registered node by ID.
   */
  get(nodeId: string): RegisteredNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Find nodes matching task requirements.
   */
  findByRequirements(requirements: TaskRequirements): readonly RegisteredNode[] {
    const results: RegisteredNode[] = [];
    for (const node of this.nodes.values()) {
      if (!node.isAlive) continue;
      if (!node.capabilities.agentTypes.includes(requirements.agentType)) continue;
      if (requirements.tools) {
        const hasAllTools = requirements.tools.every((t) => node.capabilities.tools.includes(t));
        if (!hasAllTools) continue;
      }
      if (requirements.channel) {
        if (!node.capabilities.channels.includes(requirements.channel)) continue;
      }
      results.push(node);
    }
    return results;
  }

  /**
   * Get all registered nodes.
   */
  all(): readonly RegisteredNode[] {
    return [...this.nodes.values()];
  }

  /**
   * Mark a node as alive (received pong).
   */
  markAlive(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const updated: RegisteredNode = {
      ...node,
      isAlive: true,
      lastPong: Date.now(),
    };
    this.nodes = new Map([...this.nodes, [nodeId, updated]]);
  }

  /**
   * Mark a node as dead (missed pong).
   */
  markDead(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const updated: RegisteredNode = {
      ...node,
      isAlive: false,
    };
    this.nodes = new Map([...this.nodes, [nodeId, updated]]);
  }

  /**
   * Get all alive nodes (for heartbeat sweep).
   */
  getAliveNodes(): readonly RegisteredNode[] {
    return [...this.nodes.values()].filter((n) => n.isAlive);
  }

  /**
   * Get the count of registered nodes.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Clear all nodes. Call on shutdown.
   */
  clear(): void {
    this.nodes = new Map();
  }
}
