import {
  SESSION_TRANSITIONS,
  type SessionEvent,
  type SessionState,
} from "@templar/gateway-protocol";

/**
 * Result of a state transition attempt.
 */
export interface TransitionResult {
  /** Whether the transition was valid */
  readonly valid: boolean;
  /** The resulting state (unchanged if invalid) */
  readonly state: SessionState;
  /** The previous state */
  readonly previousState: SessionState;
  /** The event that triggered the transition */
  readonly event: SessionEvent;
}

/**
 * Pure function: attempt a state transition.
 *
 * Returns the new state if the transition is valid,
 * or the current state with `valid: false` if invalid.
 */
export function transition(current: SessionState, event: SessionEvent): TransitionResult {
  const next = SESSION_TRANSITIONS[current][event];
  if (next === null) {
    return {
      valid: false,
      state: current,
      previousState: current,
      event,
    };
  }
  return {
    valid: true,
    state: next,
    previousState: current,
    event,
  };
}
