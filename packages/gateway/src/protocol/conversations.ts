import { CONVERSATION_SCOPES, type ConversationScope } from "@templar/core";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Conversation Scope (canonical definition in @templar/core)
// ---------------------------------------------------------------------------

// Re-export for consumers that import from @templar/gateway/protocol
export { CONVERSATION_SCOPES, type ConversationScope } from "@templar/core";
export const ConversationScopeSchema = z.enum(CONVERSATION_SCOPES);

// ---------------------------------------------------------------------------
// Message Type
// ---------------------------------------------------------------------------

/** Whether a message is a DM or group message. */
export const MESSAGE_TYPES = ["dm", "group"] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];
export const MessageTypeSchema = z.enum(MESSAGE_TYPES);

// ---------------------------------------------------------------------------
// Message Routing Context
// ---------------------------------------------------------------------------

/**
 * Routing context attached to a LaneMessage for conversation scoping.
 *
 * Populated by the channel adapter that originates the message.
 */
export interface MessageRoutingContext {
  /** Peer identifier (e.g., phone number, username) */
  readonly peerId?: string;
  /** Account identifier (multi-account channels like WhatsApp Business) */
  readonly accountId?: string;
  /** Group identifier (for group chats) */
  readonly groupId?: string;
  /** Whether this is a DM or group message */
  readonly messageType?: MessageType;
  // TODO(#4): Add threadId for Slack threads / Telegram Topics isolation.
  // Key format: agent:<agentId>:<channelId>:group:<groupId>:thread:<threadId>
}

export const MessageRoutingContextSchema = z.object({
  peerId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  messageType: MessageTypeSchema.optional(),
});

// ---------------------------------------------------------------------------
// Branded ConversationKey
// ---------------------------------------------------------------------------

/** Branded string type for conversation keys. */
export type ConversationKey = string & { readonly __brand: "ConversationKey" };

// ---------------------------------------------------------------------------
// Key Resolution
// ---------------------------------------------------------------------------

/** Input for resolving a conversation key. */
export interface ConversationKeyInput {
  readonly scope: ConversationScope;
  readonly agentId: string;
  readonly channelId: string;
  readonly peerId?: string | undefined;
  readonly accountId?: string | undefined;
  readonly groupId?: string | undefined;
  readonly messageType?: MessageType | undefined;
}

/** Result of conversation key resolution. */
export interface ConversationKeyResult {
  readonly key: ConversationKey;
  readonly requestedScope: ConversationScope;
  readonly effectiveScope: ConversationScope | "group";
  readonly degraded: boolean;
  readonly warnings: readonly string[];
}

/**
 * Compute a conversation key from scope + routing context.
 *
 * Key format by scope:
 * - group messages:              `agent:<agentId>:<channelId>:group:<groupId>`
 * - main:                        `agent:<agentId>:main`
 * - per-peer:                    `agent:<agentId>:dm:<peerId>`
 * - per-channel-peer:            `agent:<agentId>:<channelId>:dm:<peerId>`
 * - per-account-channel-peer:    `agent:<agentId>:<channelId>:<accountId>:dm:<peerId>`
 *
 * Error behavior (strict — prevents silent conversation merging):
 * - Any scope except `main` missing peerId → throws (channel adapter bug)
 * - group missing groupId                  → throws (channel adapter bug)
 *
 * Degradation (graceful — missing optional context):
 * - per-account-channel-peer missing accountId → degrade to per-channel-peer + warning
 */
