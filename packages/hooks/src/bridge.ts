import type { SessionContext, TemplarMiddleware, TurnContext } from "@templar/core";
import type { HookRegistry } from "./registry.js";

/**
 * Creates a TemplarMiddleware that bridges lifecycle events into the HookRegistry.
 *
 * Mapping:
 * - `onSessionStart` → emit `SessionStart`
 * - `onBeforeTurn`   → emit `PreMessage` (thin default mapping)
 * - `onAfterTurn`    → emit `PostMessage`
 * - `onSessionEnd`   → emit `SessionEnd`
 */
export function createHookMiddleware(registry: HookRegistry): TemplarMiddleware {
  return {
    name: "@templar/hooks/bridge",

    async onSessionStart(context: SessionContext): Promise<void> {
      await registry.emit("SessionStart", {
        sessionId: context.sessionId,
        agentId: context.agentId ?? "unknown",
        userId: context.userId ?? "unknown",
      });
    },

    async onBeforeTurn(context: TurnContext): Promise<void> {
      await registry.emit("PreMessage", {
        message: context.input != null ? { content: context.input } : {},
        channelId: "lifecycle",
        sessionId: context.sessionId,
      });
    },

    async onAfterTurn(context: TurnContext): Promise<void> {
      await registry.emit("PostMessage", {
        message: context.output != null ? { content: context.output } : {},
        channelId: "lifecycle",
        messageId: `turn-${String(context.turnNumber)}`,
        sessionId: context.sessionId,
      });
    },

    async onSessionEnd(context: SessionContext): Promise<void> {
      await registry.emit("SessionEnd", {
        sessionId: context.sessionId,
        agentId: context.agentId ?? "unknown",
        userId: context.userId ?? "unknown",
        durationMs: 0,
        turnCount: 0,
      });
    },
  };
}
