/**
 * @templar/lsp
 *
 * Language Server Protocol client manager for Templar.
 * Provides code intelligence (hover, go-to-definition, references, etc.)
 * for AI agent coding assistants.
 */

// Client (for advanced usage / testing)
export { LSPClient, type LSPClientOptions, type LSPClientTransport } from "./client.js";

// Config
export {
  type LanguageServerConfig,
  LanguageServerConfigSchema,
  type LSPConfig,
  LSPConfigSchema,
  resolveLanguage,
} from "./config.js";
// Diagnostics cache
export { DiagnosticsCache } from "./diagnostics.js";
// Main API
export { LSPManager } from "./manager.js";

// Operations
export {
  generateNearbyPositions,
  LSPOperations,
  type PositionTolerance,
} from "./operations.js";
// Pool
export { LSPClientPool } from "./pool.js";

// Process management
export {
  LSPProcessHandle,
  RestartTracker,
  spawnLSPServer,
} from "./process.js";

// Package metadata
export const PACKAGE_NAME = "@templar/lsp";
export const PACKAGE_VERSION = "0.0.0";
