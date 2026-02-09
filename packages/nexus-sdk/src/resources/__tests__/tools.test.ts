import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../http/index.js";
import type { CreateToolParams, Tool } from "../../types/tools.js";
import { ToolsResource } from "../tools.js";

describe("ToolsResource", () => {
  describe("create", () => {
    it("should create tool with parameters", async () => {
      const mockTool: Tool = {
        id: "tool-123",
        name: "search",
        description: "Search tool",
        status: "active",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search query",
            required: true,
          },
        ],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockTool),
      } as unknown as HttpClient;

      const tools = new ToolsResource(mockHttp);

      const params: CreateToolParams = {
        name: "search",
        description: "Search tool",
        parameters: [
          {
            name: "query",
            type: "string",
            description: "Search query",
            required: true,
          },
        ],
      };

      const result = await tools.create(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/tools", {
        method: "POST",
        body: params,
      });

      expect(result).toEqual(mockTool);
    });
  });

  describe("get", () => {
    it("should get tool by ID", async () => {
      const mockTool: Tool = {
        id: "tool-123",
        name: "search",
        description: "Search tool",
        status: "active",
        parameters: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockTool),
      } as unknown as HttpClient;

      const tools = new ToolsResource(mockHttp);

      const result = await tools.get("tool-123");

      expect(mockHttp.request).toHaveBeenCalledWith("/tools/tool-123", {
        method: "GET",
      });

      expect(result).toEqual(mockTool);
    });
  });

  describe("update", () => {
    it("should update tool status", async () => {
      const mockTool: Tool = {
        id: "tool-123",
        name: "search",
        description: "Search tool",
        status: "deprecated",
        parameters: [],
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockTool),
      } as unknown as HttpClient;

      const tools = new ToolsResource(mockHttp);

      const result = await tools.update("tool-123", {
        status: "deprecated",
      });

      expect(mockHttp.request).toHaveBeenCalledWith("/tools/tool-123", {
        method: "PATCH",
        body: { status: "deprecated" },
      });

      expect(result).toEqual(mockTool);
    });
  });

  describe("delete", () => {
    it("should delete tool", async () => {
      const mockHttp = {
        request: vi.fn().mockResolvedValue(undefined),
      } as unknown as HttpClient;

      const tools = new ToolsResource(mockHttp);

      await tools.delete("tool-123");

      expect(mockHttp.request).toHaveBeenCalledWith("/tools/tool-123", {
        method: "DELETE",
      });
    });
  });

  describe("list", () => {
    it("should list tools with filters", async () => {
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

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as HttpClient;

      const tools = new ToolsResource(mockHttp);

      const params = {
        status: "active" as const,
        limit: 20,
      };

      const result = await tools.list(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/tools", {
        method: "GET",
        query: params,
      });

      expect(result).toEqual(mockResponse);
    });
  });
});
