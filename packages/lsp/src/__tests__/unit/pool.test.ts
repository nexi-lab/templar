import { afterEach, describe, expect, it, vi } from "vitest";
import type { LSPConfig } from "../../config.js";
import { LSPClientPool } from "../../pool.js";
import { createTestLSPConfig } from "../helpers/fixtures.js";

// We mock the LSPClient to avoid spawning real processes
vi.mock("../../client.js", () => {
  const clients = new Map<string, { initialized: boolean; shutdown: boolean }>();

  return {
    LSPClient: class MockPoolClient {
      readonly languageId: string;
      readonly workspaceRoot: string;
      diagnosticsCache = { get: () => undefined, set: () => {} };
      private _initialized = false;
      private _capabilities = {
        hoverProvider: true,
        definitionProvider: true,
      };

      constructor(
        languageId: string,
        workspaceRoot: string,
        _serverConfig: unknown,
        _options: unknown,
      ) {
        this.languageId = languageId;
        this.workspaceRoot = workspaceRoot;
      }

      async initialize() {
        this._initialized = true;
        clients.set(`${this.languageId}:${this.workspaceRoot}`, {
          initialized: true,
          shutdown: false,
        });
        return this._capabilities;
      }

      async shutdown() {
        this._initialized = false;
        const key = `${this.languageId}:${this.workspaceRoot}`;
        const entry = clients.get(key);
        if (entry) entry.shutdown = true;
      }

      get isInitialized() {
        return this._initialized;
      }

      get capabilities() {
        return this._capabilities;
      }

      onCrash(_cb: unknown) {
        // no-op in mock
      }
    },
  };
});

describe("LSPClientPool", () => {
  let pool: LSPClientPool;

  afterEach(async () => {
    await pool?.clear();
    vi.restoreAllMocks();
  });

  function createPool(overrides?: Partial<LSPConfig>): LSPClientPool {
    return new LSPClientPool(createTestLSPConfig(overrides));
  }

  it("creates and returns a client for a language", async () => {
    pool = createPool();
    const client = await pool.getClient("typescript", "/workspace");
    expect(client).toBeDefined();
    expect(client.isInitialized).toBe(true);
    expect(pool.count).toBe(1);
  });

  it("reuses existing client for same language+workspace", async () => {
    pool = createPool();
    const client1 = await pool.getClient("typescript", "/workspace");
    const client2 = await pool.getClient("typescript", "/workspace");
    expect(client1).toBe(client2);
    expect(pool.count).toBe(1);
  });

  it("creates separate clients for different workspaces", async () => {
    pool = createPool();
    const client1 = await pool.getClient("typescript", "/workspace1");
    const client2 = await pool.getClient("typescript", "/workspace2");
    expect(client1).not.toBe(client2);
    expect(pool.count).toBe(2);
  });

  it("evicts LRU when pool is full", async () => {
    pool = createPool({ maxServers: 2 });
    await pool.getClient("typescript", "/ws1");
    await pool.getClient("typescript", "/ws2");
    expect(pool.count).toBe(2);

    // This should evict the first client (LRU)
    await pool.getClient("typescript", "/ws3");
    expect(pool.count).toBe(2);
    expect(pool.has("typescript", "/ws1")).toBe(false);
    expect(pool.has("typescript", "/ws3")).toBe(true);
  });

  it("throws for unconfigured language", async () => {
    pool = createPool();
    await expect(pool.getClient("ruby", "/workspace")).rejects.toThrow(
      "No server configuration for language 'ruby'",
    );
  });

  it("clears all clients", async () => {
    pool = createPool();
    await pool.getClient("typescript", "/ws1");
    await pool.getClient("typescript", "/ws2");
    expect(pool.count).toBe(2);

    await pool.clear();
    expect(pool.count).toBe(0);
  });

  it("has() returns correct status", async () => {
    pool = createPool();
    expect(pool.has("typescript", "/ws")).toBe(false);
    await pool.getClient("typescript", "/ws");
    expect(pool.has("typescript", "/ws")).toBe(true);
  });

  it("starts and stops idle checker", async () => {
    pool = createPool();
    pool.startIdleChecker();
    // Starting again should be idempotent
    pool.startIdleChecker();
    pool.stopIdleChecker();
  });
});
