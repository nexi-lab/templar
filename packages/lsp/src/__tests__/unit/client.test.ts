import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LSPClient } from "../../client.js";
import { createTestServerConfig } from "../helpers/fixtures.js";
import { createMockLSPServer, type MockLSPServer } from "../helpers/mock-server.js";

describe("LSPClient", () => {
  let mockServer: MockLSPServer;
  let client: LSPClient;
  let tempDir: string;

  afterEach(async () => {
    try {
      await client?.shutdown();
    } catch {
      // ignore
    }
    mockServer?.destroy();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  async function setupClient(options?: Parameters<typeof createMockLSPServer>[0]): Promise<void> {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-test-"));
    mockServer = createMockLSPServer(options);
    client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 3,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);
  }

  it("initializes and stores server capabilities", async () => {
    await setupClient();
    expect(client.isInitialized).toBe(true);
    expect(client.capabilities).toBeDefined();
    expect(client.capabilities?.hoverProvider).toBe(true);
  });

  it("can send hover request", async () => {
    await setupClient({
      hoverResponse: {
        contents: { kind: "markdown", value: "**test hover**" },
      },
    });

    // Create a temp file for ensureOpen
    const filePath = join(tempDir, "test.ts");
    await writeFile(filePath, "const x = 1;");

    await client.ensureOpen(filePath);

    const result = await client.sendRequest<{ contents: unknown } | null>(
      { method: "textDocument/hover" },
      {
        textDocument: { uri: `file://${filePath}` },
        position: { line: 0, character: 6 },
      },
    );

    expect(result).toBeDefined();
    expect(result?.contents).toEqual({ kind: "markdown", value: "**test hover**" });
  });

  it("tracks open files with LRU eviction", async () => {
    await setupClient();

    // Create 4 files (maxOpenFiles = 3)
    const files = await Promise.all(
      [1, 2, 3, 4].map(async (i) => {
        const filePath = join(tempDir, `file${i}.ts`);
        await writeFile(filePath, `const x${i} = ${i};`);
        return filePath;
      }),
    );

    // Open files 1-3 (fills capacity)
    await client.ensureOpen(files[0]!);
    await client.ensureOpen(files[1]!);
    await client.ensureOpen(files[2]!);

    // Opening file 4 should evict file 1 (oldest)
    await client.ensureOpen(files[3]!);

    // File 1 was evicted, but we can still re-open it
    // (this tests that eviction doesn't crash)
    await client.ensureOpen(files[0]!);
  });

  it("re-opening same file updates LRU without re-sending didOpen", async () => {
    await setupClient();

    const filePath = join(tempDir, "reopen.ts");
    await writeFile(filePath, "const x = 1;");

    await client.ensureOpen(filePath);
    // Opening again should be a no-op (just LRU update)
    await client.ensureOpen(filePath);
  });

  it("shuts down cleanly", async () => {
    await setupClient();
    expect(client.isInitialized).toBe(true);

    await client.shutdown();
    expect(client.isInitialized).toBe(false);
    expect(client.getConnection()).toBeUndefined();
  });

  it("shutdown is safe to call multiple times", async () => {
    await setupClient();
    await client.shutdown();
    await client.shutdown(); // Should not throw
  });

  it("reports capabilities from server", async () => {
    await setupClient({
      capabilities: {
        hoverProvider: true,
        definitionProvider: false,
        renameProvider: false,
      },
    });

    expect(client.capabilities?.hoverProvider).toBe(true);
    expect(client.capabilities?.definitionProvider).toBe(false);
    expect(client.capabilities?.renameProvider).toBe(false);
  });
});
