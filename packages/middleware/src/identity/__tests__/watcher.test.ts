import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IdentityConfig } from "@templar/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdentityConfigWatcher, type IdentityConfigWatcherDeps } from "../watcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid manifest YAML with identity section. */
function manifestYaml(identity?: Record<string, unknown>): string {
  const lines = ["name: test-agent", "version: 0.1.0", 'description: "Test"'];
  if (identity !== undefined) {
    lines.push(`identity: ${JSON.stringify(identity)}`);
  }
  return lines.join("\n");
}

/** Simple YAML-like JSON parser for test deps (avoids importing yaml). */
function testParseYaml(content: string): unknown {
  // Our test manifests use JSON-in-YAML shorthand, so JSON.parse works
  // for the identity value. For full manifest, parse line by line.
  const lines = content.split("\n");
  const result: Record<string, unknown> = {};
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }
  return result;
}

function createMockDeps(): IdentityConfigWatcherDeps {
  return {
    watch: () => ({
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }),
    parseYaml: testParseYaml,
  };
}

const DEFAULT_IDENTITY: IdentityConfig = {
  default: {
    name: "TestBot",
    avatar: "https://cdn.example.com/bot.png",
    bio: "A test bot",
    systemPromptPrefix: "You are a test bot.",
  },
};

const IDENTITY_WITH_CHANNELS: IdentityConfig = {
  default: {
    name: "TestBot",
    avatar: "https://cdn.example.com/bot.png",
  },
  channels: {
    slack: { name: "SlackBot", avatar: "https://cdn.example.com/slack.png" },
    discord: { name: "DiscordBot" },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("IdentityConfigWatcher", () => {
  let testDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `identity-watcher-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    manifestPath = join(testDir, "templar.yaml");
    await writeFile(manifestPath, manifestYaml(DEFAULT_IDENTITY));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Initialization & getIdentity()
  // -------------------------------------------------------------------------

  describe("initialization", () => {
    it("returns undefined when no initial identity provided", () => {
      const watcher = new IdentityConfigWatcher(undefined, 10, createMockDeps());
      expect(watcher.getIdentity()).toBeUndefined();
    });

    it("returns initial identity when provided", () => {
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      expect(watcher.getIdentity()).toEqual(DEFAULT_IDENTITY);
    });

    it("freezes the initial identity (immutable)", () => {
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      const identity = watcher.getIdentity();
      expect(Object.isFrozen(identity)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Valid reload
  // -------------------------------------------------------------------------

  describe("valid reload", () => {
    it("emits 'updated' when identity section changes", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = { default: { name: "NewBot" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
    });

    it("applies new identity config (getIdentity returns new value)", async () => {
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());

      const newIdentity = { default: { name: "NewBot", bio: "Updated bot" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(watcher.getIdentity()).toEqual(newIdentity);
    });

    it("passes both new and old identity to handler", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = { default: { name: "NewBot" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      const [newArg, oldArg] = updatedHandler.mock.calls[0] as [
        IdentityConfig | undefined,
        IdentityConfig | undefined,
      ];
      expect(newArg).toEqual(newIdentity);
      expect(oldArg).toEqual(DEFAULT_IDENTITY);
    });

    it("handles identity added to manifest that had none", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(undefined, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = { default: { name: "NewBot" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      const [newArg, oldArg] = updatedHandler.mock.calls[0] as [
        IdentityConfig | undefined,
        IdentityConfig | undefined,
      ];
      expect(newArg).toEqual(newIdentity);
      expect(oldArg).toBeUndefined();
    });

    it("handles identity removed from manifest", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      // Manifest without identity key
      await writeFile(manifestPath, manifestYaml());

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      const [newArg, oldArg] = updatedHandler.mock.calls[0] as [
        IdentityConfig | undefined,
        IdentityConfig | undefined,
      ];
      expect(newArg).toBeUndefined();
      expect(oldArg).toEqual(DEFAULT_IDENTITY);
      expect(watcher.getIdentity()).toBeUndefined();
    });

    it("handles channel added to existing identity", async () => {
      const updatedHandler = vi.fn();
      const initial: IdentityConfig = { default: { name: "Bot" } };
      const watcher = new IdentityConfigWatcher(initial, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = {
        default: { name: "Bot" },
        channels: { slack: { name: "SlackBot" } },
      };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()).toEqual(newIdentity);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid config handling
  // -------------------------------------------------------------------------

  describe("invalid config", () => {
    it("emits 'error' for invalid YAML syntax, retains old config", async () => {
      const errorHandler = vi.fn();
      const throwingDeps: IdentityConfigWatcherDeps = {
        watch: () => ({
          on: vi.fn(),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        parseYaml: () => {
          throw new SyntaxError("Invalid YAML");
        },
      };
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, throwingDeps);
      watcher.onError(errorHandler);

      await writeFile(manifestPath, "{{{{not valid yaml at all");

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()).toEqual(DEFAULT_IDENTITY);
    });

    it("emits 'error' for invalid identity schema (bad avatar URL)", async () => {
      const errorHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onError(errorHandler);

      const badIdentity = { default: { name: "Bot", avatar: "javascript:alert(1)" } };
      await writeFile(manifestPath, manifestYaml(badIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()).toEqual(DEFAULT_IDENTITY);
    });

    it("emits 'error' for file read failure, retains old config", async () => {
      const errorHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onError(errorHandler);

      // Point to non-existent file
      const badPath = join(testDir, "nonexistent.yaml");
      await watcher.watch(badPath);
      await watcher.triggerReload();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()).toEqual(DEFAULT_IDENTITY);
    });

    it("does not emit 'updated' on validation failure", async () => {
      const updatedHandler = vi.fn();
      const errorHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);
      watcher.onError(errorHandler);

      const badIdentity = { default: { name: "B".repeat(100) } }; // name > 80 chars
      await writeFile(manifestPath, manifestYaml(badIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(updatedHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // No-op on unchanged
  // -------------------------------------------------------------------------

  describe("no-op on unchanged", () => {
    it("does not emit 'updated' when identity section unchanged (other fields changed)", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      // Write manifest with same identity but different name/version
      const lines = [
        "name: different-agent",
        "version: 2.0.0",
        'description: "Changed"',
        `identity: ${JSON.stringify(DEFAULT_IDENTITY)}`,
      ];
      await writeFile(manifestPath, lines.join("\n"));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).not.toHaveBeenCalled();
    });

    it("does not emit 'updated' when manifest is completely unchanged", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      // Write same identity
      await writeFile(manifestPath, manifestYaml(DEFAULT_IDENTITY));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).not.toHaveBeenCalled();
    });

    it("does not emit 'updated' when identity absent and was already absent", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(undefined, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      await writeFile(manifestPath, manifestYaml()); // No identity key

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Debounce
  // -------------------------------------------------------------------------

  describe("debounce", () => {
    it("collapses multiple rapid changes to one reload", async () => {
      vi.useFakeTimers();
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 50, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = { default: { name: "NewBot" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);

      // Simulate 3 rapid file changes via the internal debounce path
      (watcher as unknown as { handleChange: () => void }).handleChange();
      (watcher as unknown as { handleChange: () => void }).handleChange();
      (watcher as unknown as { handleChange: () => void }).handleChange();

      // Advance past debounce — fires one reload
      vi.advanceTimersByTime(50);
      await vi.runAllTimersAsync();
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(updatedHandler).toHaveBeenCalledTimes(1);
    });

    it("clears debounce timer on stop()", async () => {
      vi.useFakeTimers();
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 100, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = { default: { name: "NewBot" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);

      // Trigger change then immediately stop
      (watcher as unknown as { handleChange: () => void }).handleChange();
      await watcher.stop();

      // Advance past debounce — should NOT fire
      vi.advanceTimersByTime(200);
      await vi.runAllTimersAsync();
      vi.useRealTimers();

      expect(updatedHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Identity-specific edge cases
  // -------------------------------------------------------------------------

  describe("identity-specific edge cases", () => {
    it("preserves empty string name as intentional override after reload", async () => {
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());

      const newIdentity = { default: { name: "" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(watcher.getIdentity()?.default?.name).toBe("");
    });

    it("detects systemPromptPrefix change", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = {
        ...DEFAULT_IDENTITY,
        default: { ...DEFAULT_IDENTITY.default, systemPromptPrefix: "New prompt prefix." },
      };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()?.default?.systemPromptPrefix).toBe("New prompt prefix.");
    });

    it("detects channel removed from identity.channels", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(IDENTITY_WITH_CHANNELS, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      // Remove discord channel
      const newIdentity = {
        default: IDENTITY_WITH_CHANNELS.default,
        channels: { slack: IDENTITY_WITH_CHANNELS.channels?.slack },
      };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      const identity = watcher.getIdentity();
      expect(identity?.channels?.slack).toBeDefined();
      expect(identity?.channels?.discord).toBeUndefined();
    });

    it("detects default changed while channels unchanged", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(IDENTITY_WITH_CHANNELS, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = {
        default: { name: "UpdatedBot", avatar: "https://cdn.example.com/bot.png" },
        channels: IDENTITY_WITH_CHANNELS.channels,
      };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()?.default?.name).toBe("UpdatedBot");
    });

    it("handles config with only channels (no default)", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(undefined, 10, createMockDeps());
      watcher.onUpdated(updatedHandler);

      const newIdentity = {
        channels: { slack: { name: "SlackOnly" } },
      };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()?.default).toBeUndefined();
      expect(watcher.getIdentity()?.channels?.slack?.name).toBe("SlackOnly");
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("lifecycle", () => {
    it("stop() cleans up watcher and clears events", async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      const mockOn = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, {
        watch: () => ({ on: mockOn, close: mockClose }),
        parseYaml: testParseYaml,
      });

      await watcher.watch(manifestPath);
      await watcher.stop();

      expect(mockClose).toHaveBeenCalled();
    });

    it("can re-watch after stop", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());

      await watcher.watch(manifestPath);
      await watcher.stop();

      // Re-watch and reload
      watcher.onUpdated(updatedHandler);
      const newIdentity = { default: { name: "AfterRestart" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).toHaveBeenCalledTimes(1);
      expect(watcher.getIdentity()?.default?.name).toBe("AfterRestart");
    });

    it("throws if watch() called twice without stop()", async () => {
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      await watcher.watch(manifestPath);

      await expect(watcher.watch(manifestPath)).rejects.toThrow(
        "Already watching. Call stop() before watching a new path.",
      );
    });

    it("throws if manifestPath is not absolute", async () => {
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());

      await expect(watcher.watch("relative/path.yaml")).rejects.toThrow(
        "manifestPath must be an absolute path",
      );
    });

    it("disposer from onUpdated unsubscribes correctly", async () => {
      const updatedHandler = vi.fn();
      const watcher = new IdentityConfigWatcher(DEFAULT_IDENTITY, 10, createMockDeps());
      const dispose = watcher.onUpdated(updatedHandler);

      // Dispose before triggering reload
      dispose();

      const newIdentity = { default: { name: "AfterDispose" } };
      await writeFile(manifestPath, manifestYaml(newIdentity));

      await watcher.watch(manifestPath);
      await watcher.triggerReload();

      expect(updatedHandler).not.toHaveBeenCalled();
    });
  });
});
