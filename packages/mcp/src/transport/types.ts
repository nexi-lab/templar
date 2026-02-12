/**
 * Transport configuration types for MCP server connections.
 * Discriminated union on the `transport` field.
 */

export interface McpStdioConfig {
  readonly transport: "stdio";
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
}

export interface McpHttpConfig {
  readonly transport: "http";
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export type McpServerConfig = McpStdioConfig | McpHttpConfig;
