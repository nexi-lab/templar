import { describe, expect, it } from "vitest";
import { assemblePlugins } from "../plugin-assembler.js";
import { PluginRegistry } from "../plugin-registry.js";
import { createMiddlewarePlugin, createMockPlugin, createToolPlugin } from "./helpers.js";

describe("assemblePlugins", () => {
  it("should return empty result for empty registry", () => {
    const registry = new PluginRegistry();
    registry.freeze();

    const result = assemblePlugins(registry);

    expect(result.tools).toHaveLength(0);
    expect(result.channels).toHaveLength(0);
    expect(result.middleware).toHaveLength(0);
    expect(result.hooks).toHaveLength(0);
    expect(result.skillDirs).toHaveLength(0);
    expect(result.providers.size).toBe(0);
    expect(result.snapshots).toHaveLength(0);
  });

  it("should merge tools from multiple plugins", async () => {
    const registry = new PluginRegistry();
    await registry.add(createToolPlugin("p1", "tool-1"), "bundled");
    await registry.add(createToolPlugin("p2", "tool-2"), "community");
    registry.freeze();

    const result = assemblePlugins(registry);

    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t) => t.name)).toEqual(["tool-1", "tool-2"]);
  });

  it("should order middleware by trust tier (bundled → verified → community)", async () => {
    const registry = new PluginRegistry();
    // Register in reverse order to test sorting
    // All use "middleware" capability — trust tiers bundled/verified allow it
    await registry.add(createMiddlewarePlugin("verified-mw"), "verified");
    await registry.add(createMiddlewarePlugin("bundled-mw"), "bundled");
    registry.freeze();

    const result = assemblePlugins(registry);

    expect(result.middleware).toHaveLength(2);
    // Bundled should come before verified
    expect(result.middleware[0]?.name).toBe("bundled-mw-mw");
    expect(result.middleware[1]?.name).toBe("verified-mw-mw");
  });

  it("should namespace providers with plugin name", async () => {
    const registry = new PluginRegistry();
    await registry.add(
      createMockPlugin({
        name: "provider-plugin",
        capabilities: ["providers"],
        register: async (api) => {
          api.registerProvider("weather", { fetch: () => {} });
        },
      }),
      "bundled",
    );
    registry.freeze();

    const result = assemblePlugins(registry);
    expect(result.providers.has("provider-plugin/weather")).toBe(true);
  });

  it("should include snapshots from all plugins", async () => {
    const registry = new PluginRegistry();
    await registry.add(createToolPlugin("p1", "t1"), "bundled");
    await registry.add(createToolPlugin("p2", "t2"), "verified");
    registry.freeze();

    const result = assemblePlugins(registry);

    expect(result.snapshots).toHaveLength(2);
    expect(result.snapshots[0]?.name).toBe("p1");
    expect(result.snapshots[1]?.name).toBe("p2");
  });

  it("should merge hooks from multiple plugins", async () => {
    const registry = new PluginRegistry();
    await registry.add(
      createMockPlugin({
        name: "hook-plugin-1",
        capabilities: ["hooks"],
        register: async (api) => {
          api.registerHook("PostToolUse", () => {});
        },
      }),
      "bundled",
    );
    await registry.add(
      createMockPlugin({
        name: "hook-plugin-2",
        capabilities: ["hooks"],
        register: async (api) => {
          api.registerHook("SessionStart", () => {});
        },
      }),
      "bundled",
    );
    registry.freeze();

    const result = assemblePlugins(registry);

    expect(result.hooks).toHaveLength(2);
    expect(result.hooks.map((h) => h.event)).toEqual(["PostToolUse", "SessionStart"]);
  });

  it("should merge skill dirs from multiple plugins", async () => {
    const registry = new PluginRegistry();
    await registry.add(
      createMockPlugin({
        name: "skill-plugin",
        capabilities: ["skills"],
        register: async (api) => {
          api.registerSkillDir("/path/to/skills-1");
          api.registerSkillDir("/path/to/skills-2");
        },
      }),
      "bundled",
    );
    registry.freeze();

    const result = assemblePlugins(registry);
    expect(result.skillDirs).toHaveLength(2);
  });
});
