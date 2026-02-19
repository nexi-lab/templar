import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPlugins } from "../plugin-loader.js";
import { createMockPlugin, createToolPlugin, writeTempPlugin } from "./helpers.js";

describe("loadPlugins", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "templar-plugin-loader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Basic loading
  // -------------------------------------------------------------------------

  it("should return empty frozen registry when no plugins exist", async () => {
    const registry = await loadPlugins({
      projectDir: join(tempDir, "project"),
      userDir: join(tempDir, "user"),
      bundledPlugins: [],
    });

    expect(registry.isFrozen).toBe(true);
    expect(registry.size).toBe(0);
  });

  it("should load bundled plugins", async () => {
    const plugin = createToolPlugin("bundled-plugin", "bundled-tool");

    const registry = await loadPlugins({
      projectDir: join(tempDir, "project"),
      userDir: join(tempDir, "user"),
      bundledPlugins: [plugin],
    });

    expect(registry.size).toBe(1);
    expect(registry.getTrust("bundled-plugin")).toBe("bundled");
  });

  it("should load project plugins from filesystem", async () => {
    const projectDir = join(tempDir, "project");
    await writeTempPlugin(projectDir, "fs-plugin");

    const registry = await loadPlugins({
      projectDir,
      userDir: join(tempDir, "user"),
      bundledPlugins: [],
    });

    expect(registry.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Dedup (project > user > bundled)
  // -------------------------------------------------------------------------

  it("should dedup: project overrides bundled", async () => {
    const projectDir = join(tempDir, "project");
    await writeTempPlugin(projectDir, "shared-name");

    const bundled = createToolPlugin("shared-name", "bundled-tool");

    const registry = await loadPlugins({
      projectDir,
      userDir: join(tempDir, "user"),
      bundledPlugins: [bundled],
    });

    // Project plugin wins, so only 1 registered
    expect(registry.size).toBe(1);
    // Project plugins get community trust
    expect(registry.getTrust("shared-name")).toBe("community");
  });

  // -------------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------------

  it("should continue loading when one plugin fails", async () => {
    const onPluginError = vi.fn();
    const good = createToolPlugin("good-plugin", "good-tool");
    const bad = createMockPlugin({
      name: "bad-plugin",
      register: async () => {
        throw new Error("fail");
      },
    });

    const registry = await loadPlugins({
      projectDir: join(tempDir, "project"),
      userDir: join(tempDir, "user"),
      bundledPlugins: [bad, good],
      onPluginError,
    });

    // bad failed, good succeeded
    expect(registry.size).toBe(1);
    expect(onPluginError).toHaveBeenCalledOnce();
    expect(onPluginError).toHaveBeenCalledWith("bad-plugin", expect.any(Error));
  });

  // -------------------------------------------------------------------------
  // Manifest filtering
  // -------------------------------------------------------------------------

  it("should only load plugins declared in manifest when present", async () => {
    const p1 = createToolPlugin("plugin-a", "tool-a");
    const p2 = createToolPlugin("plugin-b", "tool-b");

    const registry = await loadPlugins(
      {
        projectDir: join(tempDir, "project"),
        userDir: join(tempDir, "user"),
        bundledPlugins: [p1, p2],
      },
      {
        name: "test-agent",
        version: "1.0.0",
        description: "test",
        plugins: [{ name: "plugin-a" }],
      },
    );

    // Only plugin-a should be loaded
    expect(registry.size).toBe(1);
    expect(registry.getTrust("plugin-a")).toBe("bundled");
  });

  it("should pass config from manifest to plugin register()", async () => {
    const registerSpy = vi.fn(async () => {});
    const plugin = createMockPlugin({
      name: "config-plugin",
      register: registerSpy,
    });

    await loadPlugins(
      {
        projectDir: join(tempDir, "project"),
        userDir: join(tempDir, "user"),
        bundledPlugins: [plugin],
      },
      {
        name: "test-agent",
        version: "1.0.0",
        description: "test",
        plugins: [{ name: "config-plugin", config: { key: "value" } }],
      },
    );

    expect(registerSpy).toHaveBeenCalledWith(expect.anything(), { key: "value" });
  });

  // -------------------------------------------------------------------------
  // Timeout
  // -------------------------------------------------------------------------

  it("should respect custom register timeout", async () => {
    const onPluginError = vi.fn();
    const slow = createMockPlugin({
      name: "slow-plugin",
      register: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      },
    });

    const registry = await loadPlugins({
      projectDir: join(tempDir, "project"),
      userDir: join(tempDir, "user"),
      bundledPlugins: [slow],
      registerTimeoutMs: 50,
      onPluginError,
    });

    expect(registry.size).toBe(0);
    expect(onPluginError).toHaveBeenCalledOnce();
  });
});
