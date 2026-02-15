import { LSPClient, type LSPClientOptions } from "./client.js";
import type { LSPConfig } from "./config.js";
import { RestartTracker } from "./process.js";

/**
 * Manages workspace-scoped LSP client instances with idle timeout
 * and pool size limits.
 */
export class LSPClientPool {
  private readonly clients = new Map<string, LSPClient>();
  private readonly lastUsed = new Map<string, number>();
  private readonly restartTrackers = new Map<string, RestartTracker>();
  private readonly pending = new Map<string, Promise<LSPClient>>();
  private idleTimer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly config: LSPConfig) {}

  /**
   * Get or create a client for the given language + workspace.
   * Uses a pending-initialization guard to prevent race conditions
   * where concurrent callers could exceed maxServers.
   */
  async getClient(languageId: string, workspaceRoot: string): Promise<LSPClient> {
    const key = `${languageId}:${workspaceRoot}`;
    const existing = this.clients.get(key);

    if (existing?.isInitialized) {
      this.lastUsed.set(key, Date.now());
      return existing;
    }

    // If already initializing, wait for that to complete
    const pendingInit = this.pending.get(key);
    if (pendingInit) return pendingInit;

    const initPromise = this.initClient(key, languageId, workspaceRoot);
    this.pending.set(key, initPromise);

    try {
      return await initPromise;
    } finally {
      this.pending.delete(key);
    }
  }

  /**
   * Start the idle timeout checker (runs every 60s).
   */
  startIdleChecker(): void {
    if (this.idleTimer) return;
    this.idleTimer = setInterval(() => this.evictIdle(), 60_000);
    // Don't keep the process alive for this timer
    if (this.idleTimer.unref) this.idleTimer.unref();
  }

  /**
   * Stop the idle timeout checker.
   */
  stopIdleChecker(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer);
      this.idleTimer = undefined;
    }
  }

  /**
   * Shut down all clients and clear the pool.
   */
  async clear(): Promise<void> {
    this.stopIdleChecker();

    const shutdowns = [...this.clients.values()].map((client) =>
      client.shutdown().catch(() => {
        // Best effort
      }),
    );
    await Promise.all(shutdowns);

    this.clients.clear();
    this.lastUsed.clear();
    this.restartTrackers.clear();
    this.pending.clear();
  }

  /**
   * Check if a client exists for the given key.
   */
  has(languageId: string, workspaceRoot: string): boolean {
    return this.clients.has(`${languageId}:${workspaceRoot}`);
  }

  get count(): number {
    return this.clients.size;
  }

  private async initClient(
    key: string,
    languageId: string,
    workspaceRoot: string,
  ): Promise<LSPClient> {
    // Check pool limit — evict LRU if needed
    if (this.clients.size >= this.config.maxServers) {
      await this.evictLRU();
    }

    const serverConfig = this.config.servers[languageId];
    if (!serverConfig) {
      throw new Error(`No server configuration for language '${languageId}'`);
    }

    const clientOptions: LSPClientOptions = {
      requestTimeoutMs: this.config.requestTimeoutMs,
      initTimeoutMs: this.config.initTimeoutMs,
      maxOpenFiles: this.config.maxOpenFiles,
      maxDiagnostics: this.config.maxDiagnostics,
    };

    const client = new LSPClient(
      languageId,
      workspaceRoot,
      { ...serverConfig, rootDir: workspaceRoot },
      clientOptions,
    );

    await client.initialize();

    // Set up crash handler with auto-restart via RestartTracker
    const tracker = this.getOrCreateTracker(key);
    client.onCrash((_code, _signal) => {
      this.clients.delete(key);
      this.lastUsed.delete(key);

      // Attempt auto-restart with exponential backoff
      if (tracker.canRestart()) {
        tracker.recordRestart();
        const delay = tracker.getBackoffMs();
        setTimeout(() => {
          this.getClient(languageId, workspaceRoot).catch(() => {
            // Restart failed; will be retried on next explicit getClient call
          });
        }, delay);
      }
    });

    // Reset restart tracker on successful init
    tracker.reset();

    this.clients.set(key, client);
    this.lastUsed.set(key, Date.now());

    return client;
  }

  /** Evict clients that have been idle longer than their timeout. */
  private evictIdle(): void {
    const now = Date.now();
    const toEvict: string[] = [];

    for (const [key, lastAccess] of this.lastUsed) {
      const client = this.clients.get(key);
      if (!client) continue;

      const serverConfig = this.config.servers[client.languageId];
      const idleTimeout = serverConfig?.idleTimeoutMs ?? 300_000;

      if (now - lastAccess > idleTimeout) {
        toEvict.push(key);
      }
    }

    for (const key of toEvict) {
      const client = this.clients.get(key);
      this.clients.delete(key);
      this.lastUsed.delete(key);
      client?.shutdown().catch(() => {
        // Best effort
      });
    }
  }

  /** Evict the least recently used client to make room. */
  private async evictLRU(): Promise<void> {
    let oldestKey: string | undefined;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [key, time] of this.lastUsed) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const client = this.clients.get(oldestKey);
      this.clients.delete(oldestKey);
      this.lastUsed.delete(oldestKey);
      await client?.shutdown().catch(() => {
        // Best effort
      });
    }
  }

  private getOrCreateTracker(key: string): RestartTracker {
    let tracker = this.restartTrackers.get(key);
    if (!tracker) {
      tracker = new RestartTracker(this.config.maxRestarts, this.config.restartWindowMs);
      this.restartTrackers.set(key, tracker);
    }
    return tracker;
  }
}
