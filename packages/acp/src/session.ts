// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionState = "idle" | "prompting";

interface SessionEntry {
  readonly id: string;
  readonly createdAt: number;
  state: SessionState;
  abortController: AbortController | undefined;
}

/** Read-only view of session metadata exposed to consumers. */
export interface SessionMetadata {
  readonly id: string;
  readonly state: SessionState;
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// SessionManager
// ---------------------------------------------------------------------------

/**
 * Manages ACP session lifecycle with state machine transitions.
 *
 * State machine per session:
 *   idle → prompting (via startPrompt)
 *   prompting → idle (via endPrompt)
 *
 * Immutable from the outside — only the manager mutates internal state.
 */
export class SessionManager {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly maxSessions: number;

  constructor(maxSessions: number) {
    if (maxSessions < 1) {
      throw new Error("maxSessions must be >= 1");
    }
    this.maxSessions = maxSessions;
  }

  /**
   * Create a new session. Throws if at capacity.
   */
  create(): SessionMetadata {
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(`Maximum sessions reached (${this.maxSessions})`);
    }

    const id = crypto.randomUUID();
    const entry: SessionEntry = {
      id,
      createdAt: Date.now(),
      state: "idle",
      abortController: undefined,
    };
    this.sessions.set(id, entry);
    return { id: entry.id, state: entry.state, createdAt: entry.createdAt };
  }

  /**
   * Get session metadata by ID. Returns undefined if not found.
   */
  get(sessionId: string): SessionMetadata | undefined {
    const entry = this.sessions.get(sessionId);
    if (!entry) return undefined;
    return { id: entry.id, state: entry.state, createdAt: entry.createdAt };
  }

  /**
   * Delete a session. Aborts any in-flight prompt first.
   * Returns true if the session existed and was deleted.
   */
  delete(sessionId: string): boolean {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;

    if (entry.abortController) {
      entry.abortController.abort();
    }
    return this.sessions.delete(sessionId);
  }

  /**
   * Transition session to "prompting" state.
   * Returns an AbortController for cancellation.
   *
   * Throws if session not found or already prompting (concurrent prompt rejection).
   */
  startPrompt(sessionId: string): AbortController {
    const entry = this.sessions.get(sessionId);
    if (!entry) {
      throw new Error(`Session ${sessionId} not found`);
    }
    if (entry.state === "prompting") {
      throw new Error(`Session ${sessionId} already has an active prompt`);
    }

    const controller = new AbortController();
    entry.state = "prompting";
    entry.abortController = controller;
    return controller;
  }

  /**
   * Transition session back to "idle" after prompt completes.
   */
  endPrompt(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;

    entry.state = "idle";
    entry.abortController = undefined;
  }

  /**
   * Abort a session's in-flight prompt (for cancel notifications).
   */
  cancelPrompt(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry?.abortController) {
      entry.abortController.abort();
    }
  }

  /** Number of active sessions. */
  get count(): number {
    return this.sessions.size;
  }

  /** Abort all prompts and clear all sessions. */
  clear(): void {
    for (const entry of this.sessions.values()) {
      if (entry.abortController) {
        entry.abortController.abort();
      }
    }
    this.sessions.clear();
  }
}
