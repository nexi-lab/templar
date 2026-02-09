import { ChannelLoadError, ChannelNotFoundError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { ChannelRegistry } from "../../channel-registry.js";
import { MockChannelAdapter } from "../helpers/mock-channel.js";

describe("ChannelRegistry", () => {
  describe("registration", () => {
    it("should register a channel loader", () => {
      const registry = new ChannelRegistry();
      const loader = vi.fn();

      registry.register("test", loader);

      expect(registry.has("test")).toBe(true);
    });

    it("should prevent duplicate registration of same type", () => {
      const registry = new ChannelRegistry();
      const loader = vi.fn();

      registry.register("test", loader);

      expect(() => registry.register("test", loader)).toThrow(
        "Channel type 'test' is already registered",
      );
    });

    it("should register multiple different channel types", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn());
      registry.register("discord", vi.fn());
      registry.register("teams", vi.fn());

      expect(registry.has("slack")).toBe(true);
      expect(registry.has("discord")).toBe(true);
      expect(registry.has("teams")).toBe(true);
    });

    it("should return all registered types", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn());
      registry.register("discord", vi.fn());

      const types = registry.getRegisteredTypes();
      expect(types).toContain("slack");
      expect(types).toContain("discord");
      expect(types).toHaveLength(2);
    });
  });

  describe("loading", () => {
    it("should load a registered channel", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter = new MockChannelAdapter("test-channel");

      registry.register("test", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern
            return mockAdapter;
          }
        },
      }));

      const adapter = await registry.load("test", {});
      expect(adapter.name).toBe("test-channel");
    });

    it("should throw ChannelNotFoundError for unregistered type", async () => {
      const registry = new ChannelRegistry();

      await expect(registry.load("nonexistent", {})).rejects.toThrow(ChannelNotFoundError);
      await expect(registry.load("nonexistent", {})).rejects.toThrow(
        "Channel type 'nonexistent' not found",
      );
    });

    it("should pass config to adapter constructor", async () => {
      const registry = new ChannelRegistry();
      const constructorSpy = vi.fn();

      registry.register("test", async () => ({
        default: class {
          constructor(config: unknown) {
            constructorSpy(config);
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
            return new MockChannelAdapter();
          }
        },
      }));

      const config = { token: "test-token", channel: "#general" };
      await registry.load("test", config);

      expect(constructorSpy).toHaveBeenCalledWith(config);
    });
  });

  describe("caching", () => {
    it("should cache loaded adapters", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
            return new MockChannelAdapter();
          }
        },
      }));

      registry.register("test", loaderSpy);

      // Load twice
      const adapter1 = await registry.load("test", {});
      const adapter2 = await registry.load("test", {});

      // Should call loader only once
      expect(loaderSpy).toHaveBeenCalledOnce();
      // Should return same instance
      expect(adapter1).toBe(adapter2);
    });

    it("should deduplicate concurrent loads", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(async () => {
        // Simulate async loading delay
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter();
            }
          },
        };
      });

      registry.register("test", loaderSpy);

      // Trigger 3 concurrent loads
      const [adapter1, adapter2, adapter3] = await Promise.all([
        registry.load("test", {}),
        registry.load("test", {}),
        registry.load("test", {}),
      ]);

      // Should call loader only once despite 3 concurrent requests
      expect(loaderSpy).toHaveBeenCalledOnce();
      // All should get same instance
      expect(adapter1).toBe(adapter2);
      expect(adapter2).toBe(adapter3);
    });

    it("should cache adapters separately by type", async () => {
      const registry = new ChannelRegistry();

      registry.register("slack", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
            return new MockChannelAdapter("slack");
          }
        },
      }));

      registry.register("discord", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
            return new MockChannelAdapter("discord");
          }
        },
      }));

      const slackAdapter = await registry.load("slack", {});
      const discordAdapter = await registry.load("discord", {});

      expect(slackAdapter.name).toBe("slack");
      expect(discordAdapter.name).toBe("discord");
      expect(slackAdapter).not.toBe(discordAdapter);
    });
  });

  describe("error handling", () => {
    it("should throw ChannelLoadError when import fails", async () => {
      const registry = new ChannelRegistry();

      registry.register("failing", async () => {
        throw new Error("Module not found");
      });

      await expect(registry.load("failing", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("failing", {})).rejects.toThrow(
        "Failed to load channel 'failing': Import failed: Module not found",
      );
    });

    it("should throw ChannelLoadError when module has no default export", async () => {
      const registry = new ChannelRegistry();

      registry.register("no-default", async () => ({
        // Missing default export
        named: class {},
      }));

      await expect(registry.load("no-default", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("no-default", {})).rejects.toThrow(
        "Package must export a default ChannelAdapter class",
      );
    });

    it("should throw ChannelLoadError when constructor throws", async () => {
      const registry = new ChannelRegistry();

      registry.register("bad-constructor", async () => ({
        default: class {
          constructor() {
            throw new Error("Invalid config");
          }
        },
      }));

      await expect(registry.load("bad-constructor", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("bad-constructor", {})).rejects.toThrow(
        "Failed to instantiate adapter: Invalid config",
      );
    });

    it("should throw ChannelLoadError when adapter is invalid", async () => {
      const registry = new ChannelRegistry();

      registry.register("invalid", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern
            return { name: "test" }; // Missing required methods
          }
        },
      }));

      await expect(registry.load("invalid", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("invalid", {})).rejects.toThrow(
        "Invalid adapter: missing required methods",
      );
    });

    it("should remove failed load from cache for retry", async () => {
      const registry = new ChannelRegistry();
      let shouldFail = true;

      registry.register("flaky", async () => {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("First load fails");
        }
        return {
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter();
            }
          },
        };
      });

      // First load fails
      await expect(registry.load("flaky", {})).rejects.toThrow();

      // Second load succeeds (wouldn't work if first failure was cached)
      const adapter = await registry.load("flaky", {});
      expect(adapter).toBeDefined();
    });

    it("should include cause in ChannelLoadError", async () => {
      const registry = new ChannelRegistry();
      const originalError = new Error("Network timeout");

      registry.register("error-with-cause", async () => {
        throw originalError;
      });

      try {
        await registry.load("error-with-cause", {});
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ChannelLoadError);
        if (error instanceof ChannelLoadError) {
          expect(error.cause).toBe(originalError);
        }
      }
    });
  });

  describe("cleanup", () => {
    it("should disconnect all adapters on clear", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter1 = new MockChannelAdapter("channel-1");
      const mockAdapter2 = new MockChannelAdapter("channel-2");

      registry.register("channel1", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern
            return mockAdapter1;
          }
        },
      }));

      registry.register("channel2", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern
            return mockAdapter2;
          }
        },
      }));

      // Load both channels
      await registry.load("channel1", {});
      await registry.load("channel2", {});

      // Clear registry
      await registry.clear();

      // Both adapters should have been disconnected
      expect(mockAdapter1.disconnect).toHaveBeenCalled();
      expect(mockAdapter2.disconnect).toHaveBeenCalled();
    });

    it("should clear cache on clear", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
            return new MockChannelAdapter();
          }
        },
      }));

      registry.register("test", loaderSpy);

      // Load once
      await registry.load("test", {});
      expect(loaderSpy).toHaveBeenCalledOnce();

      // Clear
      await registry.clear();

      // Load again - should call loader again since cache was cleared
      await registry.load("test", {});
      expect(loaderSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle disconnect failures gracefully", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter = new MockChannelAdapter();
      // biome-ignore lint/suspicious/noExplicitAny: Mock method access
      (mockAdapter.disconnect as any).mockRejectedValue(new Error("Disconnect failed"));

      registry.register("failing-disconnect", async () => ({
        default: class {
          constructor() {
            // biome-ignore lint/correctness/noConstructorReturn: Test pattern
            return mockAdapter;
          }
        },
      }));

      await registry.load("failing-disconnect", {});

      // Should not throw even if disconnect fails
      await expect(registry.clear()).resolves.toBeUndefined();
    });
  });
});
