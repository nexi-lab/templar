import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../client.js";
import { AgentsResource } from "../resources/agents.js";
import { ChannelsResource } from "../resources/channels.js";
import { MemoryResource } from "../resources/memory.js";
import { ToolsResource } from "../resources/tools.js";

describe("NexusClient", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("initialization", () => {
    it("should create client with default config", () => {
      const client = new NexusClient({});

      expect(client).toBeDefined();
      expect(client.agents).toBeInstanceOf(AgentsResource);
      expect(client.tools).toBeInstanceOf(ToolsResource);
      expect(client.channels).toBeInstanceOf(ChannelsResource);
      expect(client.memory).toBeInstanceOf(MemoryResource);
    });

    it("should create client with API key", () => {
      const client = new NexusClient({
        apiKey: "test-key",
      });

      expect(client).toBeDefined();
    });

    it("should create client with custom base URL", () => {
      const client = new NexusClient({
        baseUrl: "https://custom.api.com",
      });

      expect(client).toBeDefined();
    });

    it("should create client with timeout", () => {
      const client = new NexusClient({
        timeout: 5000,
      });

      expect(client).toBeDefined();
    });

    it("should create client with retry options", () => {
      const client = new NexusClient({
        retry: {
          maxAttempts: 5,
          initialDelay: 2000,
        },
      });

      expect(client).toBeDefined();
    });

    it("should create client with custom headers", () => {
      const client = new NexusClient({
        headers: {
          "X-Custom-Header": "value",
        },
      });

      expect(client).toBeDefined();
    });
  });

  describe("builder methods", () => {
    it("should return new instance from withRetry", () => {
      const client = new NexusClient({ apiKey: "test-key" });
      const updatedClient = client.withRetry({ maxAttempts: 5 });

      expect(updatedClient).not.toBe(client);
      expect(updatedClient).toBeInstanceOf(NexusClient);
      expect(updatedClient.agents).toBeInstanceOf(AgentsResource);
      expect(updatedClient.memory).toBeInstanceOf(MemoryResource);
    });

    it("should return new instance from withTimeout", () => {
      const client = new NexusClient({ apiKey: "test-key" });
      const updatedClient = client.withTimeout(10000);

      expect(updatedClient).not.toBe(client);
      expect(updatedClient).toBeInstanceOf(NexusClient);
    });

    it("should support method chaining", () => {
      const original = new NexusClient({ apiKey: "test-key" });
      const chained = original.withRetry({ maxAttempts: 5 }).withTimeout(10000);

      expect(chained).toBeDefined();
      expect(chained).toBeInstanceOf(NexusClient);
      expect(chained).not.toBe(original);
    });
  });

  describe("integration tests", () => {
    it("should make successful agent creation request", async () => {
      const mockAgent = {
        id: "agent-123",
        name: "test-agent",
        status: "active",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockAgent), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const client = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
      });

      const result = await client.agents.create({
        name: "test-agent",
      });

      expect(result).toEqual(mockAgent);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/agents",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-key",
          }),
        }),
      );
    });

    it("should make successful tool list request", async () => {
      const mockResponse = {
        data: [
          {
            id: "tool-1",
            name: "search",
            description: "Search tool",
            status: "active",
            parameters: [],
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        ],
        hasMore: false,
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
        }),
      );

      const client = new NexusClient({
        baseUrl: "https://api.test.com",
      });

      const result = await client.tools.list({ limit: 10 });

      expect(result).toEqual(mockResponse);
    });

    it("should handle API errors correctly", async () => {
      const errorResponse = {
        code: "INVALID_REQUEST",
        message: "Invalid request",
      };

      global.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(errorResponse), {
          status: 400,
        }),
      );

      const client = new NexusClient({
        baseUrl: "https://api.test.com",
      });

      await expect(client.agents.get("invalid-id")).rejects.toThrow("Invalid request");
    });

    it("should retry on 5xx errors", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(new Response(null, { status: 503 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "channel-123",
              name: "test",
              type: "slack",
              status: "active",
              config: {},
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            }),
            { status: 200 },
          ),
        );
      });

      const client = new NexusClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 3, initialDelay: 10 },
      });

      const result = await client.channels.get("channel-123");

      expect(result.id).toBe("channel-123");
      expect(attempts).toBe(3);
    });

    it("should respect updated retry settings from withRetry", async () => {
      let attempts = 0;
      global.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 5) {
          return Promise.resolve(new Response(null, { status: 503 }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "agent-123",
              name: "test",
              status: "active",
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            }),
            { status: 200 },
          ),
        );
      });

      const client = new NexusClient({
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 2 },
      }).withRetry({ maxAttempts: 5, initialDelay: 10 });

      const result = await client.agents.get("agent-123");

      expect(result.id).toBe("agent-123");
      expect(attempts).toBe(5);
    });
  });

  describe("resource access", () => {
    it("should provide access to agents resource", () => {
      const client = new NexusClient({});
      expect(client.agents).toBeInstanceOf(AgentsResource);
    });

    it("should provide access to tools resource", () => {
      const client = new NexusClient({});
      expect(client.tools).toBeInstanceOf(ToolsResource);
    });

    it("should provide access to channels resource", () => {
      const client = new NexusClient({});
      expect(client.channels).toBeInstanceOf(ChannelsResource);
    });

    it("should provide access to memory resource", () => {
      const client = new NexusClient({});
      expect(client.memory).toBeInstanceOf(MemoryResource);
    });
  });
});
