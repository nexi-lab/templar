import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverBundledPlugins,
  discoverProjectPlugins,
  discoverUserPlugins,
} from "../plugin-discovery.js";
import { createMockPlugin } from "./helpers.js";

describe("plugin-discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "templar-plugin-discovery-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // discoverProjectPlugins
  // -------------------------------------------------------------------------

  describe("discoverProjectPlugins", () => {
    it("should return empty array for non-existent directory", async () => {
      const result = await discoverProjectPlugins(join(tempDir, "nonexistent"));
      expect(result).toEqual([]);
    });

    it("should return empty array for empty directory", async () => {
      const emptyDir = join(tempDir, "empty");
      await mkdir(emptyDir, { recursive: true });

      const result = await discoverProjectPlugins(emptyDir);
      expect(result).toEqual([]);
    });

    it("should discover plugins with index.js", async () => {
      const pluginDir = join(tempDir, "my-plugin");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, "index.js"), "export default {}");

      const result = await discoverProjectPlugins(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("my-plugin");
      expect(result[0]?.source).toBe("project");
    });

    it("should discover plugins with package.json", async () => {
      const pluginDir = join(tempDir, "pkg-plugin");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, "package.json"), '{"name":"pkg-plugin"}');

      const result = await discoverProjectPlugins(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe("pkg-plugin");
    });

    it("should skip non-directory entries", async () => {
      await writeFile(join(tempDir, "not-a-plugin.txt"), "hello");

      const result = await discoverProjectPlugins(tempDir);
      expect(result).toEqual([]);
    });

    it("should skip directories without entry points", async () => {
      const pluginDir = join(tempDir, "no-entry");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, "readme.md"), "no entry");

      const result = await discoverProjectPlugins(tempDir);
      expect(result).toEqual([]);
    });

    it("should discover multiple plugins", async () => {
      const dir1 = join(tempDir, "plugin-a");
      const dir2 = join(tempDir, "plugin-b");
      await mkdir(dir1, { recursive: true });
      await mkdir(dir2, { recursive: true });
      await writeFile(join(dir1, "index.js"), "export default {}");
      await writeFile(join(dir2, "index.mjs"), "export default {}");

      const result = await discoverProjectPlugins(tempDir);
      expect(result).toHaveLength(2);
      const names = result.map((p) => p.name).sort();
      expect(names).toEqual(["plugin-a", "plugin-b"]);
    });
  });

  // -------------------------------------------------------------------------
  // discoverUserPlugins
  // -------------------------------------------------------------------------

  describe("discoverUserPlugins", () => {
    it("should return empty array for non-existent directory", async () => {
      const result = await discoverUserPlugins(join(tempDir, "nonexistent"));
      expect(result).toEqual([]);
    });

    it("should mark discovered plugins as user source", async () => {
      const pluginDir = join(tempDir, "user-plugin");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(join(pluginDir, "index.js"), "export default {}");

      const result = await discoverUserPlugins(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0]?.source).toBe("user");
    });
  });

  // -------------------------------------------------------------------------
  // discoverBundledPlugins
  // -------------------------------------------------------------------------

  describe("discoverBundledPlugins", () => {
    it("should return empty array for no bundled plugins", () => {
      const result = discoverBundledPlugins([]);
      expect(result).toEqual([]);
    });

    it("should wrap bundled plugins as discovered entries", () => {
      const plugins = [
        createMockPlugin({ name: "bundled-a" }),
        createMockPlugin({ name: "bundled-b" }),
      ];

      const result = discoverBundledPlugins(plugins);

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe("bundled-a");
      expect(result[0]?.source).toBe("bundled");
      expect(result[0]?.path).toBe("bundled:bundled-a");
    });
  });
});
