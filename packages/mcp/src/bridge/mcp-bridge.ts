/**
 * McpBridge — Core MCP client implementation.
 *
 * Wraps the MCP SDK Client with typed, frozen return values.
 * One bridge per MCP server — compose externally for multi-server.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  McpConnectionFailedError,
  McpInitializationFailedError,
  McpResourceNotFoundError,
  McpResourceReadFailedError,
  McpServerDisconnectedError,
  McpToolCallFailedError,
  McpToolNotFoundError,
  McpTransportError,
} from "@templar/errors";
import { parseMcpConfig } from "../config/config.js";
import { createTransport } from "../transport/create-transport.js";
import type {
  McpContent,
  McpPrompt,
  McpPromptArgument,
  McpPromptMessage,
  McpPromptResult,
  McpResource,
  McpResourceContent,
  McpServerInfo,
  McpTool,
  McpToolResult,
} from "./types.js";

function freezeContent(raw: Record<string, unknown>): McpContent {
  const obj: Record<string, unknown> = {
    type: raw.type as McpContent["type"],
  };
  if (raw.text !== undefined) obj.text = raw.text;
  if (raw.data !== undefined) obj.data = raw.data;
  if (raw.mimeType !== undefined) obj.mimeType = raw.mimeType;
  if (raw.uri !== undefined) obj.uri = raw.uri;
  return Object.freeze(obj as unknown as McpContent);
}

function freezeTool(raw: Record<string, unknown>): McpTool {
  const obj: Record<string, unknown> = { name: raw.name as string };
  if (raw.description !== undefined) obj.description = raw.description;
  if (raw.inputSchema !== undefined)
    obj.inputSchema = Object.freeze(raw.inputSchema as Record<string, unknown>);
  return Object.freeze(obj as unknown as McpTool);
}

function freezeResource(raw: Record<string, unknown>): McpResource {
  const obj: Record<string, unknown> = {
    uri: raw.uri as string,
    name: raw.name as string,
  };
  if (raw.description !== undefined) obj.description = raw.description;
  if (raw.mimeType !== undefined) obj.mimeType = raw.mimeType;
  return Object.freeze(obj as unknown as McpResource);
}

function freezePromptArg(a: Record<string, unknown>): McpPromptArgument {
  const obj: Record<string, unknown> = { name: a.name as string };
  if (a.description !== undefined) obj.description = a.description;
  if (a.required !== undefined) obj.required = a.required;
  return Object.freeze(obj as unknown as McpPromptArgument);
}

function freezePrompt(raw: Record<string, unknown>): McpPrompt {
  const args = raw.arguments as Array<Record<string, unknown>> | undefined;
  const obj: Record<string, unknown> = { name: raw.name as string };
  if (raw.description !== undefined) obj.description = raw.description;
  if (args !== undefined) obj.arguments = Object.freeze(args.map(freezePromptArg));
  return Object.freeze(obj as unknown as McpPrompt);
}

export class McpBridge {
  readonly name: string;
  private client: Client | undefined;
  private transport: Awaited<ReturnType<typeof createTransport>> | undefined;
  private connected = false;
  private readonly config;
  private exitHandler: (() => void) | undefined;
  private toolListChangedHandlers: Array<() => void> = [];
  private resourceListChangedHandlers: Array<() => void> = [];

  constructor(rawConfig: Readonly<Record<string, unknown>>) {
    this.config = parseMcpConfig(rawConfig);
    this.name = this.config.transport === "stdio" ? this.config.command : this.config.url;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<McpServerInfo> {
    if (this.connected) {
      return this.getServerInfo();
    }

    let transport: Awaited<ReturnType<typeof createTransport>>;
    try {
      transport = await createTransport(this.config);
    } catch (err) {
      throw new McpConnectionFailedError(
        this.name,
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? err : undefined,
      );
    }

    const client = new Client(
      { name: "templar-mcp", version: "0.0.0" },
      {
        listChanged: {
          tools: {
            onChanged: () => {
              for (const handler of this.toolListChangedHandlers) {
                handler();
              }
            },
          },
          resources: {
            onChanged: () => {
              for (const handler of this.resourceListChangedHandlers) {
                handler();
              }
            },
          },
        },
      },
    );

    try {
      // Cast needed: StreamableHTTPClientTransport.sessionId is `string | undefined`
      // but Transport declares it as `string`, conflicting under exactOptionalPropertyTypes.
      await client.connect(transport as Parameters<typeof client.connect>[0]);
    } catch (err) {
      throw new McpInitializationFailedError(
        this.name,
        err instanceof Error ? err.message : String(err),
        err instanceof Error ? err : undefined,
      );
    }

    this.client = client;
    this.transport = transport;
    this.connected = true;

    // Safety net: clean up on process exit
    this.exitHandler = () => {
      void this.disconnect();
    };
    process.on("exit", this.exitHandler);

    return this.getServerInfo();
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.connected = false;

    if (this.exitHandler) {
      process.removeListener("exit", this.exitHandler);
      this.exitHandler = undefined;
    }

    try {
      await this.client?.close();
    } catch {
      // Best-effort cleanup
    }

    this.client = undefined;
    this.transport = undefined;
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  async listTools(): Promise<readonly McpTool[]> {
    const client = this.requireConnected();
    try {
      const result = await client.listTools();
      return Object.freeze(result.tools.map((t: Record<string, unknown>) => freezeTool(t)));
    } catch (err) {
      throw this.wrapTransportError(err);
    }
  }

  async callTool(name: string, args?: Record<string, unknown>): Promise<McpToolResult> {
    const client = this.requireConnected();
    try {
      const result = await client.callTool({ name, arguments: args });
      const obj: Record<string, unknown> = {
        content: Object.freeze(
          (result.content as Array<Record<string, unknown>>).map(freezeContent),
        ),
      };
      if (result.isError !== undefined) obj.isError = result.isError;
      return Object.freeze(obj as unknown as McpToolResult);
    } catch (err) {
      if (err instanceof McpServerDisconnectedError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found") || message.includes("unknown tool")) {
        throw new McpToolNotFoundError(name);
      }
      throw new McpToolCallFailedError(name, message, err instanceof Error ? err : undefined);
    }
  }

  // ---------------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------------

  async listResources(): Promise<readonly McpResource[]> {
    const client = this.requireConnected();
    try {
      const result = await client.listResources();
      return Object.freeze(result.resources.map((r: Record<string, unknown>) => freezeResource(r)));
    } catch (err) {
      throw this.wrapTransportError(err);
    }
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    const client = this.requireConnected();
    try {
      const result = await client.readResource({ uri });
      return Object.freeze({
        uri,
        contents: Object.freeze(
          (result.contents as Array<Record<string, unknown>>).map(freezeContent),
        ),
      });
    } catch (err) {
      if (err instanceof McpServerDisconnectedError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("not found") || message.includes("unknown resource")) {
        throw new McpResourceNotFoundError(uri);
      }
      throw new McpResourceReadFailedError(uri, message, err instanceof Error ? err : undefined);
    }
  }

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

  async listPrompts(): Promise<readonly McpPrompt[]> {
    const client = this.requireConnected();
    try {
      const result = await client.listPrompts();
      return Object.freeze(result.prompts.map((p: Record<string, unknown>) => freezePrompt(p)));
    } catch (err) {
      throw this.wrapTransportError(err);
    }
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptResult> {
    const client = this.requireConnected();
    try {
      const result = await client.getPrompt({ name, arguments: args });
      const obj: Record<string, unknown> = {
        messages: Object.freeze(
          result.messages.map(
            (m: Record<string, unknown>): McpPromptMessage =>
              Object.freeze({
                role: m.role as "user" | "assistant",
                content: freezeContent(m.content as Record<string, unknown>),
              }),
          ),
        ),
      };
      if (result.description !== undefined) obj.description = result.description;
      return Object.freeze(obj as unknown as McpPromptResult);
    } catch (err) {
      throw this.wrapTransportError(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  onToolListChanged(handler: () => void): void {
    this.toolListChangedHandlers = [...this.toolListChangedHandlers, handler];
  }

  onResourceListChanged(handler: () => void): void {
    this.resourceListChangedHandlers = [...this.resourceListChangedHandlers, handler];
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private requireConnected(): Client {
    if (!this.connected || !this.client) {
      throw new McpServerDisconnectedError(this.name);
    }
    return this.client;
  }

  private getServerInfo(): McpServerInfo {
    const info = this.client?.getServerVersion();
    return Object.freeze({
      name: info?.name ?? "unknown",
      version: info?.version ?? "unknown",
      capabilities: Object.freeze({
        tools: this.client?.getServerCapabilities()?.tools !== undefined,
        resources: this.client?.getServerCapabilities()?.resources !== undefined,
        prompts: this.client?.getServerCapabilities()?.prompts !== undefined,
      }),
    });
  }

  private wrapTransportError(err: unknown): Error {
    if (err instanceof McpServerDisconnectedError) return err;
    return new McpTransportError(
      err instanceof Error ? err.message : String(err),
      err instanceof Error ? err : undefined,
    );
  }
}
