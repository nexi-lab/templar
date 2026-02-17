import { GatewayAgentNotFoundError, GatewayNodeNotFoundError } from "@templar/errors";
import type { BindingResolver } from "./binding-resolver.js";
import type { ConversationStore } from "./conversations/conversation-store.js";
import type { LaneDispatcher } from "./lanes/lane-dispatcher.js";
import {
  type ConversationKeyResult,
  type ConversationScope,
  type LaneMessage,
  resolveConversationKey,
} from "./protocol/index.js";
import type { NodeRegistry } from "./registry/node-registry.js";
import { mapDelete, mapFilter, mapSet } from "./utils/immutable-map.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Callback to resolve an agentId to a nodeId (injected by gateway) */
export type AgentNodeResolver = (agentId: string) => string | undefined;

/** Callback invoked when conversation key resolution degrades due to missing fields. */
export type DegradationHandler = (agentId: string, warnings: readonly string[]) => void;

// ---------------------------------------------------------------------------
// AgentRouter
// ---------------------------------------------------------------------------

/**
 * Routes channel messages to the appropriate node's lane dispatcher.
 *
 * **Routing precedence** (first path that matches wins):
 *
 * 1. **Binding-based** (multi-agent routing): If a `BindingResolver` is
 *    configured, each inbound message is tested against declarative
 *    `AgentBinding` rules in declaration order (first match wins). The
 *    matched agentId is resolved to a nodeId via the injected
 *    `AgentNodeResolver`. If no binding matches, falls through to path 2.
 *
 * 2. **Channel-based** (backward compat / fallback): Explicit
 *    `channelId → nodeId` bindings set via `bind()`. This is the legacy
 *    API for single-agent gateways.
 *
 * **Implication**: A catch-all binding (`match: {}`) will prevent *all*
 * channel-based routing. Partial binding sets allow mixed routing where
 * unmatched channels fall through to channel bindings.
 *
 * Supports conversation scoping via ConversationStore to isolate
 * conversations by peer, channel, and account.
 */
export class AgentRouter {
  private channelBindings: ReadonlyMap<string, string> = new Map();
  private dispatchers: ReadonlyMap<string, LaneDispatcher> = new Map();
  private readonly registry: NodeRegistry;
  private conversationStore: ConversationStore | undefined;
  private conversationScope: ConversationScope = "per-channel-peer";
  private agentScopes: ReadonlyMap<string, ConversationScope> = new Map();
  private bindingResolver: BindingResolver | undefined;
  private agentNodeResolver: AgentNodeResolver | undefined;
  private degradationHandler: DegradationHandler | undefined;

  constructor(registry: NodeRegistry) {
    this.registry = registry;
  }

  /**
   * Bind a channel to a specific node (legacy API).
   */
  bind(channelId: string, nodeId: string): void {
    if (!this.registry.get(nodeId)) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    this.channelBindings = mapSet(this.channelBindings, channelId, nodeId);
  }

  /**
   * Remove a channel binding.
   */
  unbind(channelId: string): void {
    this.channelBindings = mapDelete(this.channelBindings, channelId);
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
    // Also remove any channel bindings to this node
    this.channelBindings = mapFilter(
      this.channelBindings,
      (_channelId, boundNodeId) => boundNodeId !== nodeId,
    );
  }

  /**
   * Set the binding resolver for multi-agent routing.
   */
  setBindingResolver(resolver: BindingResolver): void {
    this.bindingResolver = resolver;
  }

  /**
   * Get the binding resolver (for testing/inspection).
   */
  getBindingResolver(): BindingResolver | undefined {
    return this.bindingResolver;
  }

  /**
   * Set the callback that resolves agentId → nodeId.
   */
  setAgentNodeResolver(resolver: AgentNodeResolver): void {
    this.agentNodeResolver = resolver;
  }

