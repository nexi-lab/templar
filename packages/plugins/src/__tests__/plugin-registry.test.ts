import { PluginLifecycleError, PluginRegistrationError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { PluginRegistry } from "../plugin-registry.js";
import { createMockPlugin, createToolPlugin } from "./helpers.js";

describe("PluginRegistry", () => {
  // -------------------------------------------------------------------------
  // add()
  // -------------------------------------------------------------------------

  describe("add", () => {
    it("should register a valid plugin", async () => {
      const registry = new PluginRegistry();
      const plugin = createToolPlugin("test-plugin", "my-tool");

      await registry.add(plugin, "bundled");

      expect(registry.size).toBe(1);
      expect(registry.getTrust("test-plugin")).toBe("bundled");
    });

    it("should detect duplicate plugin names", async () => {
      const registry = new PluginRegistry();
      const plugin1 = createToolPlugin("dup-plugin", "tool-1");
      const plugin2 = createToolPlugin("dup-plugin", "tool-2");

      await registry.add(plugin1, "bundled");
      await expect(registry.add(plugin2, "community")).rejects.toThrow(PluginRegistrationError);
    });

    it("should throw PluginLifecycleError when register() throws", async () => {
      const registry = new PluginRegistry();
      const plugin = createMockPlugin({
        name: "bad-plugin",
        register: async () => {
          throw new Error("plugin broke");
        },
      });

      await expect(registry.add(plugin, "bundled")).rejects.toThrow(PluginLifecycleError);
    });

    it("should throw PluginLifecycleError when register() times out", async () => {
      const registry = new PluginRegistry();
      const plugin = createMockPlugin({
        name: "slow-plugin",
        register: async () => {
          await new Promise((resolve) => setTimeout(resolve, 10_000));
        },
      });

      await expect(registry.add(plugin, "bundled", undefined, 50)).rejects.toThrow(
        PluginLifecycleError,
      );
    });

    it("should throw when adding to a frozen registry", async () => {
      const registry = new PluginRegistry();
      registry.freeze();

      const plugin = createToolPlugin("late-plugin", "tool");
      await expect(registry.add(plugin, "bundled")).rejects.toThrow(PluginRegistrationError);
    });

    it("should pass config to register()", async () => {
      const registry = new PluginRegistry();
      const registerSpy = vi.fn(async () => {});
      const plugin = createMockPlugin({
        name: "config-plugin",
        register: registerSpy,
      });
      const config = { apiKey: "secret" };

      await registry.add(plugin, "bundled", config);

      expect(registerSpy).toHaveBeenCalledWith(expect.anything(), config);
    });
  });

  // -------------------------------------------------------------------------
  // freeze()
  // -------------------------------------------------------------------------

  describe("freeze", () => {
    it("should return metadata snapshots", async () => {
      const registry = new PluginRegistry();
      await registry.add(createToolPlugin("p1", "t1"), "bundled");
      await registry.add(createToolPlugin("p2", "t2"), "community");

      const snapshots = registry.freeze();

      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]?.name).toBe("p1");
      expect(snapshots[0]?.trust).toBe("bundled");
      expect(snapshots[1]?.name).toBe("p2");
      expect(snapshots[1]?.trust).toBe("community");
    });

    it("should set isFrozen to true", () => {
      const registry = new PluginRegistry();
      expect(registry.isFrozen).toBe(false);
      registry.freeze();
      expect(registry.isFrozen).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getSnapshots()
  // -------------------------------------------------------------------------

  describe("getSnapshots", () => {
    it("should include registeredAt timestamp", async () => {
      const registry = new PluginRegistry();
      const before = Date.now();
      await registry.add(createToolPlugin("p", "t"), "verified");
      const after = Date.now();

      const snapshots = registry.getSnapshots();
      expect(snapshots[0]?.registeredAt).toBeGreaterThanOrEqual(before);
      expect(snapshots[0]?.registeredAt).toBeLessThanOrEqual(after);
    });
  });

  // -------------------------------------------------------------------------
  // getAllRegistrations()
  // -------------------------------------------------------------------------

  describe("getAllRegistrations", () => {
    it("should return registrations keyed by plugin name", async () => {
      const registry = new PluginRegistry();
      await registry.add(createToolPlugin("p1", "t1"), "bundled");
      await registry.add(createToolPlugin("p2", "t2"), "community");

      const allRegs = registry.getAllRegistrations();
      expect(allRegs.size).toBe(2);
      expect(allRegs.get("p1")?.tools[0]?.name).toBe("t1");
      expect(allRegs.get("p2")?.tools[0]?.name).toBe("t2");
    });
  });

  // -------------------------------------------------------------------------
  // dispose()
  // -------------------------------------------------------------------------

  describe("dispose", () => {
    it("should call teardown() on each plugin", async () => {
      const teardown1 = vi.fn(async () => {});
      const teardown2 = vi.fn(async () => {});

      const registry = new PluginRegistry();
      await registry.add(createMockPlugin({ name: "p1", teardown: teardown1 }), "bundled");
      await registry.add(createMockPlugin({ name: "p2", teardown: teardown2 }), "bundled");

      await registry.dispose();

      expect(teardown1).toHaveBeenCalledOnce();
      expect(teardown2).toHaveBeenCalledOnce();
    });

    it("should aggregate errors from failed teardowns", async () => {
      const registry = new PluginRegistry();
      await registry.add(
        createMockPlugin({
          name: "bad-teardown",
          teardown: async () => {
            throw new Error("teardown boom");
          },
        }),
        "bundled",
      );

      await expect(registry.dispose()).rejects.toThrow(AggregateError);
    });

    it("should skip plugins without teardown", async () => {
      const registry = new PluginRegistry();
      await registry.add(createToolPlugin("no-teardown", "tool"), "bundled");

      // Should not throw
      await registry.dispose();
    });
  });
});
