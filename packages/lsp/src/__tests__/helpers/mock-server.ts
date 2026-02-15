import { PassThrough } from "node:stream";
import {
  createMessageConnection,
  type MessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-jsonrpc/node";
import type {
  Diagnostic,
  DocumentSymbol,
  Hover,
  InitializeResult,
  Location,
  ServerCapabilities,
  SymbolInformation,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";
import type { LSPClientTransport } from "../../client.js";

export interface MockLSPServerOptions {
  capabilities?: Partial<ServerCapabilities>;
  hoverResponse?: Hover | null;
  /** Custom hover handler that receives params and can return position-dependent responses */
  hoverHandler?: (params: {
    textDocument: { uri: string };
    position: { line: number; character: number };
  }) => Hover | null;
  definitionResponse?: Location | Location[] | null;
  referencesResponse?: Location[] | null;
  implementationResponse?: Location[] | null;
  documentSymbolsResponse?: DocumentSymbol[] | SymbolInformation[] | null;
  workspaceSymbolsResponse?: SymbolInformation[] | null;
  renameResponse?: WorkspaceEdit | null;
  delay?: number;
  crashAfter?: number;
}

export interface MockLSPServer {
  readonly transport: LSPClientTransport;
  readonly serverConnection: MessageConnection;
  /** Send a diagnostics notification from server to client */
  sendDiagnostics(uri: string, diagnostics: Diagnostic[]): Promise<void>;
  destroy(): void;
}

/**
 * Create an in-process mock LSP server using PassThrough streams.
 * Returns a transport that can be passed to LSPClient.initializeWithTransport().
 */
export function createMockLSPServer(options: MockLSPServerOptions = {}): MockLSPServer {
  const clientToServer = new PassThrough();
  const serverToClient = new PassThrough();

  const serverConnection = createMessageConnection(
    new StreamMessageReader(clientToServer),
    new StreamMessageWriter(serverToClient),
  );

  let requestCount = 0;

  const maybeDelay = <T>(value: T): Promise<T> | T => {
    if (options.delay && options.delay > 0) {
      return new Promise<T>((resolve) => setTimeout(() => resolve(value), options.delay));
    }
    return value;
  };

  const maybeCrash = (): void => {
    if (options.crashAfter && requestCount >= options.crashAfter) {
      clientToServer.destroy();
      serverToClient.destroy();
    }
  };

  const defaultCapabilities: ServerCapabilities = {
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    implementationProvider: true,
    documentSymbolProvider: true,
    workspaceSymbolProvider: true,
    renameProvider: true,
    textDocumentSync: 1,
    ...options.capabilities,
  };

  // Use string-based method handlers to avoid cross-package type issues
  serverConnection.onRequest("initialize", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    const result: InitializeResult = {
      capabilities: defaultCapabilities,
    };
    return maybeDelay(result);
  });

  serverConnection.onRequest("shutdown", () => {
    requestCount++;
    return maybeDelay(null);
  });

  serverConnection.onRequest("textDocument/hover", (params: unknown) => {
    requestCount++;
    maybeCrash();
    if (options.hoverHandler) {
      return maybeDelay(
        options.hoverHandler(
          params as {
            textDocument: { uri: string };
            position: { line: number; character: number };
          },
        ),
      );
    }
    return maybeDelay(
      options.hoverResponse !== undefined
        ? options.hoverResponse
        : { contents: { kind: "markdown", value: "**mock hover**" } },
    );
  });

  serverConnection.onRequest("textDocument/definition", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    return maybeDelay(options.definitionResponse !== undefined ? options.definitionResponse : []);
  });

  serverConnection.onRequest("textDocument/references", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    return maybeDelay(options.referencesResponse !== undefined ? options.referencesResponse : []);
  });

  serverConnection.onRequest("textDocument/implementation", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    return maybeDelay(
      options.implementationResponse !== undefined ? options.implementationResponse : [],
    );
  });

  serverConnection.onRequest("textDocument/documentSymbol", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    return maybeDelay(
      options.documentSymbolsResponse !== undefined ? options.documentSymbolsResponse : [],
    );
  });

  serverConnection.onRequest("workspace/symbol", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    return maybeDelay(
      options.workspaceSymbolsResponse !== undefined ? options.workspaceSymbolsResponse : [],
    );
  });

  serverConnection.onRequest("textDocument/rename", (_params: unknown) => {
    requestCount++;
    maybeCrash();
    return maybeDelay(options.renameResponse !== undefined ? options.renameResponse : null);
  });

  serverConnection.listen();

  return {
    transport: {
      readable: serverToClient,
      writable: clientToServer,
    },
    serverConnection,
    async sendDiagnostics(uri: string, diagnostics: Diagnostic[]): Promise<void> {
      await serverConnection.sendNotification("textDocument/publishDiagnostics", {
        uri,
        diagnostics,
      });
      // Small delay to allow the notification to be processed
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    },
    destroy() {
      serverConnection.dispose();
      clientToServer.destroy();
      serverToClient.destroy();
    },
  };
}
