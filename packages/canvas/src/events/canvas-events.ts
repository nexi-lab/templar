/**
 * AG-UI CustomEvent constructors for canvas artifacts.
 *
 * Event name: "templar.canvas"
 * Value: CanvasEventPayload (create | update | delete)
 */

import type { CanvasEventPayload } from "../types.js";

export const CANVAS_EVENT_NAME = "templar.canvas" as const;

export interface CanvasCustomEvent {
  readonly type: "custom";
  readonly name: typeof CANVAS_EVENT_NAME;
  readonly value: CanvasEventPayload;
}

export function createCanvasCustomEvent(payload: CanvasEventPayload): CanvasCustomEvent {
  return {
    type: "custom",
    name: CANVAS_EVENT_NAME,
    value: payload,
  };
}
