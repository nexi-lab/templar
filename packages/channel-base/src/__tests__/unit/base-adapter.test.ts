import type { InboundMessage } from "@templar/core";
import { ChannelSendError } from "@templar/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockChannelAdapter } from "../helpers/mock-adapter.js";

describe("BaseChannelAdapter", () => {
  let adapter: MockChannelAdapter;

  beforeEach(() => {
    adapter = new MockChannelAdapter();
  });

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  describe("constructor", () => {
    it("sets name from options", () => {
      const a = new MockChannelAdapter({ name: "test-channel" });
      expect(a.name).toBe("test-channel");
    });

    it("sets capabilities from options", () => {
      const caps = { text: { supported: true as const, maxLength: 2000 } };
      const a = new MockChannelAdapter({ capabilities: caps });
      expect(a.capabilities).toBe(caps);
    });

    it("starts in disconnected state", () => {
      expect(adapter.isConnected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // connect()
  // -------------------------------------------------------------------------

  describe("connect()", () => {
    it("calls doConnect()", async () => {
      await adapter.connect();
      expect(adapter.calls.filter((c) => c.method === "doConnect")).toHaveLength(1);
    });

    it("sets isConnected to true", async () => {
      await adapter.connect();
      expect(adapter.isConnected).toBe(true);
    });

    it("is idempotent — second call is a no-op", async () => {
      await adapter.connect();
      await adapter.connect();
      expect(adapter.calls.filter((c) => c.method === "doConnect")).toHaveLength(1);
    });

    it("propagates errors from doConnect()", async () => {
      const a = new MockChannelAdapter({
        doConnectImpl: async () => {
          throw new Error("connection failed");
        },
      });
      await expect(a.connect()).rejects.toThrow("connection failed");
      expect(a.isConnected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // disconnect()
  // -------------------------------------------------------------------------

  describe("disconnect()", () => {
    it("calls doDisconnect()", async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.calls.filter((c) => c.method === "doDisconnect")).toHaveLength(1);
    });

    it("sets isConnected to false", async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });

    it("is idempotent — second call is a no-op", async () => {
      await adapter.connect();
      await adapter.disconnect();
      await adapter.disconnect();
      expect(adapter.calls.filter((c) => c.method === "doDisconnect")).toHaveLength(1);
    });

    it("is safe to call before connect()", async () => {
      await adapter.disconnect(); // Should not throw
      expect(adapter.calls.filter((c) => c.method === "doDisconnect")).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // send()
  // -------------------------------------------------------------------------

  describe("send()", () => {
    it("throws ChannelSendError if not connected", async () => {
      await expect(
        adapter.send({ channelId: "ch-1", blocks: [{ type: "text", content: "hi" }] }),
      ).rejects.toThrow(ChannelSendError);
    });

    it("includes 'not connected' in error message", async () => {
      await expect(
        adapter.send({ channelId: "ch-1", blocks: [{ type: "text", content: "hi" }] }),
      ).rejects.toThrow(/not connected/i);
    });

    it("delegates to doSend() when connected", async () => {
      const renderer = vi.fn().mockResolvedValue(undefined);
      const a = new MockChannelAdapter({ renderer });
      await a.connect();

      const msg = { channelId: "ch-1", blocks: [{ type: "text" as const, content: "hello" }] };
      await a.send(msg);

      expect(renderer).toHaveBeenCalledWith(msg, expect.anything());
    });

    it("throws ChannelSendError after disconnect", async () => {
      await adapter.connect();
      await adapter.disconnect();
      await expect(
        adapter.send({ channelId: "ch-1", blocks: [{ type: "text", content: "hi" }] }),
      ).rejects.toThrow(ChannelSendError);
    });
  });

  // -------------------------------------------------------------------------
  // onMessage()
  // -------------------------------------------------------------------------

  describe("onMessage()", () => {
    it("calls registerListener with a callback", () => {
      adapter.onMessage(vi.fn());
      expect(adapter.calls.filter((c) => c.method === "registerListener")).toHaveLength(1);
    });

    it("calls handler with normalized inbound message", async () => {
      const inbound: InboundMessage = {
        channelType: "mock",
        channelId: "ch-1",
        senderId: "user-1",
        blocks: [{ type: "text", content: "hello" }],
        timestamp: Date.now(),
        messageId: "msg-1",
        raw: {},
      };

      const normalizer = vi.fn().mockReturnValue(inbound);
      const a = new MockChannelAdapter({ normalizer });

      const handler = vi.fn();
      a.onMessage(handler);

      a.simulateInbound({ rawEvent: true });

      // Allow async handler to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(normalizer).toHaveBeenCalledWith({ rawEvent: true });
      expect(handler).toHaveBeenCalledWith(inbound);
    });

    it("skips handler when normalizer returns undefined", async () => {
      const normalizer = vi.fn().mockReturnValue(undefined);
      const a = new MockChannelAdapter({ normalizer });

      const handler = vi.fn();
      a.onMessage(handler);

      a.simulateInbound({ rawEvent: true });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(normalizer).toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    });

    it("does not crash when normalizer throws", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const normalizer = vi.fn().mockImplementation(() => {
        throw new Error("normalizer error");
      });
      const a = new MockChannelAdapter({ normalizer });

      const handler = vi.fn();
      a.onMessage(handler);

      a.simulateInbound({ rawEvent: true });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("does not crash when handler throws", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const inbound: InboundMessage = {
        channelType: "mock",
        channelId: "ch-1",
        senderId: "user-1",
        blocks: [],
        timestamp: Date.now(),
        messageId: "msg-1",
        raw: {},
      };

      const a = new MockChannelAdapter({ normalizer: () => inbound });
      const handler = vi.fn().mockRejectedValue(new Error("handler error"));
      a.onMessage(handler);

      a.simulateInbound({});
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("handles async normalizer", async () => {
      const inbound: InboundMessage = {
        channelType: "mock",
        channelId: "ch-1",
        senderId: "user-1",
        blocks: [{ type: "text", content: "async" }],
        timestamp: Date.now(),
        messageId: "msg-1",
        raw: {},
      };

      const normalizer = vi.fn().mockResolvedValue(inbound);
      const a = new MockChannelAdapter({ normalizer });

      const handler = vi.fn();
      a.onMessage(handler);

      a.simulateInbound({});
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledWith(inbound);
    });
  });

  // -------------------------------------------------------------------------
  // isConnected
  // -------------------------------------------------------------------------

  describe("isConnected", () => {
    it("returns false initially", () => {
      expect(adapter.isConnected).toBe(false);
    });

    it("returns true after connect", async () => {
      await adapter.connect();
      expect(adapter.isConnected).toBe(true);
    });

    it("returns false after disconnect", async () => {
      await adapter.connect();
      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });
  });
});
