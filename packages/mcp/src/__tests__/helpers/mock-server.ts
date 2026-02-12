/**
 * In-process MCP server for integration tests.
 * Uses @modelcontextprotocol/sdk McpServer + InMemoryTransport.
 */

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";

export interface MockServerOptions {
  readonly name?: string;
  readonly version?: string;
}

/**
 * Creates an in-process MCP server and returns the client-side transport.
 * The server is fully connected and ready to handle requests.
 */
export async function createMockServer(options: MockServerOptions = {}) {
  const server = new McpServer({
    name: options.name ?? "test-server",
    version: options.version ?? "1.0.0",
  });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  return {
    server,
    clientTransport,
    serverTransport,

    registerTool(
      name: string,
      description: string,
      schema: Record<string, z.ZodType>,
      handler: (args: Record<string, unknown>) => {
        content: Array<{ type: "text"; text: string }>;
        isError?: boolean;
      },
    ) {
      server.tool(name, description, schema, async (args) => {
        return handler(args as Record<string, unknown>);
      });
    },

    registerResource(name: string, uri: string, content: string) {
      server.resource(name, uri, async () => ({
        contents: [{ uri, text: content }],
      }));
    },

    registerPrompt(
      name: string,
      description: string,
      schema: Record<string, z.ZodType>,
      handler: (args: Record<string, unknown>) => {
        messages: Array<{
          role: "user" | "assistant";
          content: { type: "text"; text: string };
        }>;
      },
    ) {
      server.prompt(name, description, schema, async (args) => {
        return handler(args as Record<string, unknown>);
      });
    },

    async start() {
      await server.connect(serverTransport);
    },

    async stop() {
      await server.close();
    },
  };
}
