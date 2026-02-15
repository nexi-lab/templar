import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { Diagnostic, DiagnosticSeverity } from "vscode-languageserver-protocol";
import { LSPClient } from "../../client.js";
import { LSPOperations } from "../../operations.js";
import type { LSPClientPool } from "../../pool.js";
import {
  createTestLSPConfig,
  createTestServerConfig,
  SAMPLE_DEFINITION_LOCATION,
  SAMPLE_DOCUMENT_SYMBOLS,
  SAMPLE_REFERENCE_LOCATIONS,
  SAMPLE_TS_CONTENT,
} from "../helpers/fixtures.js";
import { createMockLSPServer, type MockLSPServer } from "../helpers/mock-server.js";

describe("LSP Protocol Round-Trip", () => {
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

  async function setup(serverOpts?: Parameters<typeof createMockLSPServer>[0]): Promise<string> {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-integ-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    mockServer = createMockLSPServer(serverOpts);
    client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });

    await client.initializeWithTransport(mockServer.transport);
    return filePath;
  }

  it("completes full initialize → hover → shutdown cycle", async () => {
    const filePath = await setup({
      hoverResponse: {
        contents: { kind: "markdown", value: "**greet** function" },
      },
    });

    expect(client.isInitialized).toBe(true);
    expect(client.capabilities?.hoverProvider).toBe(true);

    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const hover = await client.sendRequest<{
      contents: { kind: string; value: string };
    } | null>(
      { method: "textDocument/hover" },
      {
        textDocument: { uri },
        position: { line: 7, character: 16 },
      },
    );

    expect(hover).toBeDefined();
    expect(hover?.contents.value).toBe("**greet** function");

    await client.shutdown();
    expect(client.isInitialized).toBe(false);
  });

  it("completes definition request", async () => {
    const filePath = await setup({
      definitionResponse: SAMPLE_DEFINITION_LOCATION,
    });

    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const result = await client.sendRequest<unknown>(
      { method: "textDocument/definition" },
      {
        textDocument: { uri },
        position: { line: 7, character: 24 },
      },
    );

    expect(result).toEqual(SAMPLE_DEFINITION_LOCATION);
  });

  it("completes references request", async () => {
    const filePath = await setup({
      referencesResponse: SAMPLE_REFERENCE_LOCATIONS,
    });

    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const result = await client.sendRequest<unknown[]>(
      { method: "textDocument/references" },
      {
        textDocument: { uri },
        position: { line: 1, character: 0 },
        context: { includeDeclaration: true },
      },
    );

    expect(result).toHaveLength(2);
  });

  it("completes documentSymbol request", async () => {
    const filePath = await setup({
      documentSymbolsResponse: SAMPLE_DOCUMENT_SYMBOLS,
    });

    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const result = await client.sendRequest<unknown[]>(
      { method: "textDocument/documentSymbol" },
      { textDocument: { uri } },
    );

    expect(result).toHaveLength(3);
  });

  it("completes rename request", async () => {
    const filePath = await setup({
      renameResponse: {
        changes: {
          "file:///workspace/sample.ts": [
            {
              range: {
                start: { line: 7, character: 16 },
                end: { line: 7, character: 21 },
              },
              newText: "sayHello",
            },
          ],
        },
      },
    });

    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const result = await client.sendRequest<{ changes: unknown } | null>(
      { method: "textDocument/rename" },
      {
        textDocument: { uri },
        position: { line: 7, character: 16 },
        newName: "sayHello",
      },
    );

    expect(result).toBeDefined();
    expect(result?.changes).toBeDefined();
  });

  it("handles server with limited capabilities", async () => {
    const _filePath = await setup({
      capabilities: {
        hoverProvider: true,
        definitionProvider: false,
        referencesProvider: false,
        documentSymbolProvider: false,
        workspaceSymbolProvider: false,
        renameProvider: false,
        implementationProvider: false,
      },
    });

    expect(client.capabilities?.hoverProvider).toBe(true);
    expect(client.capabilities?.definitionProvider).toBe(false);
    expect(client.capabilities?.renameProvider).toBe(false);
  });

  it("handles null hover response", async () => {
    const filePath = await setup({
      hoverResponse: null,
    });

    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const result = await client.sendRequest<unknown>(
      { method: "textDocument/hover" },
      {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      },
    );

    expect(result).toBeNull();
  });

  it("handles workspace symbol request", async () => {
    const symbols = [
      {
        name: "UserService",
        kind: 5,
        location: {
          uri: "file:///workspace/sample.ts",
          range: {
            start: { line: 10, character: 0 },
            end: { line: 20, character: 1 },
          },
        },
      },
    ];

    // biome-ignore lint/suspicious/noExplicitAny: Test fixture cast
    await setup({ workspaceSymbolsResponse: symbols as any });

    const result = await client.sendRequest<unknown[]>(
      { method: "workspace/symbol" },
      { query: "User" },
    );

    expect(result).toHaveLength(1);
  });

  it("receives and caches diagnostics push notifications", async () => {
    const filePath = await setup();
    await client.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    const diagnostics: Diagnostic[] = [
      {
        range: {
          start: { line: 2, character: 0 },
          end: { line: 2, character: 10 },
        },
        severity: 1 as DiagnosticSeverity,
        message: "Type 'string' is not assignable to type 'number'",
        source: "typescript",
      },
      {
        range: {
          start: { line: 5, character: 4 },
          end: { line: 5, character: 20 },
        },
        severity: 2 as DiagnosticSeverity,
        message: "Unused variable 'x'",
        source: "typescript",
      },
    ];

    // Server pushes diagnostics notification
    await mockServer.sendDiagnostics(uri, diagnostics);

    // Client should have cached them
    const cached = client.diagnosticsCache.get(uri);
    expect(cached).toBeDefined();
    expect(cached).toHaveLength(2);
    expect(cached![0]!.message).toBe("Type 'string' is not assignable to type 'number'");
    expect(cached![1]!.message).toBe("Unused variable 'x'");
  });

  it("handles request timeout gracefully", async () => {
    const filePath = await setup({ delay: 500 });

    // Create client with very short timeout
    mockServer.destroy();
    mockServer = createMockLSPServer({ delay: 500 });
    const shortTimeoutClient = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 50, // Very short timeout
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });

    await shortTimeoutClient.initializeWithTransport(mockServer.transport);
    await shortTimeoutClient.ensureOpen(filePath);

    const uri = pathToFileURL(filePath).href;
    await expect(
      shortTimeoutClient.sendRequest("textDocument/hover", {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      }),
    ).rejects.toThrow(/timed out/);

    await shortTimeoutClient.shutdown();
  });

  it("handles stream destruction (crash simulation)", async () => {
    // Use short timeout so the test doesn't wait 10s
    mockServer?.destroy();
    tempDir = await mkdtemp(join(tmpdir(), "lsp-integ-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    mockServer = createMockLSPServer();
    client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 200,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);
    await client.ensureOpen(filePath);

    // Dispose server connection to simulate a crash
    mockServer.serverConnection.dispose();

    const uri = pathToFileURL(filePath).href;
    // Subsequent requests should fail
    await expect(
      client.sendRequest("textDocument/hover", {
        textDocument: { uri },
        position: { line: 0, character: 0 },
      }),
    ).rejects.toThrow();
  });
});

