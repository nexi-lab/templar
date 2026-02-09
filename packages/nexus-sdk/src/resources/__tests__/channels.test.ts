import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../http/index.js";
import type { Channel, CreateChannelParams } from "../../types/channels.js";
import { ChannelsResource } from "../channels.js";

describe("ChannelsResource", () => {
  describe("create", () => {
    it("should create channel with config", async () => {
      const mockChannel: Channel = {
        id: "channel-123",
        name: "slack-channel",
        type: "slack",
        status: "active",
        config: {
          token: "xoxb-test",
          channelId: "C123",
        },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockChannel),
      } as unknown as HttpClient;

      const channels = new ChannelsResource(mockHttp);

      const params: CreateChannelParams = {
        name: "slack-channel",
        type: "slack",
        config: {
          token: "xoxb-test",
          channelId: "C123",
        },
      };

      const result = await channels.create(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/channels", {
        method: "POST",
        body: params,
      });

      expect(result).toEqual(mockChannel);
    });

    it("should create channel with metadata", async () => {
      const mockChannel: Channel = {
        id: "channel-123",
        name: "webhook",
        type: "webhook",
        status: "active",
        config: { url: "https://example.com" },
        metadata: { environment: "production" },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockChannel),
      } as unknown as HttpClient;

      const channels = new ChannelsResource(mockHttp);

      const params: CreateChannelParams = {
        name: "webhook",
        type: "webhook",
        config: { url: "https://example.com" },
        metadata: { environment: "production" },
      };

      await channels.create(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/channels", {
        method: "POST",
        body: params,
      });
    });
  });

  describe("get", () => {
    it("should get channel by ID", async () => {
      const mockChannel: Channel = {
        id: "channel-123",
        name: "test-channel",
        type: "slack",
        status: "active",
        config: {},
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockChannel),
      } as unknown as HttpClient;

      const channels = new ChannelsResource(mockHttp);

      const result = await channels.get("channel-123");

      expect(mockHttp.request).toHaveBeenCalledWith("/channels/channel-123", {
        method: "GET",
      });

      expect(result).toEqual(mockChannel);
    });
  });

  describe("update", () => {
    it("should update channel config", async () => {
      const mockChannel: Channel = {
        id: "channel-123",
        name: "test-channel",
        type: "slack",
        status: "active",
        config: { token: "new-token" },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-02T00:00:00Z",
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockChannel),
      } as unknown as HttpClient;

      const channels = new ChannelsResource(mockHttp);

      const result = await channels.update("channel-123", {
        config: { token: "new-token" },
      });

      expect(mockHttp.request).toHaveBeenCalledWith("/channels/channel-123", {
        method: "PATCH",
        body: { config: { token: "new-token" } },
      });

      expect(result).toEqual(mockChannel);
    });
  });

  describe("delete", () => {
    it("should delete channel", async () => {
      const mockHttp = {
        request: vi.fn().mockResolvedValue(undefined),
      } as unknown as HttpClient;

      const channels = new ChannelsResource(mockHttp);

      await channels.delete("channel-123");

      expect(mockHttp.request).toHaveBeenCalledWith("/channels/channel-123", {
        method: "DELETE",
      });
    });
  });

  describe("list", () => {
    it("should list channels by type", async () => {
      const mockResponse = {
        data: [
          {
            id: "channel-1",
            name: "slack-1",
            type: "slack",
            status: "active",
            config: {},
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
          },
        ],
        hasMore: false,
      };

      const mockHttp = {
        request: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as HttpClient;

      const channels = new ChannelsResource(mockHttp);

      const params = {
        type: "slack" as const,
        status: "active" as const,
      };

      const result = await channels.list(params);

      expect(mockHttp.request).toHaveBeenCalledWith("/channels", {
        method: "GET",
        query: params,
      });

      expect(result).toEqual(mockResponse);
    });
  });
});
