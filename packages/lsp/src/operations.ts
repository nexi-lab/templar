import { pathToFileURL } from "node:url";
import type {
  Diagnostic,
  DocumentSymbol,
  Hover,
  Location,
  Position,
  SymbolInformation,
  WorkspaceEdit,
} from "vscode-languageserver-protocol";
import type { LSPClient } from "./client.js";
import { type LSPConfig, resolveLanguage } from "./config.js";
import type { LSPClientPool } from "./pool.js";

export interface PositionTolerance {
  readonly lines: number;
  readonly characters: number;
}

/**
 * Generate nearby positions for multi-attempt resolution (cclsp pattern).
 * Exact position is always first in the array.
 */
export function generateNearbyPositions(
  line: number,
  character: number,
  tolerance: PositionTolerance,
): Position[] {
  const positions: Position[] = [{ line, character }];

  for (let dl = -tolerance.lines; dl <= tolerance.lines; dl++) {
    for (let dc = -tolerance.characters; dc <= tolerance.characters; dc++) {
      if (dl === 0 && dc === 0) continue;
      const l = line + dl;
      const c = character + dc;
      if (l >= 0 && c >= 0) {
        positions.push({ line: l, character: c });
      }
    }
  }

  return positions;
}

// LSP method constants
const METHOD_HOVER = "textDocument/hover";
const METHOD_DEFINITION = "textDocument/definition";
const METHOD_REFERENCES = "textDocument/references";
const METHOD_IMPLEMENTATION = "textDocument/implementation";
const METHOD_DOCUMENT_SYMBOL = "textDocument/documentSymbol";
const METHOD_WORKSPACE_SYMBOL = "workspace/symbol";
const METHOD_RENAME = "textDocument/rename";

/**
 * LSP operations implementation.
 * Each method resolves language, gets client, ensures file open,
 * checks capabilities, and sends the request.
 */
export class LSPOperations {
  constructor(
    private readonly pool: LSPClientPool,
    private readonly config: LSPConfig,
  ) {}

  async hover(
    file: string,
    line: number,
    character: number,
    workspaceRoot: string,
  ): Promise<Hover | null> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    if (!client.capabilities?.hoverProvider) return null;

    const positions = this.getPositions(line, character);
    const uri = pathToFileURL(file).href;

    for (const pos of positions) {
      try {
        const result = await client.sendRequest<Hover | null>(METHOD_HOVER, {
          textDocument: { uri },
          position: pos,
        });
        if (result?.contents) return result;
      } catch {
        // Try next position
      }
    }