describe("LSP Operations — Multi-Attempt Position Tolerance", () => {
  let mockServer: MockLSPServer;
  let tempDir: string;

  afterEach(async () => {
    mockServer?.destroy();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("resolves hover using nearby position when exact fails", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-ops-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    // Server only responds to hover at exact position (7, 16),
    // returns null for other positions
    mockServer = createMockLSPServer({
      hoverHandler: (params) => {
        const { line, character } = params.position;
        if (line === 7 && character === 16) {
          return {
            contents: { kind: "markdown", value: "**greet** function" },
          };
        }
        return null;
      },
    });

    const client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);

    // Create a mock pool that returns our client
    const config = createTestLSPConfig({
      positionTolerance: { lines: 1, characters: 3 },
    });
    const mockPool = {
      getClient: async () => client,
    } as unknown as LSPClientPool;

    const ops = new LSPOperations(mockPool, config);

    // Request hover at (8, 16) — off by 1 line
    // Multi-attempt should find the result at nearby (7, 16)
    const result = await ops.hover(filePath, 8, 16, tempDir);
    expect(result).toBeDefined();
    expect(result?.contents).toBeDefined();

    await client.shutdown();
  });

  it("returns null when no nearby position has results", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-ops-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    // Server returns null for all positions
    mockServer = createMockLSPServer({
      hoverResponse: null,
    });

    const client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);

    const config = createTestLSPConfig({
      positionTolerance: { lines: 1, characters: 1 },
    });
    const mockPool = {
      getClient: async () => client,
    } as unknown as LSPClientPool;

    const ops = new LSPOperations(mockPool, config);

    const result = await ops.hover(filePath, 5, 5, tempDir);
    expect(result).toBeNull();

    await client.shutdown();
  });

  it("finds definition with multi-attempt when exact position misses", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-ops-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    let callCount = 0;
    // Server only returns definition for exact position (3, 2)
    mockServer = createMockLSPServer();
    // Override the definition handler after creation via the server connection
    mockServer.serverConnection.onRequest(
      "textDocument/definition",
      (params: { position: { line: number; character: number } }) => {
        callCount++;
        if (params.position.line === 3 && params.position.character === 2) {
          return SAMPLE_DEFINITION_LOCATION;
        }
        return [];
      },
    );

    const client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);

    const config = createTestLSPConfig({
      positionTolerance: { lines: 1, characters: 3 },
    });
    const mockPool = {
      getClient: async () => client,
    } as unknown as LSPClientPool;

    const ops = new LSPOperations(mockPool, config);

    // Request at (2, 2) — off by 1 line. Tolerance of 1 line should try (3, 2)
    const result = await ops.definition(filePath, 2, 2, tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]!.uri).toBe(SAMPLE_DEFINITION_LOCATION.uri);
    // Multiple positions were tried
    expect(callCount).toBeGreaterThan(1);

    await client.shutdown();
  });

  it("skips multi-attempt when positionTolerance is false", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-ops-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    let callCount = 0;
    mockServer = createMockLSPServer({
      hoverHandler: (_params) => {
        callCount++;
        return null;
      },
    });

    const client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);

    const config = createTestLSPConfig({
      positionTolerance: false,
    });
    const mockPool = {
      getClient: async () => client,
    } as unknown as LSPClientPool;

    const ops = new LSPOperations(mockPool, config);

    await ops.hover(filePath, 5, 5, tempDir);
    // Only 1 call because tolerance is disabled
    expect(callCount).toBe(1);

    await client.shutdown();
  });

  it("retrieves diagnostics from cache after server push", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lsp-ops-"));
    const filePath = join(tempDir, "sample.ts");
    await writeFile(filePath, SAMPLE_TS_CONTENT);

    mockServer = createMockLSPServer();

    const client = new LSPClient("typescript", tempDir, createTestServerConfig(), {
      requestTimeoutMs: 5000,
      initTimeoutMs: 10000,
      maxOpenFiles: 100,
      maxDiagnostics: 100,
    });
    await client.initializeWithTransport(mockServer.transport);

    const config = createTestLSPConfig();
    const mockPool = {
      getClient: async () => client,
    } as unknown as LSPClientPool;

    const ops = new LSPOperations(mockPool, config);

    // Push diagnostics from server
    const uri = pathToFileURL(filePath).href;
    await mockServer.sendDiagnostics(uri, [
      {
        range: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 5 },
        },
        severity: 1 as DiagnosticSeverity,
        message: "Cannot find name 'foo'",
        source: "typescript",
      },
    ]);

    // Read diagnostics via operations layer
    const diags = await ops.diagnostics(filePath, tempDir);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toBe("Cannot find name 'foo'");

    await client.shutdown();
  });
});
