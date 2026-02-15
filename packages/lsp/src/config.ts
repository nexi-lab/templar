import { extname } from "node:path";
import { z } from "zod";

/** Configuration for a single language server */
export const LanguageServerConfigSchema = z.object({
  /** File extensions this server handles (e.g., ["ts", "tsx", "js", "jsx"]) */
  extensions: z.array(z.string().min(1)).min(1),
  /** Command to spawn the server (e.g., "typescript-language-server") */
  command: z.string().min(1),
  /** Arguments passed to the server command (e.g., ["--stdio"]) */
  args: z.array(z.string()).default([]),
  /** Working directory for the server process */
  rootDir: z.string().default("."),
  /** Environment variables passed to the server process */
  env: z.record(z.string()).optional(),
  /** LSP initialization options (server-specific) */
  initializationOptions: z.record(z.unknown()).optional(),
  /** Whether to start this server eagerly (default: false = lazy) */
  autoStart: z.boolean().default(false),
  /** Idle timeout in ms before shutting down (default: 300000 = 5 min) */
  idleTimeoutMs: z.number().int().positive().default(300_000),
});

/** Top-level LSP manager configuration */
export const LSPConfigSchema = z.object({
  /** Server configurations keyed by language ID */
  servers: z.record(LanguageServerConfigSchema),
  /** Maximum concurrent server instances (default: 5) */
  maxServers: z.number().int().positive().default(5),
  /** Default request timeout in ms (default: 10000) */
  requestTimeoutMs: z.number().int().positive().default(10_000),
  /** Initialization timeout in ms (default: 30000) */
  initTimeoutMs: z.number().int().positive().default(30_000),
  /** Max open files tracked per server (default: 100, LRU eviction) */
  maxOpenFiles: z.number().int().positive().default(100),
  /** Max diagnostics cache entries (default: 1000) */
  maxDiagnostics: z.number().int().positive().default(1000),
  /** Position tolerance for multi-attempt (default: { lines: 1, characters: 3 }) */
  positionTolerance: z
    .union([
      z.object({
        lines: z.number().int().nonnegative().default(1),
        characters: z.number().int().nonnegative().default(3),
      }),
      z.literal(false),
    ])
    .default({ lines: 1, characters: 3 }),
  /** Max restart attempts after crash (default: 3 in 5 minutes) */
  maxRestarts: z.number().int().nonnegative().default(3),
  /** Restart window in ms (default: 300000 = 5 min) */
  restartWindowMs: z.number().int().positive().default(300_000),
});

export type LanguageServerConfig = z.infer<typeof LanguageServerConfigSchema>;
export type LSPConfig = z.infer<typeof LSPConfigSchema>;

/**
 * Maps a file path to a language ID based on configured extensions.
 * Returns `undefined` if no language server handles this extension.
 */
export function resolveLanguage(filePath: string, config: LSPConfig): string | undefined {
  const ext = extname(filePath).replace(/^\./, "");
  if (ext === "") return undefined;

  for (const [languageId, serverConfig] of Object.entries(config.servers)) {
    if (serverConfig.extensions.includes(ext)) {
      return languageId;
    }
  }
  return undefined;
}
