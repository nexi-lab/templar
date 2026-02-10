import { ChannelLoadError, ChannelNotFoundError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { ChannelRegistry } from "../../channel-registry.js";
import type { ChannelCapabilities } from "../../types.js";
import { MockChannelAdapter } from "../helpers/mock-channel.js";

/** Minimal text-only capabilities for tests that don't care about specific caps */
const TEXT_CAPS: ChannelCapabilities = { text: { supported: true, maxLength: 4000 } };

/** Helper to create a mock loader that returns a MockChannelAdapter */
function mockLoader(name = "mock-channel") {
  return async () => ({
    default: class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: Test pattern
        return new MockChannelAdapter(name);
      }
    },
  });
}

describe("ChannelRegistry", () => {
  describe("registration", () => {
    it("should register a channel loader with capabilities", () => {
      const registry = new ChannelRegistry();
      registry.register("test", vi.fn(), TEXT_CAPS);
      expect(registry.has("test")).toBe(true);
    });

    it("should prevent duplicate registration of same type", () => {
      const registry = new ChannelRegistry();
      registry.register("test", vi.fn(), TEXT_CAPS);

      expect(() => registry.register("test", vi.fn(), TEXT_CAPS)).toThrow(
        "Channel type 'test' is already registered",
      );
    });

    it("should register multiple different channel types", () => {
      const registry = new ChannelRegistry();
      registry.register("slack", vi.fn(), TEXT_CAPS);
      registry.register("discord", vi.fn(), TEXT_CAPS);
      registry.register("teams", vi.fn(), TEXT_CAPS);

      expect(registry.has("slack")).toBe(true);
      expect(registry.has("discord")).toBe(true);
      expect(registry.has("teams")).toBe(true);
    });

    it("should return all registered types", () => {
      const registry = new ChannelRegistry();
      registry.register("slack", vi.fn(), TEXT_CAPS);
      registry.register("discord", vi.fn(), TEXT_CAPS);

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

      registry.register(
        "test",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return mockAdapter;
            }
          },
        }),
        TEXT_CAPS,
      );

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

      registry.register(
        "test",
        async () => ({
          default: class {
            constructor(config: unknown) {
              constructorSpy(config);
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern for mocking
              return new MockChannelAdapter();
            }
          },
        }),
        TEXT_CAPS,
      );

      const config = { token: "test-token", channel: "#general" };
      await registry.load("test", config);

      expect(constructorSpy).toHaveBeenCalledWith(config);
    });
  });

  describe("caching", () => {
    it("should cache loaded adapters (same config)", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(mockLoader());

      registry.register("test", loaderSpy, TEXT_CAPS);

      const adapter1 = await registry.load("test", {});
      const adapter2 = await registry.load("test", {});

      expect(loaderSpy).toHaveBeenCalledOnce();
      expect(adapter1).toBe(adapter2);
    });

    it("should deduplicate concurrent loads", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(async () => {
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

      registry.register("test", loaderSpy, TEXT_CAPS);

      const [adapter1, adapter2, adapter3] = await Promise.all([
        registry.load("test", {}),
        registry.load("test", {}),
        registry.load("test", {}),
      ]);

      expect(loaderSpy).toHaveBeenCalledOnce();
      expect(adapter1).toBe(adapter2);
      expect(adapter2).toBe(adapter3);
    });

    it("should cache adapters separately by type", async () => {
      const registry = new ChannelRegistry();

      registry.register("slack", mockLoader("slack"), TEXT_CAPS);
      registry.register("discord", mockLoader("discord"), TEXT_CAPS);

      const slackAdapter = await registry.load("slack", {});
      const discordAdapter = await registry.load("discord", {});

      expect(slackAdapter.name).toBe("slack");
      expect(discordAdapter.name).toBe("discord");
      expect(slackAdapter).not.toBe(discordAdapter);
    });
  });

  describe("config-aware caching", () => {
    it("should return different instances for same type with different configs", async () => {
      const registry = new ChannelRegistry();
      let instanceCount = 0;

      registry.register(
        "slack",
        async () => ({
          default: class {
            constructor() {
              instanceCount++;
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return new MockChannelAdapter(`slack-${instanceCount}`);
            }
          },
        }),
        TEXT_CAPS,
      );

      const adapter1 = await registry.load("slack", { workspace: "A" });
      const adapter2 = await registry.load("slack", { workspace: "B" });

      expect(adapter1).not.toBe(adapter2);
      expect(adapter1.name).toBe("slack-1");
      expect(adapter2.name).toBe("slack-2");
    });

    it("should return same instance for same type with same config", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(mockLoader());

      registry.register("slack", loaderSpy, TEXT_CAPS);

      const adapter1 = await registry.load("slack", { token: "abc" });
      const adapter2 = await registry.load("slack", { token: "abc" });

      expect(loaderSpy).toHaveBeenCalledOnce();
      expect(adapter1).toBe(adapter2);
    });

    it("should use explicit instanceKey when provided", async () => {
      const registry = new ChannelRegistry();
      let instanceCount = 0;

      registry.register(
        "slack",
        async () => ({
          default: class {
            constructor() {
              instanceCount++;
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return new MockChannelAdapter(`slack-${instanceCount}`);
            }
          },
        }),
        TEXT_CAPS,
      );

      const adapter1 = await registry.load("slack", { token: "x" }, { instanceKey: "ws-A" });
      const adapter2 = await registry.load("slack", { token: "y" }, { instanceKey: "ws-A" });

      // Same instanceKey → same cached instance, regardless of config difference
      expect(adapter1).toBe(adapter2);
      expect(instanceCount).toBe(1);
    });

    it("should use different instances for different instanceKeys", async () => {
      const registry = new ChannelRegistry();
      let instanceCount = 0;

      registry.register(
        "slack",
        async () => ({
          default: class {
            constructor() {
              instanceCount++;
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return new MockChannelAdapter(`slack-${instanceCount}`);
            }
          },
        }),
        TEXT_CAPS,
      );

      const adapter1 = await registry.load("slack", {}, { instanceKey: "ws-A" });
      const adapter2 = await registry.load("slack", {}, { instanceKey: "ws-B" });

      expect(adapter1).not.toBe(adapter2);
      expect(instanceCount).toBe(2);
    });
  });

  describe("discovery", () => {
    it("should find channels with a single required capability", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn(), {
        text: { supported: true, maxLength: 4000 },
        images: { supported: true, maxSize: 10_000_000, formats: ["png", "jpg"] },
        threads: { supported: true, nested: false },
      });
      registry.register("sms", vi.fn(), {
        text: { supported: true, maxLength: 160 },
      });

      const withImages = registry.findByCapabilities({ images: true });
      expect(withImages).toEqual(["slack"]);
    });

    it("should find channels with multiple required capabilities", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn(), {
        text: { supported: true, maxLength: 4000 },
        images: { supported: true, maxSize: 10_000_000, formats: ["png"] },
        threads: { supported: true, nested: false },
      });
      registry.register("discord", vi.fn(), {
        text: { supported: true, maxLength: 2000 },
        images: { supported: true, maxSize: 8_000_000, formats: ["png"] },
      });
      registry.register("sms", vi.fn(), {
        text: { supported: true, maxLength: 160 },
      });

      const withImagesAndThreads = registry.findByCapabilities({ images: true, threads: true });
      expect(withImagesAndThreads).toEqual(["slack"]);
    });

    it("should return empty array when no channels match", () => {
      const registry = new ChannelRegistry();

      registry.register("sms", vi.fn(), {
        text: { supported: true, maxLength: 160 },
      });

      const result = registry.findByCapabilities({ images: true });
      expect(result).toEqual([]);
    });

    it("should return all channels when all match", () => {
      const registry = new ChannelRegistry();

      registry.register("slack", vi.fn(), {
        text: { supported: true, maxLength: 4000 },
      });
      registry.register("discord", vi.fn(), {
        text: { supported: true, maxLength: 2000 },
      });

      const withText = registry.findByCapabilities({ text: true });
      expect(withText).toContain("slack");
      expect(withText).toContain("discord");
      expect(withText).toHaveLength(2);
    });

    it("should return empty array when no channels are registered", () => {
      const registry = new ChannelRegistry();
      const result = registry.findByCapabilities({ text: true });
      expect(result).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("should throw ChannelLoadError when import fails", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "failing",
        async () => {
          throw new Error("Module not found");
        },
        TEXT_CAPS,
      );

      await expect(registry.load("failing", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("failing", {})).rejects.toThrow(
        "Failed to load channel 'failing': Import failed: Module not found",
      );
    });

    it("should throw ChannelLoadError when module has no default export", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "no-default",
        async () => ({
          named: class {},
        }),
        TEXT_CAPS,
      );

      await expect(registry.load("no-default", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("no-default", {})).rejects.toThrow(
        "Package must export a default ChannelAdapter class",
      );
    });

    it("should throw ChannelLoadError when constructor throws", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "bad-constructor",
        async () => ({
          default: class {
            constructor() {
              throw new Error("Invalid config");
            }
          },
        }),
        TEXT_CAPS,
      );

      await expect(registry.load("bad-constructor", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("bad-constructor", {})).rejects.toThrow(
        "Failed to instantiate adapter: Invalid config",
      );
    });

    it("should throw ChannelLoadError when adapter is invalid", async () => {
      const registry = new ChannelRegistry();

      registry.register(
        "invalid",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return { name: "test" }; // Missing required methods
            }
          },
        }),
        TEXT_CAPS,
      );

      await expect(registry.load("invalid", {})).rejects.toThrow(ChannelLoadError);
      await expect(registry.load("invalid", {})).rejects.toThrow(
        "Invalid adapter: missing required methods",
      );
    });

    it("should remove failed load from cache for retry", async () => {
      const registry = new ChannelRegistry();
      let shouldFail = true;

      registry.register(
        "flaky",
        async () => {
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
        },
        TEXT_CAPS,
      );

      await expect(registry.load("flaky", {})).rejects.toThrow();

      const adapter = await registry.load("flaky", {});
      expect(adapter).toBeDefined();
    });

    it("should include cause in ChannelLoadError", async () => {
      const registry = new ChannelRegistry();
      const originalError = new Error("Network timeout");

      registry.register(
        "error-with-cause",
        async () => {
          throw originalError;
        },
        TEXT_CAPS,
      );

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

      registry.register(
        "channel1",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return mockAdapter1;
            }
          },
        }),
        TEXT_CAPS,
      );

      registry.register(
        "channel2",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return mockAdapter2;
            }
          },
        }),
        TEXT_CAPS,
      );

      await registry.load("channel1", {});
      await registry.load("channel2", {});

      await registry.clear();

      expect(mockAdapter1.disconnect).toHaveBeenCalled();
      expect(mockAdapter2.disconnect).toHaveBeenCalled();
    });

    it("should clear cache on clear", async () => {
      const registry = new ChannelRegistry();
      const loaderSpy = vi.fn(mockLoader());

      registry.register("test", loaderSpy, TEXT_CAPS);

      await registry.load("test", {});
      expect(loaderSpy).toHaveBeenCalledOnce();

      await registry.clear();

      await registry.load("test", {});
      expect(loaderSpy).toHaveBeenCalledTimes(2);
    });

    it("should handle disconnect failures gracefully", async () => {
      const registry = new ChannelRegistry();
      const mockAdapter = new MockChannelAdapter();
      // biome-ignore lint/suspicious/noExplicitAny: Mock method access
      (mockAdapter.disconnect as any).mockRejectedValue(new Error("Disconnect failed"));

      registry.register(
        "failing-disconnect",
        async () => ({
          default: class {
            constructor() {
              // biome-ignore lint/correctness/noConstructorReturn: Test pattern
              return mockAdapter;
            }
          },
        }),
        TEXT_CAPS,
      );

      await registry.load("failing-disconnect", {});

      await expect(registry.clear()).resolves.toBeUndefined();
    });
  });
});
