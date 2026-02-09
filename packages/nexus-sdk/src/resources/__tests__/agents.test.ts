import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../http/index.js";
import type { Agent, CreateAgentParams } from "../../types/agents.js";
import { AgentsResource } from "../agents.js";

describe("AgentsResource", () => {
  describe("create", () => {
    it("should create agent with correct request", async () => {
      const mockAgent: Agent = {
        id: "agent-123",
        name: "test-agent",
        status: "active",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockAgent),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      const params: CreateAgentParams = {
        name: "test-agent",
        model: {
          provider: "openai",
          name: "gpt-4",
        },
      };

      const result = await agents.create(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/agents", {
        method: "POST",
        body: params,
      });

      expect(result).toEqual(mockAgent);
    });

    it("should create agent with minimal params", async () => {
      const mockAgent: Agent = {
        id: "agent-123",
        name: "test-agent",
        status: "active",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockAgent),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      const result = await agents.create({ name: "test-agent" });

      expect(result).toEqual(mockAgent);
    });
  });

  describe("get", () => {
    it("should get agent by ID", async () => {
      const mockAgent: Agent = {
        id: "agent-123",
        name: "test-agent",
        status: "active",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockAgent),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      const result = await agents.get("agent-123");

      expect(mockHttp.request).toHaveBeenCalledWith("/agents/agent-123", {
        method: "GET",
      });

      expect(result).toEqual(mockAgent);
    });
  });

  describe("update", () => {
    it("should update agent with correct request", async () => {
      const mockAgent: Agent = {
        id: "agent-123",
        name: "updated-agent",
        status: "inactive",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockAgent),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      const params = {
        name: "updated-agent",
        status: "inactive" as const,
      };

      const result = await agents.update("agent-123", params);

      expect(mockHttp.request).toHaveBeenCalledWith("/agents/agent-123", {
        method: "PATCH",
        body: params,
      });

      expect(result).toEqual(mockAgent);
    });
  });

  describe("delete", () => {
    it("should delete agent", async () => {
      const mockHttp = {
        request: vi.fn().mockResolvedValue(undefined),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      await agents.delete("agent-123");

      expect(mockHttp.request).toHaveBeenCalledWith("/agents/agent-123", {
        method: "DELETE",
      });
    });
  });

  describe("list", () => {
    it("should list agents without params", async () => {
      const mockResponse = {
        data: [
          {
            id: "agent-1",
            name: "agent-1",
            status: "active",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        ],
        hasMore: false,
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      const result = await agents.list();

      expect(mockHttp.request).toHaveBeenCalledWith("/agents", {
        method: "GET",
        query: undefined,
      });

      expect(result).toEqual(mockResponse);
    });

    it("should list agents with pagination params", async () => {
      const mockResponse = {
        data: [],
        nextCursor: "cursor-123",
        hasMore: true,
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      const params = {
        limit: 10,
        cursor: "cursor-abc",
        status: "active" as const,
      };

      const result = await agents.list(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/agents", {
        method: "GET",
        query: params,
      });

      expect(result).toEqual(mockResponse);
    });

    it("should list agents with search query", async () => {
      const mockResponse = {
        data: [],
        hasMore: false,
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as HttpClient;

      const agents = new AgentsResource(mockHttp);

      await agents.list({ query: "search term" });

      expect(mockHttp.request).toHaveBeenCalledWith("/agents", {
        method: "GET",
        query: { query: "search term" },
      });
    });
  });
});
