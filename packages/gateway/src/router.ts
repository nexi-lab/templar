import { GatewayNodeNotFoundError } from "@templar/errors";
import type { LaneMessage } from "@templar/gateway-protocol";
import type { LaneDispatcher } from "./lanes/lane-dispatcher.js";
import type { NodeRegistry } from "./registry/node-registry.js";
import { mapDelete, mapFilter, mapSet } from "./utils/immutable-map.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageRouter = (message: LaneMessage) => void;

// ---------------------------------------------------------------------------
// AgentRouter
// ---------------------------------------------------------------------------

/**
 * Routes channel messages to the appropriate node's lane dispatcher.
 *
 * Uses explicit channel → node bindings.
 * Falls back to capability-based selection via NodeRegistry.
 */
export class AgentRouter {
  private bindings: ReadonlyMap<string, string> = new Map();
  private dispatchers: ReadonlyMap<string, LaneDispatcher> = new Map();
  private readonly registry: NodeRegistry;

  constructor(registry: NodeRegistry) {
    this.registry = registry;
  }

  /**
   * Bind a channel to a specific node.
   */
  bind(channelId: string, nodeId: string): void {
    if (!this.registry.get(nodeId)) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    this.bindings = mapSet(this.bindings, channelId, nodeId);
  }

  /**
   * Remove a channel binding.
   */
  unbind(channelId: string): void {
    this.bindings = mapDelete(this.bindings, channelId);
  }

  /**
   * Register a lane dispatcher for a node.
   */
  setDispatcher(nodeId: string, dispatcher: LaneDispatcher): void {
    this.dispatchers = mapSet(this.dispatchers, nodeId, dispatcher);
  }

  /**
   * Remove a node's dispatcher (on deregister).
   */
  removeDispatcher(nodeId: string): void {
    this.dispatchers = mapDelete(this.dispatchers, nodeId);
    // Also remove any bindings to this node
    this.bindings = mapFilter(this.bindings, (_channelId, boundNodeId) => boundNodeId !== nodeId);
  }

  /**
   * Route a message to the appropriate node's lane dispatcher.
   */
  route(message: LaneMessage): void {
    const nodeId = this.bindings.get(message.channelId);
    if (!nodeId) {
      throw new GatewayNodeNotFoundError(`No binding for channel '${message.channelId}'`);
    }

    const dispatcher = this.dispatchers.get(nodeId);
    if (!dispatcher) {
      throw new GatewayNodeNotFoundError(nodeId);
    }

    dispatcher.dispatch(message);
  }

  /**
   * Drain all queued messages for a node in priority order.
   * Returns steer → collect → followup messages.
   */
  drainNode(nodeId: string): readonly LaneMessage[] {
    const dispatcher = this.dispatchers.get(nodeId);
    if (!dispatcher) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    return dispatcher.drain();
  }

  /**
   * Get the node bound to a channel.
   */
  getBinding(channelId: string): string | undefined {
    return this.bindings.get(channelId);
  }

  /**
   * Get all current bindings.
   */
  getAllBindings(): ReadonlyMap<string, string> {
    return this.bindings;
  }
}
