import { readFile } from "node:fs/promises";
import type { Readable, Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import {
  createMessageConnection,
  type MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import type {
  Diagnostic,
  InitializeResult,
  ServerCapabilities,
} from "vscode-languageserver-protocol";
import type { LanguageServerConfig } from "./config.js";
import { DiagnosticsCache } from "./diagnostics.js";
import { type LSPProcessHandle, spawnLSPServer } from "./process.js";

export interface LSPClientOptions {
  readonly requestTimeoutMs: number;
  readonly initTimeoutMs: number;
  readonly maxOpenFiles: number;
  readonly maxDiagnostics: number;
}

export interface LSPClientTransport {
  readonly readable: Readable;
  readonly writable: Writable;
}

/**
 * Manages a single LSP server connection lifecycle.
 * Uses string-based LSP method names to avoid cross-package type mismatches
 * between vscode-jsonrpc versions.
 */
export class LSPClient {
  private connection: MessageConnection | undefined;
  private processHandle: LSPProcessHandle | undefined;
  private serverCapabilities: ServerCapabilities | undefined;
  private initialized = false;
  private readonly openFiles = new Map<string, number>(); // uri -> version
  private readonly openFileOrder: string[] = []; // LRU tracking
  readonly diagnosticsCache: DiagnosticsCache;

  constructor(
    readonly languageId: string,
    readonly workspaceRoot: string,
    private readonly serverConfig: LanguageServerConfig,
    private readonly options: LSPClientOptions,
  ) {
    this.diagnosticsCache = new DiagnosticsCache(options.maxDiagnostics);
  }

  /**
   * Initialize with a pre-existing transport (for testing with mock servers).
   */
  async initializeWithTransport(transport: LSPClientTransport): Promise<ServerCapabilities> {
    this.connection = createMessageConnection(
      new StreamMessageReader(transport.readable),
      new StreamMessageWriter(transport.writable),
    );
    return this.performInitialize();
  }

  /**
   * Spawn the server process and perform LSP initialization handshake.
   */
  async initialize(): Promise<ServerCapabilities> {
    this.processHandle = spawnLSPServer(this.languageId, this.serverConfig);

    this.connection = createMessageConnection(
      new StreamMessageReader(this.processHandle.stdout),
      new StreamMessageWriter(this.processHandle.stdin),
    );

    return this.performInitialize();
  }

  private async performInitialize(): Promise<ServerCapabilities> {
    const conn = this.connection;
    if (!conn) throw new Error("Connection not established");

    // Set up diagnostics notification handler using string method
    conn.onNotification(
      "textDocument/publishDiagnostics",
      (params: { uri: string; diagnostics: Diagnostic[] }) => {
        this.diagnosticsCache.set(params.uri, params.diagnostics);
      },
    );

    conn.listen();

    const initParams = {
      processId: process.pid,
      capabilities: {
        textDocument: {
          hover: { contentFormat: ["markdown", "plaintext"] },
          definition: { linkSupport: true },
          references: {},
          implementation: {},
          documentSymbol: {
            hierarchicalDocumentSymbolSupport: true,
          },
          rename: { prepareSupport: true },
          publishDiagnostics: { relatedInformation: true },
        },
        workspace: {
          symbol: {},
          workspaceFolders: true,
        },
      },
      rootUri: pathToFileURL(this.workspaceRoot).href,
      workspaceFolders: [
        {
          uri: pathToFileURL(this.workspaceRoot).href,
          name: "workspace",
        },
      ],
      ...(this.serverConfig.initializationOptions
        ? { initializationOptions: this.serverConfig.initializationOptions }
        : {}),
    };

    const result = await this.sendRequestWithTimeout<InitializeResult>(
      "initialize",
      initParams,
      this.options.initTimeoutMs,
    );

    this.serverCapabilities = result.capabilities;

    await conn.sendNotification("initialized", {});

    this.initialized = true;
    return result.capabilities;
  }

  /**
   * Gracefully shut down the server.
   */
  async shutdown(): Promise<void> {
    if (!this.connection) return;

    try {
      await this.sendRequestWithTimeout("shutdown", undefined, 5000);
      await this.connection.sendNotification("exit");
    } catch {
      // Server may have already crashed
    }

    this.connection.dispose();
    this.connection = undefined;
    this.initialized = false;
    this.openFiles.clear();
    this.openFileOrder.length = 0;

    if (this.processHandle) {
      await this.processHandle.kill(5000);
      this.processHandle = undefined;
    }
  }

  /**
   * Ensure a file is open on the server, reading from disk if needed.
   * Uses LRU eviction when at max capacity.
   */
  async ensureOpen(filePath: string): Promise<void> {
    const uri = pathToFileURL(filePath).href;

    if (this.openFiles.has(uri)) {
      // Move to end of LRU
      const idx = this.openFileOrder.indexOf(uri);
      if (idx !== -1) this.openFileOrder.splice(idx, 1);
      this.openFileOrder.push(uri);
      return;
    }

    // Evict oldest if at capacity
    while (this.openFiles.size >= this.options.maxOpenFiles && this.openFileOrder.length > 0) {
      const evictUri = this.openFileOrder.shift();
      if (!evictUri) break;
      this.openFiles.delete(evictUri);
      try {
        await this.connection?.sendNotification("textDocument/didClose", {
          textDocument: { uri: evictUri },
        });
      } catch {
        // Best effort
      }
    }

    const content = await readFile(filePath, "utf-8");
    const languageId = this.languageId;

    await this.connection?.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId,
        version: 1,
        text: content,
      },
    });

    this.openFiles.set(uri, 1);
    this.openFileOrder.push(uri);
  }

  /**
   * Send a request with timeout using string method name.
   */
  async sendRequest<R>(
    method: string | { method: string },
    params: unknown,
    timeoutMs?: number,
  ): Promise<R> {
    const methodName = typeof method === "string" ? method : method.method;
    return this.sendRequestWithTimeout<R>(
      methodName,
      params,
      timeoutMs ?? this.options.requestTimeoutMs,
    );
  }

  /**
   * Get the underlying connection (for advanced usage).
   */
  getConnection(): MessageConnection | undefined {
    return this.connection;
  }

  get capabilities(): ServerCapabilities | undefined {
    return this.serverCapabilities;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  get process(): LSPProcessHandle | undefined {
    return this.processHandle;
  }

  onCrash(callback: (code: number | null, signal: string | null) => void): void {
    this.processHandle?.onCrash(callback);
  }

  private sendRequestWithTimeout<R>(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<R> {
    const conn = this.connection;
    if (!conn) {
      return Promise.reject(new Error("LSP connection not established"));
    }

    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`LSP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      conn
        .sendRequest(method, params)
        .then((result: unknown) => {
          clearTimeout(timer);
          resolve(result as R);
        })
        .catch((err: unknown) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
