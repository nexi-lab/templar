import type {
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  SymbolInformation,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";
import { type LSPConfig, LSPConfigSchema, resolveLanguage as resolveLanguageFn } from "./config.js";
import { LSPOperations } from "./operations.js";
import { LSPClientPool } from "./pool.js";

/**
 * Top-level API for managing language servers and performing
 * LSP operations across workspace files.
 */
export class LSPManager {
  private readonly config: LSPConfig;
  private readonly pool: LSPClientPool;
  private readonly ops: LSPOperations;
  private started = false;
  private readonly workspaceRoot: string;

  constructor(rawConfig: Readonly<Record<string, unknown>>, workspaceRoot: string) {
    this.config = LSPConfigSchema.parse(rawConfig);
    this.workspaceRoot = workspaceRoot;
    this.pool = new LSPClientPool(this.config);
    this.ops = new LSPOperations(this.pool, this.config);
  }

  /** Start the manager (begins idle checking, starts autoStart servers). */
  async start(): Promise<void> {
    if (this.started) return;

    this.pool.startIdleChecker();

    // Start any autoStart servers
    const autoStartEntries = Object.entries(this.config.servers).filter(([, cfg]) => cfg.autoStart);

    await Promise.all(
      autoStartEntries.map(([langId]) =>
        this.pool.getClient(langId, this.workspaceRoot).catch(() => {
          // Non-fatal: autoStart failure is logged but not thrown
        }),
      ),
    );

    this.started = true;
  }

  /** Stop the manager (shutdown all servers, clear pool). */
  async stop(): Promise<void> {
    if (!this.started) return;
    await this.pool.clear();
    this.started = false;
  }

  // --- LSP Operations ---

  async hover(file: string, line: number, character: number): Promise<Hover | null> {
    return this.ops.hover(file, line, character, this.workspaceRoot);
  }

  async definition(file: string, line: number, character: number): Promise<Location[]> {
    return this.ops.definition(file, line, character, this.workspaceRoot);
  }

  async references(
    file: string,
    line: number,
    character: number,
    includeDeclaration?: boolean,
  ): Promise<Location[]> {
    return this.ops.references(file, line, character, this.workspaceRoot, includeDeclaration);
  }

  async implementation(file: string, line: number, character: number): Promise<Location[]> {
    return this.ops.implementation(file, line, character, this.workspaceRoot);
  }

  async documentSymbols(file: string): Promise<DocumentSymbol[]> {
    return this.ops.documentSymbols(file, this.workspaceRoot);
  }

  async workspaceSymbols(query: string, languageId?: string): Promise<SymbolInformation[]> {
    return this.ops.workspaceSymbols(query, this.workspaceRoot, languageId);
  }

  async rename(
    file: string,
    line: number,
    character: number,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    return this.ops.rename(file, line, character, newName, this.workspaceRoot);
  }

  async diagnostics(file: string): Promise<readonly Diagnostic[]> {
    return this.ops.diagnostics(file, this.workspaceRoot);
  }

  // --- Utility ---

  /** Check if a language is configured. */
  hasLanguage(languageId: string): boolean {
    return languageId in this.config.servers;
  }

  /** Resolve file path to language ID. */
  resolveLanguage(filePath: string): string | undefined {
    return resolveLanguageFn(filePath, this.config);
  }

  /** Get count of active server instances. */
  get activeServers(): number {
    return this.pool.count;
  }

  get isStarted(): boolean {
    return this.started;
  }
}
