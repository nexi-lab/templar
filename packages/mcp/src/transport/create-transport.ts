/**
 * Factory function to create the appropriate MCP SDK transport
 * from a validated McpServerConfig.
 */

import { McpTransportError } from "@templar/errors";
import type { McpServerConfig } from "./types.js";

/**
 * Creates an MCP SDK Transport instance from the given config.
 * Uses lazy imports to avoid pulling in unused transport modules.
 *
 * Returns the concrete transport type (not the base Transport interface)
 * to avoid exactOptionalPropertyTypes conflicts.
 */
export async function createTransport(config: McpServerConfig) {
  switch (config.transport) {
    case "stdio": {
      const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const params: Record<string, unknown> = { command: config.command };
      if (config.args) params.args = [...config.args];
      if (config.env) params.env = { ...config.env };
      if (config.cwd) params.cwd = config.cwd;
      return new StdioClientTransport(
        params as ConstructorParameters<typeof StdioClientTransport>[0],
      );
    }
    case "http": {
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        config.headers ? { requestInit: { headers: { ...config.headers } } } : undefined,
      );
    }
    default: {
      throw new McpTransportError(
        `Unknown transport type: ${(config as Record<string, unknown>).transport}`,
      );
    }
  }
}