    return null;
  }

  async definition(
    file: string,
    line: number,
    character: number,
    workspaceRoot: string,
  ): Promise<Location[]> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    if (!client.capabilities?.definitionProvider) return [];

    const positions = this.getPositions(line, character);
    const uri = pathToFileURL(file).href;

    for (const pos of positions) {
      try {
        const result = await client.sendRequest<
          Location | Location[] | LocationLinkResult[] | null
        >(METHOD_DEFINITION, {
          textDocument: { uri },
          position: pos,
        });

        const locations = normalizeLocations(result);
        if (locations.length > 0) return locations;
      } catch {
        // Try next position
      }
    }

    return [];
  }

  async references(
    file: string,
    line: number,
    character: number,
    workspaceRoot: string,
    includeDeclaration = true,
  ): Promise<Location[]> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    if (!client.capabilities?.referencesProvider) return [];

    const positions = this.getPositions(line, character);
    const uri = pathToFileURL(file).href;

    for (const pos of positions) {
      try {
        const result = await client.sendRequest<Location[] | null>(METHOD_REFERENCES, {
          textDocument: { uri },
          position: pos,
          context: { includeDeclaration },
        });
        if (result && result.length > 0) return result;
      } catch {
        // Try next position
      }
    }

    return [];
  }

  async implementation(
    file: string,
    line: number,
    character: number,
    workspaceRoot: string,
  ): Promise<Location[]> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    if (!client.capabilities?.implementationProvider) return [];

    const positions = this.getPositions(line, character);
    const uri = pathToFileURL(file).href;

    for (const pos of positions) {
      try {
        const result = await client.sendRequest<
          Location | Location[] | LocationLinkResult[] | null
        >(METHOD_IMPLEMENTATION, {
          textDocument: { uri },
          position: pos,
        });

        const locations = normalizeLocations(result);
        if (locations.length > 0) return locations;
      } catch {
        // Try next position
      }
    }

    return [];
  }

  async documentSymbols(file: string, workspaceRoot: string): Promise<DocumentSymbol[]> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    if (!client.capabilities?.documentSymbolProvider) return [];

    const uri = pathToFileURL(file).href;
    const result = await client.sendRequest<DocumentSymbol[] | SymbolInformation[] | null>(
      METHOD_DOCUMENT_SYMBOL,
      {
        textDocument: { uri },
      },
    );

    if (!result) return [];

    // DocumentSymbol has `range`, SymbolInformation has `location`
    if (result.length > 0 && "range" in result[0]!) {
      return result as DocumentSymbol[];
    }

    // Convert SymbolInformation to flat DocumentSymbol (simplified)
    return (result as SymbolInformation[]).map((si) => ({
      name: si.name,
      kind: si.kind,
      range: si.location.range,
      selectionRange: si.location.range,
    }));
  }

  async workspaceSymbols(
    query: string,
    workspaceRoot: string,
    languageId?: string,
  ): Promise<SymbolInformation[]> {
    const langId = languageId ?? Object.keys(this.config.servers)[0];
    if (!langId) return [];

    const client = await this.pool.getClient(langId, workspaceRoot);

    if (!client.capabilities?.workspaceSymbolProvider) return [];

    const result = await client.sendRequest<SymbolInformation[] | null>(METHOD_WORKSPACE_SYMBOL, {
      query,
    });

    return result ?? [];
  }

  async rename(
    file: string,
    line: number,
    character: number,
    newName: string,
    workspaceRoot: string,
  ): Promise<WorkspaceEdit | null> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    if (!client.capabilities?.renameProvider) return null;

    const uri = pathToFileURL(file).href;
    const result = await client.sendRequest<WorkspaceEdit | null>(METHOD_RENAME, {
      textDocument: { uri },
      position: { line, character },
      newName,
    });

    return result;
  }

  async diagnostics(file: string, workspaceRoot: string): Promise<readonly Diagnostic[]> {
    const client = await this.getClientForFile(file, workspaceRoot);
    await client.ensureOpen(file);

    const uri = pathToFileURL(file).href;
    return client.diagnosticsCache.get(uri) ?? [];
  }

  private async getClientForFile(file: string, workspaceRoot: string): Promise<LSPClient> {
    const languageId = resolveLanguage(file, this.config);
    if (!languageId) {
      throw new Error(`No language server configured for file: ${file}`);
    }
    return this.pool.getClient(languageId, workspaceRoot);
  }

  private getPositions(line: number, character: number): Position[] {
    if (this.config.positionTolerance === false) {
      return [{ line, character }];
    }
    return generateNearbyPositions(line, character, this.config.positionTolerance);
  }
}

/** Internal type for LocationLink results from LSP */
interface LocationLinkResult {
  readonly targetUri: string;
  readonly targetRange: { start: Position; end: Position };
  readonly targetSelectionRange?: { start: Position; end: Position };
  readonly originSelectionRange?: { start: Position; end: Position };
}

/**
 * Normalize Location | Location[] | LocationLink[] | null to Location[].
 */
function normalizeLocations(
  result: Location | Location[] | LocationLinkResult[] | null,
): Location[] {
  if (!result) return [];

  if (Array.isArray(result)) {
    if (result.length === 0) return [];
    const first = result[0]!;
    if ("targetUri" in first) {
      return (result as LocationLinkResult[]).map((ll) => ({
        uri: ll.targetUri,
        range: ll.targetSelectionRange ?? ll.targetRange,
      }));
    }
    return result as Location[];
  }

  return [result as Location];
}