export function resolveConversationKey(input: ConversationKeyInput): ConversationKeyResult {
  const { scope, agentId, channelId, messageType } = input;
  const peerId = input.peerId || undefined; // treat empty string as missing
  const accountId = input.accountId || undefined;
  const groupId = input.groupId || undefined;
  const warnings: string[] = [];

  // Validate IDs do not contain the delimiter character to prevent key collisions
  for (const [name, value] of [
    ["agentId", agentId],
    ["channelId", channelId],
    ["peerId", peerId],
    ["accountId", accountId],
    ["groupId", groupId],
  ] as const) {
    if (value?.includes(":")) {
      throw new Error(`${name} must not contain ':' — received "${value}"`);
    }
  }

  // Group messages always use group scoping, ignoring DM scope
  if (messageType === "group") {
    if (!groupId) {
      throw new Error(
        "group message missing groupId — channel adapter must provide groupId for group messages",
      );
    }
    return {
      key: `agent:${agentId}:${channelId}:group:${groupId}` as ConversationKey,
      requestedScope: scope,
      effectiveScope: "group",
      degraded: false,
      warnings,
    };
  }

  // DM scoping
  switch (scope) {
    case "main":
      return {
        key: `agent:${agentId}:main` as ConversationKey,
        requestedScope: "main",
        effectiveScope: "main",
        degraded: false,
        warnings,
      };

    case "per-peer":
      if (!peerId) {
        throw new Error(
          "per-peer scope requires peerId — channel adapter must provide peerId for DM messages",
        );
      }
      return {
        key: `agent:${agentId}:dm:${peerId}` as ConversationKey,
        requestedScope: "per-peer",
        effectiveScope: "per-peer",
        degraded: false,
        warnings,
      };

    case "per-channel-peer":
      if (!peerId) {
        throw new Error(
          "per-channel-peer scope requires peerId — channel adapter must provide peerId for DM messages",
        );
      }
      return {
        key: `agent:${agentId}:${channelId}:dm:${peerId}` as ConversationKey,
        requestedScope: "per-channel-peer",
        effectiveScope: "per-channel-peer",
        degraded: false,
        warnings,
      };

    case "per-account-channel-peer": {
      if (!peerId) {
        throw new Error(
          "per-account-channel-peer scope requires peerId — channel adapter must provide peerId for DM messages",
        );
      }
      if (!accountId) {
        warnings.push(
          "per-account-channel-peer scope missing accountId, degrading to per-channel-peer",
        );
        return {
          key: `agent:${agentId}:${channelId}:dm:${peerId}` as ConversationKey,
          requestedScope: "per-account-channel-peer",
          effectiveScope: "per-channel-peer",
          degraded: true,
          warnings,
        };
      }
      return {
        key: `agent:${agentId}:${channelId}:${accountId}:dm:${peerId}` as ConversationKey,
        requestedScope: "per-account-channel-peer",
        effectiveScope: "per-account-channel-peer",
        degraded: false,
        warnings,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Key Parsing (for debugging/logging)
// ---------------------------------------------------------------------------

/**
 * Parse a conversation key back into its component parts.
 *
 * Returns undefined if the key format is unrecognized.
 */
export function parseConversationKey(key: ConversationKey): ConversationKeyInput | undefined {
  const parts = key.split(":");
  // All keys start with "agent:<agentId>"
  if (parts[0] !== "agent" || parts.length < 3) {
    return undefined;
  }

  // Length checks above guarantee these indices exist
  const agentId = parts[1] as string;

  // agent:<agentId>:main
  if (parts[2] === "main" && parts.length === 3) {
    return { scope: "main", agentId, channelId: "" };
  }

  // agent:<agentId>:dm:<peerId>
  if (parts[2] === "dm" && parts.length === 4) {
    return { scope: "per-peer", agentId, channelId: "", peerId: parts[3] as string };
  }

  // Remaining formats have channelId at parts[2]
  const channelId = parts[2] as string;

  // agent:<agentId>:<channelId>:group:<groupId>
  if (parts[3] === "group" && parts.length === 5) {
    return {
      scope: "main", // group ignores scope
      agentId,
      channelId,
      groupId: parts[4] as string,
      messageType: "group",
    };
  }

  // agent:<agentId>:<channelId>:dm:<peerId>
  if (parts[3] === "dm" && parts.length === 5) {
    return { scope: "per-channel-peer", agentId, channelId, peerId: parts[4] as string };
  }

  // agent:<agentId>:<channelId>:<accountId>:dm:<peerId>
  if (parts[4] === "dm" && parts.length === 6) {
    return {
      scope: "per-account-channel-peer",
      agentId,
      channelId,
      accountId: parts[3] as string,
      peerId: parts[5] as string,
    };
  }

  return undefined;
}
