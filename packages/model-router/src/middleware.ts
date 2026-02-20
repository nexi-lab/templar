import type { TemplarMiddleware, TurnContext } from "@templar/core";
import type { ModelRouter } from "./router.js";
import type { ModelRef } from "./types.js";

/** Optional PreModelSelect hook stored in turn metadata */
export type PreModelSelectHook = (
  candidates: readonly ModelRef[],
) => readonly ModelRef[] | Promise<readonly ModelRef[]>;

/**
 * Thin middleware adapter that wires ModelRouter into the Templar lifecycle.
 *
 * On each turn:
 * - Injects router diagnostics into turn metadata
 * - Wires onUsage events to track costs per-turn
 * - Bridges PreModelSelect hook from metadata to router
 */
export class ModelRouterMiddleware implements TemplarMiddleware {
  readonly name = "model-router";
  private readonly router: ModelRouter;

  constructor(router: ModelRouter) {
    this.router = router;
  }

  async onBeforeTurn(context: TurnContext): Promise<void> {
    if (!context.metadata) {
      context.metadata = {};
    }

    // Attach router reference for downstream use
    context.metadata.modelRouter = this.router;

    // Track usage for this turn
    const turnUsage: unknown[] = [];
    const dispose = this.router.onUsage((event) => {
      turnUsage.push(event);
    });

    // Store disposer and usage array for onAfterTurn
    context.metadata["modelRouter:usageDispose"] = dispose;
    context.metadata["modelRouter:turnUsage"] = turnUsage;
  }

  async onAfterTurn(context: TurnContext): Promise<void> {
    // Clean up usage listener
    const dispose = context.metadata?.["modelRouter:usageDispose"];
    if (typeof dispose === "function") {
      (dispose as () => void)();
    }

    // Attach collected usage to turn output metadata
    const turnUsage = context.metadata?.["modelRouter:turnUsage"];
    if (Array.isArray(turnUsage) && turnUsage.length > 0) {
      if (!context.metadata) {
        context.metadata = {};
      }
      context.metadata["modelRouter:usage"] = turnUsage;
    }

    // Clean up internal tracking keys
    if (context.metadata) {
      delete context.metadata["modelRouter:usageDispose"];
      delete context.metadata["modelRouter:turnUsage"];
    }
  }
}
