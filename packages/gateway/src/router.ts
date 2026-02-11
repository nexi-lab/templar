import { GatewayNodeNotFoundError } from "@templar/errors";
import type { LaneMessage } from "@templar/gateway-protocol";
import type { LaneDispatcher } from "./lanes/lane-dispatcher.js";
import type { NodeRegistry } from "./registry/node-registry.js";

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
    this.bindings = new Map([...this.bindings, [channelId, nodeId]]);
  }

  /**
   * Remove a channel binding.
   */
  unbind(channelId: string): void {
    const next = new Map(this.bindings);
    next.delete(channelId);
    this.bindings = next;
  }

  /**
   * Register a lane dispatcher for a node.
   */
  setDispatcher(nodeId: string, dispatcher: LaneDispatcher): void {
    this.dispatchers = new Map([...this.dispatchers, [nodeId, dispatcher]]);
  }

  /**
   * Remove a node's dispatcher (on deregister).
   */
  removeDispatcher(nodeId: string): void {
    const next = new Map(this.dispatchers);
    next.delete(nodeId);
    this.dispatchers = next;

    // Also remove any bindings to this node
    const bindingNext = new Map<string, string>();
    for (const [channelId, boundNodeId] of this.bindings) {
      if (boundNodeId !== nodeId) {
        bindingNext.set(channelId, boundNodeId);
      }
    }
    this.bindings = bindingNext;
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
