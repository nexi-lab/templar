import { vi } from "vitest";
import type { AuthStateProvider, BaileysAuthState } from "../../auth-state.js";

/**
 * In-memory auth state provider for fast tests.
 * No filesystem I/O — all state is held in memory.
 */
export class InMemoryAuthState implements AuthStateProvider {
  private creds: Record<string, unknown> = {};
  private keys: Map<string, Record<string, unknown>> = new Map();
  private cleared = false;

  readonly saveCreds: (creds: Record<string, unknown>) => Promise<void> = vi.fn(
    async (creds: Record<string, unknown>) => {
      this.creds = { ...creds };
    },
  );

  readonly clear: () => Promise<void> = vi.fn(async () => {
    this.creds = {};
    this.keys.clear();
    this.cleared = true;
  });

  async getState(): Promise<BaileysAuthState> {
    return {
      creds: this.creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const result: Record<string, unknown> = {};
          for (const id of ids) {
            const value = this.keys.get(`${type}:${id}`);
            if (value) result[id] = value;
          }
          return result;
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          for (const [type, entries] of Object.entries(data)) {
            for (const [id, value] of Object.entries(entries)) {
              if (value != null) {
                this.keys.set(`${type}:${id}`, value as Record<string, unknown>);
              } else {
                this.keys.delete(`${type}:${id}`);
              }
            }
          }
        },
      },
    };
  }

  /** Test helper: check if clear() was called */
  wasCleared(): boolean {
    return this.cleared;
  }
}