  /**
   * Route a message to the appropriate node's lane dispatcher.
   * Returns the nodeId that the message was dispatched to.
   *
   * See class-level JSDoc for routing precedence rules.
   */
  route(message: LaneMessage): string {
    // Path 1: Binding-based routing (takes precedence)
    if (this.bindingResolver) {
      const agentId = this.bindingResolver.resolve(message);
      if (agentId) {
        return this.resolveAndDispatchAgent(agentId, message);
      }
      // No binding matched — fall through to channel binding
    }

    // Path 2: Channel → node binding (backward compat / fallback)
    return this.resolveAndDispatchChannel(message);
  }

  /**
   * Route a message with conversation scoping.
   *
   * 1. Determine effective scope (agent override → gateway default)
   * 2. Compute conversation key from scope + routing context
   * 3. Dispatch via route paths — throws on missing binding/dispatcher
   * 4. Bind conversation to node only after successful dispatch
   */
  routeWithScope(message: LaneMessage, agentId: string): ConversationKeyResult {
    const scope = this.agentScopes.get(agentId) ?? this.conversationScope;

    const result = resolveConversationKey({
      scope,
      agentId,
      channelId: message.channelId,
      peerId: message.routingContext?.peerId,
      accountId: message.routingContext?.accountId,
      groupId: message.routingContext?.groupId,
      messageType: message.routingContext?.messageType,
    });

    // Notify on degraded key resolution (e.g., missing accountId)
    if (result.degraded && this.degradationHandler) {
      this.degradationHandler(agentId, result.warnings);
    }

    // Dispatch first — if route() throws, no stale conversation binding is created.
    // route() returns the nodeId it dispatched to, eliminating double resolution.
    const nodeId = this.route(message);

    // Bind conversation to node only after successful dispatch
    if (this.conversationStore) {
      this.conversationStore.bind(result.key, nodeId);
    }

    return result;
  }

  /**
   * Get the conversation key for a message without routing it.
   */
  resolveConversation(message: LaneMessage, agentId: string): ConversationKeyResult {
    const scope = this.agentScopes.get(agentId) ?? this.conversationScope;
    return resolveConversationKey({
      scope,
      agentId,
      channelId: message.channelId,
      peerId: message.routingContext?.peerId,
      accountId: message.routingContext?.accountId,
      groupId: message.routingContext?.groupId,
      messageType: message.routingContext?.messageType,
    });
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
    return this.channelBindings.get(channelId);
  }

  /**
   * Get all current channel bindings.
   */
  getAllBindings(): ReadonlyMap<string, string> {
    return this.channelBindings;
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

  /**
   * Set a handler invoked when conversation key resolution degrades
   * due to missing routing context fields (peerId, accountId, etc.).
   */
  onDegradation(handler: DegradationHandler): void {
    this.degradationHandler = handler;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Resolve agentId → nodeId and dispatch the message. Returns the nodeId.
   */
  private resolveAndDispatchAgent(agentId: string, message: LaneMessage): string {
    if (!this.agentNodeResolver) {
      throw new GatewayAgentNotFoundError(agentId);
    }
    const nodeId = this.agentNodeResolver(agentId);
    if (!nodeId) {
      throw new GatewayAgentNotFoundError(agentId);
    }
    this.dispatchToNode(nodeId, message);
    return nodeId;
  }

  /**
   * Resolve channelId → nodeId and dispatch the message. Returns the nodeId.
   */
  private resolveAndDispatchChannel(message: LaneMessage): string {
    const nodeId = this.channelBindings.get(message.channelId);
    if (!nodeId) {
      throw new GatewayNodeNotFoundError(`No binding for channel '${message.channelId}'`);
    }
    this.dispatchToNode(nodeId, message);
    return nodeId;
  }

  /**
   * Dispatch a message to a node's lane dispatcher by nodeId.
   * Throws if the node has no registered dispatcher.
   */
  private dispatchToNode(nodeId: string, message: LaneMessage): void {
    const dispatcher = this.dispatchers.get(nodeId);
    if (!dispatcher) {
      throw new GatewayNodeNotFoundError(nodeId);
    }
    dispatcher.dispatch(message);
  }
}
