import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigWatcher, type ConfigWatcherDeps } from "../config-watcher.js";
import type { GatewayConfig } from "../protocol/index.js";

const VALID_CONFIG: GatewayConfig = {
  port: 18789,
  nexusUrl: "https://api.nexus.test",
  nexusApiKey: "test-key",
  sessionTimeout: 60_000,
  suspendTimeout: 300_000,
  healthCheckInterval: 30_000,
  laneCapacity: 256,
  maxConnections: 1024,
  maxFramesPerSecond: 100,
  defaultConversationScope: "per-channel-peer",
  maxConversations: 100_000,
  conversationTtl: 86_400_000,
};

function createMockDeps(): ConfigWatcherDeps {
  return {
    watch: () => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  };
}

describe("ConfigWatcher", () => {
  let testDir: string;
  let configPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `gateway-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    configPath = join(testDir, "config.json");
    await writeFile(configPath, JSON.stringify(VALID_CONFIG));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Config retrieval
  // -------------------------------------------------------------------------

  describe("getConfig()", () => {
    it("returns initial config", () => {
      const watcher = new ConfigWatcher(VALID_CONFIG);
      expect(watcher.getConfig()).toEqual(VALID_CONFIG);
    });
  });

  // -------------------------------------------------------------------------
  // Hot-reload of valid config
  // -------------------------------------------------------------------------

  describe("hot-reload valid config", () => {
    it("applies hot-reloadable field changes", async () => {
      const updatedHandler = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newConfig: GatewayConfig = { ...VALID_CONFIG, sessionTimeout: 120_000 };
      await writeFile(configPath, JSON.stringify(newConfig));

      await watcher.watch(configPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      expect(updatedHandler).toHaveBeenCalledWith(
        expect.objectContaining({ sessionTimeout: 120_000 }),
        ["sessionTimeout"],
      );
      expect(watcher.getConfig().sessionTimeout).toBe(120_000);
    });

    it("emits restart-required for port change", async () => {
      const restartHandler = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, createMockDeps());
      watcher.onRestartRequired(restartHandler);

      const newConfig: GatewayConfig = { ...VALID_CONFIG, port: 9999 };
      await writeFile(configPath, JSON.stringify(newConfig));

      await watcher.watch(configPath);
      await watcher.triggerReload();

      expect(restartHandler).toHaveBeenCalledWith(["port"]);
    });

    it("applies multiple hot-reloadable fields at once", async () => {
      const updatedHandler = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newConfig: GatewayConfig = {
        ...VALID_CONFIG,
        sessionTimeout: 120_000,
        healthCheckInterval: 15_000,
      };
      await writeFile(configPath, JSON.stringify(newConfig));

      await watcher.watch(configPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      const [config, fields] = updatedHandler.mock.calls[0] as [GatewayConfig, string[]];
      expect(config.sessionTimeout).toBe(120_000);
      expect(config.healthCheckInterval).toBe(15_000);
      expect(fields).toContain("sessionTimeout");
      expect(fields).toContain("healthCheckInterval");
    });
  });

  // -------------------------------------------------------------------------
  // Invalid config
  // -------------------------------------------------------------------------

  describe("invalid config", () => {
    it("emits error and retains old config for invalid JSON", async () => {
      const errorHandler = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, createMockDeps());
      watcher.onError(errorHandler);

      await writeFile(configPath, "not valid json");

      await watcher.watch(configPath);
      await watcher.triggerReload();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getConfig()).toEqual(VALID_CONFIG);
    });

    it("emits error for invalid config values", async () => {
      const errorHandler = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, createMockDeps());
      watcher.onError(errorHandler);

      await writeFile(configPath, JSON.stringify({ ...VALID_CONFIG, port: -1 }));

      await watcher.watch(configPath);
      await watcher.triggerReload();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getConfig()).toEqual(VALID_CONFIG);
    });
  });

  // -------------------------------------------------------------------------
  // Debounce
  // -------------------------------------------------------------------------

  describe("debounce", () => {
    it("collapses multiple rapid changes to one reload via handleChange", async () => {
      vi.useFakeTimers();
      const updatedHandler = vi.fn();
      // Use a longer debounce to test collapsing
      const watcher = new ConfigWatcher(VALID_CONFIG, 50, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newConfig: GatewayConfig = { ...VALID_CONFIG, laneCapacity: 512 };
      await writeFile(configPath, JSON.stringify(newConfig));

      await watcher.watch(configPath);

      // Simulate 3 rapid file changes via the internal debounce path
      // Each resets the timer
      (watcher as unknown as { handleChange: () => void }).handleChange();
      (watcher as unknown as { handleChange: () => void }).handleChange();
      (watcher as unknown as { handleChange: () => void }).handleChange();

      // Advance past debounce — fires one reload
      vi.advanceTimersByTime(50);
      // Flush the async reload triggered by the timer
      await vi.runAllTimersAsync();
      // Allow microtasks (readFile) to settle
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(updatedHandler).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // No change
  // -------------------------------------------------------------------------

  describe("no-op on unchanged config", () => {
    it("does not emit when config file is unchanged", async () => {
      const updatedHandler = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      // Write same config
      await writeFile(configPath, JSON.stringify(VALID_CONFIG));

      await watcher.watch(configPath);
      await watcher.triggerReload();

      expect(updatedHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Stop
  // -------------------------------------------------------------------------

  describe("stop()", () => {
    it("cleans up watcher", async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockOn = vi.fn();
      const watcher = new ConfigWatcher(VALID_CONFIG, 10, {
        watch: () => ({ on: mockOn, close: mockClose }),
      });

      await watcher.watch(configPath);
      await watcher.stop();

      expect(mockClose).toHaveBeenCalled();
    });
  });
});
