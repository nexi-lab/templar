import { describe, expect, it, vi } from "vitest";
import { ChannelLoadError, ChannelNotFoundError } from "@templar/errors";
import { MockChannelAdapter } from "../helpers/mock-channel.js";
import { ChannelRegistry } from "../../channel-registry.js";
import { isChannelAdapter } from "../../type-guards.js";

describe("Channel Loading Integration", () => {
  describe("full load flow", () => {
    it("should successfully load and connect a channel end-to-end", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter = new MockChannelAdapter("slack");

      // Simulate @templar/channel-slack package structure
      registry.register("slack", async () => ({
        default: class SlackAdapter {
          name = "slack";
          capabilities = mockAdapter.capabilities;
          connect = mockAdapter.connect;
          disconnect = mockAdapter.disconnect;
          send = mockAdapter.send;
          onMessage = mockAdapter.onMessage;
        },
      }));

      // Load channel
      const adapter = await registry.load("slack", { token: "xoxb-test" });

      // Verify it's a valid adapter
      expect(isChannelAdapter(adapter)).toBe(true);

      // Connect and use
      await adapter.connect();
      await adapter.send({ content: "Hello", channelId: "C123" });

      expect(mockAdapter.connect).toHaveBeenCalled();
      expect(mockAdapter.send).toHaveBeenCalledWith({
        content: "Hello",
        channelId: "C123",
      });
    });

    it("should load multiple channels in parallel", async () => {
      const registry = new ChannelRegistry();

      registry.register("slack", async () => ({
        default: class {
          constructor() {
            return new MockChannelAdapter("slack");
          }
        },
      }));

      registry.register("discord", async () => ({
        default: class {
          constructor() {
            return new MockChannelAdapter("discord");
          }
        },
      }));

      registry.register("teams", async () => ({
        default: class {
          constructor() {
            return new MockChannelAdapter("teams");
          }
        },
      }));

      // Load all channels in parallel
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
      let receivedConfig: any;

      registry.register("custom", async () => ({
        default: class {
          constructor(config: any) {
            receivedConfig = config;
            return new MockChannelAdapter("custom");
          }
        },
      }));

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

      registry.register("concurrent-test", async () => {
        loadCount++;
        // Simulate slow load
        await new Promise(resolve => setTimeout(resolve, 50));
        return {
          default: class {
            constructor() {
              return new MockChannelAdapter();
            }
          },
        };
      });

      // Start 5 concurrent loads
      const promises = Array.from({ length: 5 }, () =>
        registry.load("concurrent-test", {}),
      );

      const adapters = await Promise.all(promises);

      // Should only load once
      expect(loadCount).toBe(1);

      // All should get same instance
      const firstAdapter = adapters[0];
      for (const adapter of adapters) {
        expect(adapter).toBe(firstAdapter);
      }
    });

    it("should handle mix of sequential and concurrent loads", async () => {
      const registry = new ChannelRegistry();
      const loadTimes: number[] = [];

      registry.register("mixed", async () => {
        loadTimes.push(Date.now());
        await new Promise(resolve => setTimeout(resolve, 20));
        return {
          default: class {
            constructor() {
              return new MockChannelAdapter();
            }
          },
        };
      });

      // First batch (concurrent)
      await Promise.all([
        registry.load("mixed", {}),
        registry.load("mixed", {}),
      ]);

      // Second batch (concurrent, but after first batch)
      await Promise.all([
        registry.load("mixed", {}),
        registry.load("mixed", {}),
      ]);

      // Should only load once total (cached after first batch)
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

      registry.register("broken-adapter", async () => ({
        default: class {
          constructor() {
            // Return object missing required methods
            return {
              name: "broken",
              capabilities: {},
              // Missing: connect, disconnect, send, onMessage
            };
          }
        },
      }));

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

      registry.register("import-fails", async () => {
        throw new Error("Cannot find module '@templar/channel-import-fails'");
      });

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

      registry.register("bad-config", async () => ({
        default: class {
          constructor(config: any) {
            if (!config.apiKey) {
              throw new Error("Missing required config: apiKey");
            }
            return new MockChannelAdapter();
          }
        },
      }));

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

      registry.register("retry-test", async () => {
        attempt++;
        if (attempt === 1) {
          throw new Error("First attempt fails");
        }
        return {
          default: class {
            constructor() {
              return new MockChannelAdapter();
            }
          },
        };
      });

      // First attempt fails
      await expect(registry.load("retry-test", {})).rejects.toThrow();

      // Second attempt succeeds
      const adapter = await registry.load("retry-test", {});
      expect(adapter).toBeDefined();
      expect(attempt).toBe(2);
    });
  });

  describe("cleanup lifecycle", () => {
    it("should disconnect all channels on clear", async () => {
      const registry = new ChannelRegistry();
      const adapters: MockChannelAdapter[] = [];

      // Register and load 3 channels
      for (let i = 1; i <= 3; i++) {
        const mock = new MockChannelAdapter(`channel-${i}`);
        adapters.push(mock);

        registry.register(`channel${i}`, async () => ({
          default: class {
            constructor() {
              return mock;
            }
          },
        }));

        await registry.load(`channel${i}`, {});
      }

      // Clear registry
      await registry.clear();

      // All adapters should be disconnected
      for (const adapter of adapters) {
        expect(adapter.disconnect).toHaveBeenCalled();
      }
    });

    it("should handle partial cleanup on disconnect errors", async () => {
      const registry = new ChannelRegistry();
      const goodAdapter = new MockChannelAdapter("good");
      const badAdapter = new MockChannelAdapter("bad");

      // Bad adapter throws on disconnect
      (badAdapter.disconnect as any).mockRejectedValue(new Error("Disconnect failed"));

      registry.register("good", async () => ({
        default: class {
          constructor() {
            return goodAdapter;
          }
        },
      }));

      registry.register("bad", async () => ({
        default: class {
          constructor() {
            return badAdapter;
          }
        },
      }));

      await registry.load("good", {});
      await registry.load("bad", {});

      // Should not throw despite one disconnect failing
      await expect(registry.clear()).resolves.toBeUndefined();

      // Both should have been attempted
      expect(goodAdapter.disconnect).toHaveBeenCalled();
      expect(badAdapter.disconnect).toHaveBeenCalled();
    });

    it("should allow loading after clear", async () => {
      const registry = new ChannelRegistry();

      registry.register("test", async () => ({
        default: class {
          constructor() {
            return new MockChannelAdapter();
          }
        },
      }));

      // Load, clear, load again
      await registry.load("test", {});
      await registry.clear();
      const adapter = await registry.load("test", {});

      expect(adapter).toBeDefined();
    });
  });

  describe("registry queries", () => {
    it("should check if channel type is registered", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn());

      expect(registry.has("slack")).toBe(true);
      expect(registry.has("discord")).toBe(false);
    });

    it("should list all registered channel types", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn());
      registry.register("discord", vi.fn());
      registry.register("teams", vi.fn());

      const types = registry.getRegisteredTypes();

      expect(types).toHaveLength(3);
      expect(types).toContain("slack");
      expect(types).toContain("discord");
      expect(types).toContain("teams");
    });
  });
});
