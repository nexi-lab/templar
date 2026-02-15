import { GatewayNodeAlreadyRegisteredError, GatewayNodeNotFoundError } from "@templar/errors";
import type { NodeCapabilities, TaskRequirements } from "../protocol/index.js";
import { mapDelete, mapSet } from "../utils/immutable-map.js";

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

/**
 * Pre-computed Sets for O(1) capability lookups.
 */
interface CapabilitySets {
  readonly agentTypes: ReadonlySet<string>;
  readonly tools: ReadonlySet<string>;
  readonly channels: ReadonlySet<string>;
}

// ---------------------------------------------------------------------------
// NodeRegistry
// ---------------------------------------------------------------------------

/**
 * Registry of connected nodes with capability-based lookup.
 */
export class NodeRegistry {
  private nodes: ReadonlyMap<string, RegisteredNode> = new Map();
  /** Pre-computed capability Sets for O(1) membership checks */
  private capSets: ReadonlyMap<string, CapabilitySets> = new Map();

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
    this.nodes = mapSet(this.nodes, nodeId, node);
    // Pre-compute capability Sets for O(1) lookups
    this.capSets = mapSet(this.capSets, nodeId, {
      agentTypes: new Set(capabilities.agentTypes),
      tools: new Set(capabilities.tools),
      channels: new Set(capabilities.channels),
    });
    return node;
  }

  /**
   * Deregister a node from the gateway.
   */
  deregister(nodeId: string): void {
    if (!this.nodes.has(nodeId)) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    this.nodes = mapDelete(this.nodes, nodeId);
    this.capSets = mapDelete(this.capSets, nodeId);
  }

  /**
   * Get a registered node by ID.
   */
  get(nodeId: string): RegisteredNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Find nodes matching task requirements.
   * Uses pre-computed Sets for O(1) per-check lookups.
   */
  findByRequirements(requirements: TaskRequirements): readonly RegisteredNode[] {
    const results: RegisteredNode[] = [];
    for (const node of this.nodes.values()) {
      if (!node.isAlive) continue;

      const sets = this.capSets.get(node.nodeId);
      if (!sets) continue;

      if (!sets.agentTypes.has(requirements.agentType)) continue;
      if (requirements.tools) {
        const hasAllTools = requirements.tools.every((t) => sets.tools.has(t));
        if (!hasAllTools) continue;
      }
      if (requirements.channel) {
        if (!sets.channels.has(requirements.channel)) continue;
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
    this.nodes = mapSet(this.nodes, nodeId, updated);
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
    this.nodes = mapSet(this.nodes, nodeId, updated);
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
    this.capSets = new Map();
  }
}
