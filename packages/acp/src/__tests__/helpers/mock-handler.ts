import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { vi } from "vitest";
import type { ACPRunHandler, ACPStopReason } from "../../handler.js";

export interface MockHandlerOptions {
  readonly text?: string;
  readonly stopReason?: ACPStopReason;
  readonly updates?: readonly SessionUpdate[];
  readonly delay?: number;
}

/**
 * Create a mock ACPRunHandler for testing.
 *
 * By default emits a single text chunk and returns "end_turn".
 */
export function createMockHandler(
  options?: MockHandlerOptions,
): ACPRunHandler & ReturnType<typeof vi.fn> {
  const {
    text = "Hello from Templar!",
    stopReason = "end_turn",
    updates,
    delay = 0,
  } = options ?? {};

  return vi.fn(async (_input, _context, emit, signal) => {
    if (delay > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Aborted"));
        });
      });
    }

    if (updates) {
      for (const update of updates) {
        emit(update);
      }
    } else {
      emit({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      });
    }

    return stopReason;
  }) as ACPRunHandler & ReturnType<typeof vi.fn>;
}
