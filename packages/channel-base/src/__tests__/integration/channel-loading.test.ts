import type { ChannelCapabilities, OutboundMessage } from "@templar/core";
import {
  CapabilityNotSupportedError,
  ChannelLoadError,
  ChannelNotFoundError,
} from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { CapabilityGuard } from "../../capability-guard.js";
import { ChannelRegistry } from "../../channel-registry.js";
import { isChannelAdapter } from "../../type-guards.js";
import { MockChannelAdapter } from "../helpers/mock-channel.js";

/** Minimal text-only capabilities */
const TEXT_CAPS: ChannelCapabilities = { text: { supported: true, maxLength: 4000 } };

describe("Channel Loading Integration", () => {
  describe("full load flow", () => {
    it("should successfully load and connect a channel end-to-end", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter = new MockChannelAdapter("slack", {
        text: true,
        images: true,
        threads: true,
      });

      registry.register(
        "slack",
        async () => ({
          default: class SlackAdapter {
            name = mockAdapter.name;
            capabilities = mockAdapter.capabilities;
            connect = mockAdapter.connect;
            disconnect = mockAdapter.disconnect;
            send = mockAdapter.send;
            onMessage = mockAdapter.onMessage;
          },
        }),
        {
          text: { supported: true, maxLength: 4000 },
          images: { supported: true, maxSize: 10_000_000, formats: ["png", "jpg"] },
          threads: { supported: true, nested: false },
        },
      );

      const adapter = await registry.load("slack", { token: "xoxb-test" });

      expect(isChannelAdapter(adapter)).toBe(true);

      await adapter.connect();
      await adapter.send({
        channelId: "C123",
        blocks: [{ type: "text", content: "Hello" }],
      });

      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(mockAdapter.send).toHaveBeenCalledWith({
        channelId: "C123",
        blocks: [{ type: "text", content: "Hello" }],
      });
    });

    it("should load multiple channels in parallel", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "slack",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter("slack");
            }
          },
        }),
        TEXT_CAPS,
      );

      registry.register(
        "discord",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter("discord");
            }
          },
        }),
        TEXT_CAPS,
      );

      registry.register(
        "teams",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter("teams");
            }
          },
        }),
        TEXT_CAPS,
      );

      const [slack, discord, teams] = await Promise.all([
        registry.load("slack", { token: "slack-token" }),
        registry.load("discord", { token: "discord-token" }),
        registry.load("teams", { token: "teams-token" }),
      ]);

      expect(slack.name).toBe("slack");
      expect(discord.name).toBe("discord");
      expect(teams.name).toBe("teams");
    });

    it("should handle adapter configuration correctly", async () => {
      const registry = new ChannelRegistry();
      // biome-ignore lint/suspicious/noExplicitAny: Test helper variable
      let receivedConfig: any;

      registry.register(
        "custom",
        async () => ({
          default: class {
            // biome-ignore lint/suspicious/noExplicitAny: Test mock constructor
            constructor(config: any) {
              receivedConfig = config;
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter("custom");
            }
          },
        }),
        TEXT_CAPS,
      );

      const config = {
        apiKey: "secret-key",
        baseUrl: "https://api.example.com",
        timeout: 5000,
      };

      await registry.load("custom", config);

      expect(receivedConfig).toEqual(config);
    });
  });

  describe("concurrent load deduplication", () => {
    it("should deduplicate concurrent loads of same channel", async () => {
      const registry = new ChannelRegistry();
      let loadCount = 0;

      registry.register(
        "concurrent-test",
        async () => {
          loadCount++;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            default: class {
              constructor() {
                // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
                return new MockChannelAdapter();
              }
            },
          };
        },
        TEXT_CAPS,
      );

      const promises = Array.from({ length: 5 }, () => registry.load("concurrent-test", {}));
      const adapters = await Promise.all(promises);

      expect(loadCount).toBe(1);

      const firstAdapter = adapters[0];
      for (const adapter of adapters) {
        expect(adapter).toBe(firstAdapter);
      }
    });

    it("should handle mix of sequential and concurrent loads", async () => {
      const registry = new ChannelRegistry();
      const loadTimes: number[] = [];

      registry.register(
        "mixed",
        async () => {
          loadTimes.push(Date.now());
          await new Promise((resolve) => setTimeout(resolve, 20));
          return {
            default: class {
              constructor() {
                // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
                return new MockChannelAdapter();
              }
            },
          };
        },
        TEXT_CAPS,
      );

      await Promise.all([registry.load("mixed", {}), registry.load("mixed", {})]);
      await Promise.all([registry.load("mixed", {}), registry.load("mixed", {})]);

      expect(loadTimes).toHaveLength(1);
    });
  });

  describe("error paths", () => {
    it("should throw helpful error for unregistered channel type", async () => {
      const registry = new ChannelRegistry();

      try {
        await registry.load("nonexistent", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChannelNotFoundError);
        if (error instanceof ChannelNotFoundError) {
          expect(error.message).toContain("nonexistent");
          expect(error.message).toContain("@templar/channel-nonexistent");
          expect(error.message).toMatch(/install/i);
        }
      }
    });

    it("should provide detailed error when adapter is invalid", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "broken-adapter",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return {
                name: "broken",
                capabilities: {},
              };
            }
          },
        }),
        TEXT_CAPS,
      );

      try {
        await registry.load("broken-adapter", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChannelLoadError);
        if (error instanceof ChannelLoadError) {
          expect(error.message).toContain("broken-adapter");
          expect(error.message).toContain("Invalid adapter");
          expect(error.message).toMatch(/missing required methods/i);
        }
      }
    });

    it("should handle import failure with helpful message", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "import-fails",
        async () => {
          throw new Error("Cannot find module '@templar/channel-import-fails'");
        },
        TEXT_CAPS,
      );

      try {
        await registry.load("import-fails", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChannelLoadError);
        if (error instanceof ChannelLoadError) {
          expect(error.message).toContain("import-fails");
          expect(error.message).toContain("Import failed");
          expect(error.message).toContain("@templar/channel-import-fails");
        }
      }
    });

    it("should handle constructor errors with context", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "bad-config",
        async () => ({
          default: class {
            // biome-ignore lint/suspicious/noExplicitAny: Test mock constructor
            constructor(config: any) {
              if (!config.apiKey) {
                throw new Error("Missing required config: apiKey");
              }
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter();
            }
          },
        }),
        TEXT_CAPS,
      );

      try {
        await registry.load("bad-config", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChannelLoadError);
        if (error instanceof ChannelLoadError) {
          expect(error.message).toContain("bad-config");
          expect(error.message).toContain("Failed to instantiate");
          expect(error.message).toContain("Missing required config: apiKey");
          expect(error.cause).toBeInstanceOf(Error);
        }
      }
    });

    it("should allow retry after failed load", async () => {
      const registry = new ChannelRegistry();
      let attempt = 0;

      registry.register(
        "retry-test",
        async () => {
          attempt++;
          if (attempt === 1) {
            throw new Error("First attempt fails");
          }
          return {
            default: class {
              constructor() {
                // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
                return new MockChannelAdapter();
              }
            },
          };
        },
        TEXT_CAPS,
      );

      await expect(registry.load("retry-test", {})).rejects.toThrow();

      const adapter = await registry.load("retry-test", {});
      expect(adapter).toBeDefined();
      expect(attempt).toBe(2);
    });
  });

  describe("cleanup lifecycle", () => {
    it("should disconnect all channels on clear", async () => {
      const registry = new ChannelRegistry();
      const adapters: MockChannelAdapter[] = [];

      for (let i = 1; i <= 3; i++) {
        const mock = new MockChannelAdapter(`channel-${i}`);
        adapters.push(mock);

        registry.register(
          `channel${i}`,
          async () => ({
            default: class {
              constructor() {
                // biome-ignore lint/correctness/noConstructorReturn: Test pattern
                return mock;
              }
            },
          }),
          TEXT_CAPS,
        );

        await registry.load(`channel${i}`, {});
      }

      await registry.clear();

      for (const adapter of adapters) {
        expect(adapter.disconnect).toHaveBeenCalled();
      }
    });

    it("should handle partial cleanup on disconnect errors", async () => {
      const registry = new ChannelRegistry();
      const goodAdapter = new MockChannelAdapter("good");
      const badAdapter = new MockChannelAdapter("bad");

      // biome-ignore lint/suspicious/noExplicitAny: Mock method access
      (badAdapter.disconnect as any).mockRejectedValue(new Error("Disconnect failed"));

      registry.register(
        "good",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return goodAdapter;
            }
          },
        }),
        TEXT_CAPS,
      );

      registry.register(
        "bad",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return badAdapter;
            }
          },
        }),
        TEXT_CAPS,
      );

      await registry.load("good", {});
      await registry.load("bad", {});

      await expect(registry.clear()).resolves.toBeUndefined();

      expect(goodAdapter.disconnect).toHaveBeenCalled();
      expect(badAdapter.disconnect).toHaveBeenCalled();
    });

    it("should allow loading after clear", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "test",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter();
            }
          },
        }),
        TEXT_CAPS,
      );

      await registry.load("test", {});
      await registry.clear();
      const adapter = await registry.load("test", {});

      expect(adapter).toBeDefined();
    });
  });

  describe("registry queries", () => {
    it("should check if channel type is registered", () => {
      const registry = new ChannelRegistry();
      registry.register("slack", vi.fn(), TEXT_CAPS);

      expect(registry.has("slack")).toBe(true);
      expect(registry.has("discord")).toBe(false);
    });

    it("should list all registered channel types", () => {
      const registry = new ChannelRegistry();
      registry.register("slack", vi.fn(), TEXT_CAPS);
      registry.register("discord", vi.fn(), TEXT_CAPS);
      registry.register("teams", vi.fn(), TEXT_CAPS);

      const types = registry.getRegisteredTypes();

      expect(types).toHaveLength(3);
      expect(types).toContain("slack");
      expect(types).toContain("discord");
      expect(types).toContain("teams");
    });
  });

  describe("guarded message flow", () => {
    it("should pass supported content through to adapter", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter = new MockChannelAdapter("slack", {
        text: true,
        images: true,
      });

      registry.register(
        "slack",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return mockAdapter;
            }
          },
        }),
        {
          text: { supported: true, maxLength: 4000 },
          images: { supported: true, maxSize: 10_000_000, formats: ["png", "jpg"] },
        },
      );

      const adapter = await registry.load("slack", {});
      const message: OutboundMessage = {
        channelId: "C123",
        blocks: [
          { type: "text", content: "Check this image" },
          { type: "image", url: "https://example.com/img.png" },
        ],
      };

      await adapter.send(message);
      expect(mockAdapter.send).toHaveBeenCalledWith(message);
    });

    it("should reject unsupported content with CapabilityNotSupportedError", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "sms",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return new MockChannelAdapter("sms");
            }
          },
        }),
        { text: { supported: true, maxLength: 160 } },
      );

      const adapter = await registry.load("sms", {});
      const message: OutboundMessage = {
        channelId: "C123",
        blocks: [{ type: "image", url: "https://example.com/img.png" }],
      };

      await expect(adapter.send(message)).rejects.toThrow(CapabilityNotSupportedError);
      await expect(adapter.send(message)).rejects.toThrow("does not support 'image' content");
    });

    it("should reject on first unsupported block in mixed message", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "sms",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return new MockChannelAdapter("sms");
            }
          },
        }),
        { text: { supported: true, maxLength: 160 } },
      );

      const adapter = await registry.load("sms", {});
      const message: OutboundMessage = {
        channelId: "C123",
        blocks: [
          { type: "text", content: "Hello" },
          { type: "image", url: "https://example.com/img.png" },
        ],
      };

      await expect(adapter.send(message)).rejects.toThrow("does not support 'image' content");
    });

    it("should wrap loaded adapters in CapabilityGuard", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "test",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return new MockChannelAdapter("test");
            }
          },
        }),
        TEXT_CAPS,
      );

      const adapter = await registry.load("test", {});
      expect(adapter).toBeInstanceOf(CapabilityGuard);
    });
  });
});
