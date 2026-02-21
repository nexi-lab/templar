import type { ConversationStoreSnapshot } from "../conversations/conversation-snapshot.js";
import type { DeliveryTrackerSnapshot } from "../delivery-snapshot.js";
import type { SessionManagerSnapshot } from "../sessions/session-snapshot.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvariantSeverity = "error" | "warning";

export interface InvariantViolation {
  readonly rule: string;
  readonly severity: InvariantSeverity;
  readonly message: string;
}

export interface InvariantCheckResult {
  readonly valid: boolean;
  readonly violations: readonly InvariantViolation[];
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

/**
 * Validate cross-store invariants on a checkpoint's snapshots.
 *
 * Returns `valid: true` only when zero `severity: "error"` violations are found.
 * Warnings (e.g. disconnected sessions) do not fail the check.
 */
export function checkInvariants(
  sessions: SessionManagerSnapshot,
  conversations: ConversationStoreSnapshot,
  deliveries: DeliveryTrackerSnapshot,
): InvariantCheckResult {
  const violations: InvariantViolation[] = [];
  const sessionNodeIds = new Set(sessions.sessions.map((s) => s.nodeId));

  // Rule 1: Conversation binding's nodeId must reference an active session
  for (const binding of conversations.bindings) {
    if (!sessionNodeIds.has(binding.nodeId)) {
      violations.push({
        rule: "conversation-orphan",
        severity: "error",
        message: `Conversation binding '${binding.conversationKey}' references non-existent session '${binding.nodeId}'`,
      });
    }
  }

  // Rule 2: Delivery entry's nodeId must reference an active session
  for (const [nodeId, messages] of Object.entries(deliveries.pending)) {
    if (!sessionNodeIds.has(nodeId) && messages.length > 0) {
      violations.push({
        rule: "delivery-orphan",
        severity: "error",
        message: `Delivery entries for non-existent session '${nodeId}'`,
      });
    }
  }

  // Rule 3: No disconnected sessions in snapshot (warning only)
  for (const session of sessions.sessions) {
    if (session.state === "disconnected") {
      violations.push({
        rule: "disconnected-session",
        severity: "warning",
        message: `Session '${session.nodeId}' is in disconnected state`,
      });
    }
  }

  // Rule 4: Session connectedAt <= lastActivityAt
  for (const session of sessions.sessions) {
    if (session.connectedAt > session.lastActivityAt) {
      violations.push({
        rule: "session-timestamp-inversion",
        severity: "error",
        message: `Session '${session.nodeId}' has connectedAt (${session.connectedAt}) > lastActivityAt (${session.lastActivityAt})`,
      });
    }
  }

  // Rule 5: Conversation createdAt <= lastActiveAt
  for (const binding of conversations.bindings) {
    if (binding.createdAt > binding.lastActiveAt) {
      violations.push({
        rule: "conversation-timestamp-inversion",
        severity: "error",
        message: `Conversation '${binding.conversationKey}' has createdAt (${binding.createdAt}) > lastActiveAt (${binding.lastActiveAt})`,
      });
    }
  }

  // Rule 6: No duplicate session nodeIds
  const seenNodeIds = new Set<string>();
  for (const session of sessions.sessions) {
    if (seenNodeIds.has(session.nodeId)) {
      violations.push({
        rule: "duplicate-session",
        severity: "error",
        message: `Duplicate session nodeId '${session.nodeId}'`,
      });
    }
    seenNodeIds.add(session.nodeId);
  }

  // Rule 7: No orphaned delivery entries (same as rule 2, but checks empty arrays)
  // Already covered by rule 2 for non-empty entries

  const valid = violations.every((v) => v.severity !== "error");
  return { valid, violations };
}
