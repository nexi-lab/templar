import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ChannelLoadError } from "@templar/errors";

// ---------------------------------------------------------------------------
// Baileys auth types (minimal — avoid importing Baileys at module level)
// ---------------------------------------------------------------------------

/**
 * Matches Baileys' AuthenticationState shape.
 * We define our own to avoid importing Baileys at module load time.
 */
export interface BaileysAuthState {
  readonly creds: Record<string, unknown>;
  readonly keys: {
    get(type: string, ids: string[]): Promise<Record<string, unknown>>;
    set(data: Record<string, Record<string, unknown>>): Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// AuthStateProvider interface
// ---------------------------------------------------------------------------

/**
 * Injectable authentication state provider.
 * Implement this interface to store auth state in Redis, Postgres, etc.
 */
export interface AuthStateProvider {
  /** Load or initialize the Baileys authentication state */
  getState(): Promise<BaileysAuthState>;
  /** Persist credential updates (called on every creds.update event) */
  saveCreds(creds: Record<string, unknown>): Promise<void>;
  /** Delete all stored auth state (used on badSession / loggedOut) */
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// FileAuthState — default implementation with debounced writes
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 500;

/**
 * File-based auth state provider with debounced writes.
 *
 * Stores credentials and Signal keys as JSON files in a directory.
 * Debounces `saveCreds` writes with a 500ms window to reduce I/O
 * during Signal protocol key ratcheting.
 *
 * NOTE: This is suitable for single-instance deployments.
 * For multi-instance, inject a database-backed AuthStateProvider.
 */
export class FileAuthState implements AuthStateProvider {
  private readonly dirPath: string;
  private pendingFlush: ReturnType<typeof setTimeout> | undefined;
  private pendingCreds: Record<string, unknown> | undefined;

  constructor(dirPath: string) {
    this.dirPath = dirPath;
  }

  async getState(): Promise<BaileysAuthState> {
    // Lazy-load Baileys to avoid import-time coupling
    try {
      const { useMultiFileAuthState } = await import("@whiskeysockets/baileys");
      await fs.mkdir(this.dirPath, { recursive: true });
      const { state } = await useMultiFileAuthState(this.dirPath);

      // Wrap saveCreds with our debounce logic
      return {
        creds: state.creds as unknown as Record<string, unknown>,
        keys: state.keys as unknown as BaileysAuthState["keys"],
      };
    } catch (error) {
      throw new ChannelLoadError(
        "whatsapp",
        `Failed to initialize auth state at '${this.dirPath}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async saveCreds(creds: Record<string, unknown>): Promise<void> {
    this.pendingCreds = creds;

    // Debounce: clear any pending write and schedule a new one
    if (this.pendingFlush !== undefined) {
      clearTimeout(this.pendingFlush);
    }

    this.pendingFlush = setTimeout(() => {
      void this.flush();
    }, DEBOUNCE_MS);
  }

  async clear(): Promise<void> {
    // Cancel any pending writes
    if (this.pendingFlush !== undefined) {
      clearTimeout(this.pendingFlush);
      this.pendingFlush = undefined;
    }
    this.pendingCreds = undefined;

    try {
      await fs.rm(this.dirPath, { recursive: true, force: true });
    } catch {
      // Directory may not exist — that's fine
    }
  }

  /**
   * Force-flush any pending credential writes to disk.
   * Called internally on debounce timeout and externally on disconnect.
   */
  async flush(): Promise<void> {
    if (this.pendingFlush !== undefined) {
      clearTimeout(this.pendingFlush);
      this.pendingFlush = undefined;
    }

    if (this.pendingCreds === undefined) return;

    const creds = this.pendingCreds;
    this.pendingCreds = undefined;

    try {
      await fs.mkdir(this.dirPath, { recursive: true });
      const credsPath = path.join(this.dirPath, "creds.json");
      await fs.writeFile(credsPath, JSON.stringify(creds, null, 2), "utf-8");
    } catch (error) {
      console.error(
        "[WhatsAppChannel] Failed to flush auth state:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
