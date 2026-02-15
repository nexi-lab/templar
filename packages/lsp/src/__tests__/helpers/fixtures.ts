import type { DocumentSymbol, Hover, Location, SymbolKind } from "vscode-languageserver-protocol";
import type { LanguageServerConfig, LSPConfig } from "../../config.js";

/** Sample TypeScript file content for testing */
export const SAMPLE_TS_CONTENT = `
export interface User {
  id: string;
  name: string;
  email: string;
}

export function greet(user: User): string {
  return \`Hello, \${user.name}!\`;
}

export class UserService {
  private users: User[] = [];

  add(user: User): void {
    this.users.push(user);
  }

  findById(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }
}
`.trim();

/** Expected hover result for the "greet" function (line 7, char 16) */
export const EXPECTED_HOVER_GREET: Hover = {
  contents: {
    kind: "markdown",
    value: "**mock hover**",
  },
};

/** Sample location for definition result */
export const SAMPLE_DEFINITION_LOCATION: Location = {
  uri: "file:///workspace/src/sample.ts",
  range: {
    start: { line: 1, character: 0 },
    end: { line: 5, character: 1 },
  },
};

/** Sample reference locations */
export const SAMPLE_REFERENCE_LOCATIONS: Location[] = [
  {
    uri: "file:///workspace/src/sample.ts",
    range: {
      start: { line: 7, character: 24 },
      end: { line: 7, character: 28 },
    },
  },
  {
    uri: "file:///workspace/src/sample.ts",
    range: {
      start: { line: 12, character: 16 },
      end: { line: 12, character: 20 },
    },
  },
];

/** Sample document symbols */
export const SAMPLE_DOCUMENT_SYMBOLS: DocumentSymbol[] = [
  {
    name: "User",
    kind: 11 as SymbolKind, // Interface
    range: {
      start: { line: 0, character: 0 },
      end: { line: 4, character: 1 },
    },
    selectionRange: {
      start: { line: 0, character: 17 },
      end: { line: 0, character: 21 },
    },
  },
  {
    name: "greet",
    kind: 12 as SymbolKind, // Function
    range: {
      start: { line: 6, character: 0 },
      end: { line: 8, character: 1 },
    },
    selectionRange: {
      start: { line: 6, character: 16 },
      end: { line: 6, character: 21 },
    },
  },
  {
    name: "UserService",
    kind: 5 as SymbolKind, // Class
    range: {
      start: { line: 10, character: 0 },
      end: { line: 20, character: 1 },
    },
    selectionRange: {
      start: { line: 10, character: 13 },
      end: { line: 10, character: 24 },
    },
  },
];

/** Minimal language server config for testing */
export function createTestServerConfig(
  overrides?: Partial<LanguageServerConfig>,
): LanguageServerConfig {
  return {
    extensions: ["ts", "tsx"],
    command: "typescript-language-server",
    args: ["--stdio"],
    rootDir: ".",
    autoStart: false,
    idleTimeoutMs: 300_000,
    ...overrides,
  };
}

/** Minimal LSP config for testing */
export function createTestLSPConfig(overrides?: Partial<LSPConfig>): LSPConfig {
  return {
    servers: {
      typescript: createTestServerConfig(),
    },
    maxServers: 5,
    requestTimeoutMs: 10_000,
    initTimeoutMs: 30_000,
    maxOpenFiles: 100,
    maxDiagnostics: 1000,
    positionTolerance: { lines: 1, characters: 3 },
    maxRestarts: 3,
    restartWindowMs: 300_000,
    ...overrides,
  };
}
