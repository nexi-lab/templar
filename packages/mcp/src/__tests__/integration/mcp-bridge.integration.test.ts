import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpServerDisconnectedError } from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { McpBridge } from "../../bridge/mcp-bridge.js";
import { parseMcpConfig } from "../../config/config.js";

/**
 * Integration tests that use an in-process MCP server via InMemoryTransport.
 * These test the full round-trip: McpBridge → SDK Client → InMemoryTransport → MCP Server.
 *
 * Because McpBridge constructs its own Client internally, we use a workaround:
 * We create a Client + Server pair connected via InMemoryTransport, then test
 * the same SDK interactions that McpBridge performs.
 */

describe("MCP Bridge Integration (via SDK Client + InMemoryTransport)", () => {
  let server: McpServer;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    server = new McpServer({ name: "test-server", version: "1.0.0" });

    // Register test tools
    server.tool("echo", "Echo input back", { message: z.string() }, async ({ message }) => ({
      content: [{ type: "text", text: `Echo: ${message}` }],
    }));

    server.tool("add", "Add two numbers", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
      content: [{ type: "text", text: String(a + b) }],
    }));

    server.tool("fail", "Always fails", async () => ({
      content: [{ type: "text", text: "Something went wrong" }],
      isError: true,
    }));

    // Register test resources
    server.resource("readme", "file:///README.md", async () => ({
      contents: [{ uri: "file:///README.md", text: "# Test Project" }],
    }));

    server.resource("config", "file:///config.json", async () => ({
      contents: [{ uri: "file:///config.json", text: '{"port": 3000}' }],
    }));

    // Register test prompts
    server.prompt("greet", "Generate a greeting", { name: z.string() }, async ({ name }) => ({
      messages: [
        { role: "user", content: { type: "text", text: `Say hello to ${name}` } },
        { role: "assistant", content: { type: "text", text: `Hello, ${name}!` } },
      ],
    }));

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  describe("tools", () => {
    it("lists available tools", async () => {
      const result = await client.listTools();
      expect(result.tools.length).toBe(3);
      const names = result.tools.map((t) => t.name);
      expect(names).toContain("echo");
      expect(names).toContain("add");
      expect(names).toContain("fail");
    });

    it("calls a tool with arguments", async () => {
      const result = await client.callTool({
        name: "echo",
        arguments: { message: "Hello MCP" },
      });
      expect(result.content).toEqual([{ type: "text", text: "Echo: Hello MCP" }]);
    });

    it("calls a tool with numeric arguments", async () => {
      const result = await client.callTool({
        name: "add",
        arguments: { a: 2, b: 3 },
      });
      expect(result.content).toEqual([{ type: "text", text: "5" }]);
    });

    it("handles tool that returns isError", async () => {
      const result = await client.callTool({ name: "fail" });
      expect(result.isError).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  describe("resources", () => {
    it("lists available resources", async () => {
      const result = await client.listResources();
      expect(result.resources.length).toBe(2);
      const uris = result.resources.map((r) => r.uri);
      expect(uris).toContain("file:///README.md");
      expect(uris).toContain("file:///config.json");
    });

    it("reads a resource", async () => {
      const result = await client.readResource({ uri: "file:///README.md" });
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: "file:///README.md",
        text: "# Test Project",
      });
    });

    it("reads JSON resource", async () => {
      const result = await client.readResource({
        uri: "file:///config.json",
      });
      expect(result.contents[0]).toMatchObject({
        text: '{"port": 3000}',
      });
    });
  });

  // -------------------------------------------------------------------------
  // Prompts
  // -------------------------------------------------------------------------

  describe("prompts", () => {
    it("lists available prompts", async () => {
      const result = await client.listPrompts();
      expect(result.prompts.length).toBe(1);
      expect(result.prompts[0]?.name).toBe("greet");
    });

    it("gets a prompt with arguments", async () => {
      const result = await client.getPrompt({
        name: "greet",
        arguments: { name: "Alice" },
      });
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]?.role).toBe("user");
      expect(result.messages[1]?.role).toBe("assistant");
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("lifecycle", () => {
    it("server info is available after connect", () => {
      const info = client.getServerVersion();
      expect(info?.name).toBe("test-server");
      expect(info?.version).toBe("1.0.0");
    });

    it("server capabilities include tools and resources", () => {
      const caps = client.getServerCapabilities();
      expect(caps?.tools).toBeDefined();
      expect(caps?.resources).toBeDefined();
      expect(caps?.prompts).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Concurrent calls
  // -------------------------------------------------------------------------

  describe("concurrency", () => {
    it("handles concurrent tool calls", async () => {
      const results = await Promise.all([
        client.callTool({ name: "echo", arguments: { message: "one" } }),
        client.callTool({ name: "echo", arguments: { message: "two" } }),
        client.callTool({ name: "echo", arguments: { message: "three" } }),
      ]);
      const texts = results.map((r) => (r.content as Array<{ text: string }>)[0]?.text);
      expect(texts).toContain("Echo: one");
      expect(texts).toContain("Echo: two");
      expect(texts).toContain("Echo: three");
    });
  });
});

// -------------------------------------------------------------------------
// McpBridge unit tests using mocked transport
// -------------------------------------------------------------------------

describe("McpBridge lifecycle", () => {
  it("constructs with stdio config", () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    expect(bridge.name).toBe("echo");
    expect(bridge.isConnected()).toBe(false);
  });

  it("constructs with http config", () => {
    const bridge = new McpBridge({
      transport: "http",
      url: "https://example.com/mcp",
    });
    expect(bridge.name).toBe("https://example.com/mcp");
    expect(bridge.isConnected()).toBe(false);
  });

  it("throws McpServerDisconnectedError when calling listTools while disconnected", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await expect(bridge.listTools()).rejects.toThrow(McpServerDisconnectedError);
  });

  it("throws McpServerDisconnectedError when calling callTool while disconnected", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await expect(bridge.callTool("test")).rejects.toThrow(McpServerDisconnectedError);
  });

  it("throws McpServerDisconnectedError when calling listResources while disconnected", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await expect(bridge.listResources()).rejects.toThrow(McpServerDisconnectedError);
  });

  it("throws McpServerDisconnectedError when calling readResource while disconnected", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await expect(bridge.readResource("file:///test")).rejects.toThrow(McpServerDisconnectedError);
  });

  it("throws McpServerDisconnectedError when calling listPrompts while disconnected", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await expect(bridge.listPrompts()).rejects.toThrow(McpServerDisconnectedError);
  });

  it("throws McpServerDisconnectedError when calling getPrompt while disconnected", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await expect(bridge.getPrompt("test")).rejects.toThrow(McpServerDisconnectedError);
  });

  it("disconnect is idempotent", async () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    await bridge.disconnect();
    await bridge.disconnect();
    // Should not throw
  });

  it("registers event handlers", () => {
    const bridge = new McpBridge({
      transport: "stdio",
      command: "echo",
    });
    // Should not throw
    bridge.onToolListChanged(() => {});
    bridge.onResourceListChanged(() => {});
  });
});

describe("parseMcpConfig integration", () => {
  it("roundtrips valid stdio config", () => {
    const config = parseMcpConfig({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
    });
    expect(config.transport).toBe("stdio");
    if (config.transport === "stdio") {
      expect(config.command).toBe("node");
      expect(config.args).toEqual(["server.js"]);
    }
  });

  it("roundtrips valid http config", () => {
    const config = parseMcpConfig({
      transport: "http",
      url: "https://example.com",
    });
    expect(config.transport).toBe("http");
    if (config.transport === "http") {
      expect(config.url).toBe("https://example.com");
    }
  });
});
