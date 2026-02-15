import { GatewayNodeNotFoundError } from "@templar/errors";
import type { ConversationStore } from "./conversations/conversation-store.js";
import type { LaneDispatcher } from "./lanes/lane-dispatcher.js";
import {
  type ConversationKeyInput,
  type ConversationKeyResult,
  type ConversationScope,
  type LaneMessage,
  type MessageRoutingContext,
  resolveConversationKey,
} from "./protocol/index.js";
import type { NodeRegistry } from "./registry/node-registry.js";
import { mapDelete, mapFilter, mapSet } from "./utils/immutable-map.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a ConversationKeyInput from routing context, omitting undefined
 * properties to satisfy exactOptionalPropertyTypes.
 */
function buildKeyInput(
  scope: ConversationScope,
  agentId: string,
  channelId: string,
  ctx?: MessageRoutingContext,
): ConversationKeyInput {
  if (!ctx) {
    return { scope, agentId, channelId };
  }

  return {
    scope,
    agentId,
    channelId,
    ...(ctx.peerId ? { peerId: ctx.peerId } : {}),
    ...(ctx.accountId ? { accountId: ctx.accountId } : {}),
    ...(ctx.groupId ? { groupId: ctx.groupId } : {}),
    ...(ctx.messageType ? { messageType: ctx.messageType } : {}),
  };
}

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
 *
 * Supports conversation scoping via ConversationStore to isolate
 * conversations by peer, channel, and account.
 */
export class AgentRouter {
  private bindings: ReadonlyMap<string, string> = new Map();
  private dispatchers: ReadonlyMap<string, LaneDispatcher> = new Map();
  private readonly registry: NodeRegistry;
  private conversationStore: ConversationStore | undefined;
  private conversationScope: ConversationScope = "per-channel-peer";
  private agentScopes: ReadonlyMap<string, ConversationScope> = new Map();

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
   * Route a message with conversation scoping.
   *
   * 1. Determine effective scope (agent override → gateway default)
   * 2. Compute conversation key from scope + routing context
   * 3. Dispatch via existing route() — throws on missing binding/dispatcher
   * 4. Bind conversation to node only after successful dispatch
   */
  routeWithScope(message: LaneMessage, agentId: string): ConversationKeyResult {
    const scope = this.agentScopes.get(agentId) ?? this.conversationScope;

    const input = buildKeyInput(scope, agentId, message.channelId, message.routingContext);
    const result = resolveConversationKey(input);

    // Dispatch first — if route() throws, no stale conversation binding is created
    this.route(message);

    // Bind conversation to node only after successful dispatch
    const nodeId = this.bindings.get(message.channelId);
    if (nodeId && this.conversationStore) {
      this.conversationStore.bind(result.key, nodeId);
    }

    return result;
  }

  /**
   * Get the conversation key for a message without routing it.
   */
  resolveConversation(message: LaneMessage, agentId: string): ConversationKeyResult {
    const scope = this.agentScopes.get(agentId) ?? this.conversationScope;
    const input = buildKeyInput(scope, agentId, message.channelId, message.routingContext);
    return resolveConversationKey(input);
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

  // -------------------------------------------------------------------------
  // Conversation scoping configuration
  // -------------------------------------------------------------------------

  /**
   * Set the conversation store (called by gateway during setup).
   */
  setConversationStore(store: ConversationStore): void {
    this.conversationStore = store;
  }

  /**
   * Get the conversation store.
   */
  getConversationStore(): ConversationStore | undefined {
    return this.conversationStore;
  }

  /**
   * Update the default conversation scope (hot-reload).
   */
  setConversationScope(scope: ConversationScope): void {
    this.conversationScope = scope;
  }

  /**
   * Get the current default conversation scope.
   */
  getConversationScope(): ConversationScope {
    return this.conversationScope;
  }

  /**
   * Set a per-agent scope override.
   */
  setAgentScope(agentId: string, scope: ConversationScope): void {
    this.agentScopes = mapSet(this.agentScopes, agentId, scope);
  }

  /**
   * Remove a per-agent scope override.
   */
  removeAgentScope(agentId: string): void {
    this.agentScopes = mapDelete(this.agentScopes, agentId);
  }

  /**
   * Get the effective scope for an agent (override or gateway default).
   */
  getEffectiveScope(agentId: string): ConversationScope {
    return this.agentScopes.get(agentId) ?? this.conversationScope;
  }
}
