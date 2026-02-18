import { ChannelSendError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import {
  type DiscordWebhookInfo,
  sanitizeWebhookUsername,
  WebhookManager,
  type WebhookManagerDeps,
} from "../../webhook-manager.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWebhook(overrides: Partial<DiscordWebhookInfo> = {}): DiscordWebhookInfo {
  return {
    id: overrides.id ?? "wh-001",
    token: overrides.token ?? "wh-token-001",
    owner: overrides.owner ?? { id: "bot-001" },
    name: overrides.name ?? "Templar",
    send: vi.fn().mockResolvedValue({ id: "sent-001" }),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<WebhookManagerDeps> = {}): WebhookManagerDeps {
  return {
    fetchWebhooks: vi.fn().mockResolvedValue([]),
    createWebhook: vi.fn().mockResolvedValue(createMockWebhook()),
    botUserId: "bot-001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sanitizeWebhookUsername
// ---------------------------------------------------------------------------

describe("sanitizeWebhookUsername", () => {
  it("strips 'clyde' substring (case-insensitive)", () => {
    expect(sanitizeWebhookUsername("MyClydeBot")).toBe("MyBot");
    expect(sanitizeWebhookUsername("CLYDE helper")).toBe("helper");
  });

  it("strips 'discord' substring (case-insensitive)", () => {
    expect(sanitizeWebhookUsername("DiscordHelper")).toBe("Helper");
    expect(sanitizeWebhookUsername("My DISCORD Bot")).toBe("My  Bot");
  });

  it("truncates to 80 characters", () => {
    const longName = "A".repeat(100);
    expect(sanitizeWebhookUsername(longName)).toHaveLength(80);
  });

  it("returns fallback 'Agent' when empty after sanitization", () => {
    expect(sanitizeWebhookUsername("clyde")).toBe("Agent");
    expect(sanitizeWebhookUsername("discord")).toBe("Agent");
    expect(sanitizeWebhookUsername("   ")).toBe("Agent");
  });

  it("preserves valid names unchanged", () => {
    expect(sanitizeWebhookUsername("Research Bot")).toBe("Research Bot");
    expect(sanitizeWebhookUsername("Alex")).toBe("Alex");
  });
});

// ---------------------------------------------------------------------------
// WebhookManager
// ---------------------------------------------------------------------------

describe("WebhookManager", () => {
  // -----------------------------------------------------------------------
  // Cache hit
  // -----------------------------------------------------------------------

  describe("cache hit", () => {
    it("returns cached webhook on second call without API call", async () => {
      const deps = createMockDeps();
      const manager = new WebhookManager(deps);

      const first = await manager.getOrCreate("ch-001");
      const second = await manager.getOrCreate("ch-001");

      expect(first).toBe(second);
      expect(deps.fetchWebhooks).toHaveBeenCalledTimes(1);
    });

    it("caches different webhooks per channel", async () => {
      const webhook1 = createMockWebhook({ id: "wh-001" });
      const webhook2 = createMockWebhook({ id: "wh-002" });

      const deps = createMockDeps({
        createWebhook: vi.fn().mockResolvedValueOnce(webhook1).mockResolvedValueOnce(webhook2),
      });
      const manager = new WebhookManager(deps);

      const first = await manager.getOrCreate("ch-001");
      const second = await manager.getOrCreate("ch-002");

      expect(first).not.toBe(second);
      expect(deps.fetchWebhooks).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // Cache miss → find existing
  // -----------------------------------------------------------------------

  describe("cache miss — find existing webhook", () => {
    it("finds webhook owned by bot from existing webhooks", async () => {
      const ownedWebhook = createMockWebhook({ owner: { id: "bot-001" }, token: "valid" });
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockResolvedValue([ownedWebhook]),
      });
      const manager = new WebhookManager(deps);

      const result = await manager.getOrCreate("ch-001");

      expect(result).toBe(ownedWebhook);
      expect(deps.createWebhook).not.toHaveBeenCalled();
    });

    it("filters out webhooks owned by other users", async () => {
      const otherWebhook = createMockWebhook({ owner: { id: "other-user" } });
      const ownedWebhook = createMockWebhook({ owner: { id: "bot-001" }, token: "valid" });
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockResolvedValue([otherWebhook, ownedWebhook]),
      });
      const manager = new WebhookManager(deps);

      const result = await manager.getOrCreate("ch-001");

      expect(result).toBe(ownedWebhook);
    });

    it("skips webhooks with null token (channel follower type)", async () => {
      const followerWebhook = createMockWebhook({
        owner: { id: "bot-001" },
        token: null,
      });
      const newWebhook = createMockWebhook({ id: "wh-new" });
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockResolvedValue([followerWebhook]),
        createWebhook: vi.fn().mockResolvedValue(newWebhook),
      });
      const manager = new WebhookManager(deps);

      const result = await manager.getOrCreate("ch-001");

      expect(result).toBe(newWebhook);
      expect(deps.createWebhook).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Cache miss → create new
  // -----------------------------------------------------------------------

  describe("cache miss — create new webhook", () => {
    it("creates webhook when none exist for channel", async () => {
      const newWebhook = createMockWebhook();
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockResolvedValue([]),
        createWebhook: vi.fn().mockResolvedValue(newWebhook),
      });
      const manager = new WebhookManager(deps);

      const result = await manager.getOrCreate("ch-001");

      expect(result).toBe(newWebhook);
      expect(deps.createWebhook).toHaveBeenCalledWith("ch-001", "Templar");
    });

    it("uses custom webhookName when provided", async () => {
      const deps = createMockDeps();
      const manager = new WebhookManager(deps, "Research Bot");

      await manager.getOrCreate("ch-001");

      expect(deps.createWebhook).toHaveBeenCalledWith("ch-001", "Research Bot");
    });

    it("caches newly created webhook", async () => {
      const newWebhook = createMockWebhook();
      const deps = createMockDeps({
        createWebhook: vi.fn().mockResolvedValue(newWebhook),
      });
      const manager = new WebhookManager(deps);

      await manager.getOrCreate("ch-001");
      const second = await manager.getOrCreate("ch-001");

      expect(second).toBe(newWebhook);
      expect(deps.createWebhook).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Cache invalidation
  // -----------------------------------------------------------------------

  describe("cache invalidation", () => {
    it("invalidate() removes specific channel entry", async () => {
      const deps = createMockDeps();
      const manager = new WebhookManager(deps);

      await manager.getOrCreate("ch-001");
      manager.invalidate("ch-001");
      await manager.getOrCreate("ch-001");

      expect(deps.fetchWebhooks).toHaveBeenCalledTimes(2);
    });

    it("clear() empties entire cache", async () => {
      const deps = createMockDeps();
      const manager = new WebhookManager(deps);

      await manager.getOrCreate("ch-001");
      await manager.getOrCreate("ch-002");
      manager.clear();
      await manager.getOrCreate("ch-001");

      expect(deps.fetchWebhooks).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // Error: permission denied
  // -----------------------------------------------------------------------

  describe("error — permission denied", () => {
    it("throws ChannelSendError when fetchWebhooks lacks permission", async () => {
      const permError = Object.assign(new Error("Missing Permissions"), { code: 50013 });
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockRejectedValue(permError),
      });
      const manager = new WebhookManager(deps);

      await expect(manager.getOrCreate("ch-001")).rejects.toThrow(ChannelSendError);
      await expect(manager.getOrCreate("ch-001")).rejects.toThrow(/MANAGE_WEBHOOKS/);
    });

    it("throws ChannelSendError when createWebhook lacks permission", async () => {
      const permError = Object.assign(new Error("Missing Permissions"), { code: 50013 });
      const deps = createMockDeps({
        createWebhook: vi.fn().mockRejectedValue(permError),
      });
      const manager = new WebhookManager(deps);

      await expect(manager.getOrCreate("ch-001")).rejects.toThrow(ChannelSendError);
    });
  });

  // -----------------------------------------------------------------------
  // Error: webhook limit (30007)
  // -----------------------------------------------------------------------

  describe("error — webhook limit", () => {
    it("throws ChannelSendError with descriptive message for max webhooks", async () => {
      const limitError = Object.assign(new Error("Max webhooks"), { code: 30007 });
      const deps = createMockDeps({
        createWebhook: vi.fn().mockRejectedValue(limitError),
      });
      const manager = new WebhookManager(deps);

      await expect(manager.getOrCreate("ch-001")).rejects.toThrow(/maximum webhook limit/i);
    });
  });

  // -----------------------------------------------------------------------
  // Error: 10015 Unknown Webhook
  // -----------------------------------------------------------------------

  describe("error — 10015 Unknown Webhook", () => {
    it("throws ChannelSendError with descriptive message", async () => {
      const unknownError = Object.assign(new Error("Unknown Webhook"), { code: 10015 });
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockRejectedValue(unknownError),
      });
      const manager = new WebhookManager(deps);

      await expect(manager.getOrCreate("ch-001")).rejects.toThrow(/no longer exists/);
    });

    it("preserves original error as cause", async () => {
      const unknownError = Object.assign(new Error("Unknown Webhook"), { code: 10015 });
      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockRejectedValue(unknownError),
      });
      const manager = new WebhookManager(deps);

      try {
        await manager.getOrCreate("ch-001");
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ChannelSendError);
        expect((err as ChannelSendError).cause).toBe(unknownError);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Concurrency dedup
  // -----------------------------------------------------------------------

  describe("concurrency dedup", () => {
    it("deduplicates concurrent getOrCreate for same channel", async () => {
      const newWebhook = createMockWebhook();
      const deps = createMockDeps({
        createWebhook: vi.fn().mockResolvedValue(newWebhook),
      });
      const manager = new WebhookManager(deps);

      // Fire two concurrent requests for the same channel
      const [result1, result2] = await Promise.all([
        manager.getOrCreate("ch-001"),
        manager.getOrCreate("ch-001"),
      ]);

      expect(result1).toBe(result2);
      expect(deps.fetchWebhooks).toHaveBeenCalledTimes(1);
    });

    it("allows parallel execution for different channels", async () => {
      let resolveFirst!: (value: DiscordWebhookInfo) => void;
      const firstPromise = new Promise<DiscordWebhookInfo>((resolve) => {
        resolveFirst = resolve;
      });

      const webhook1 = createMockWebhook({ id: "wh-001" });
      const webhook2 = createMockWebhook({ id: "wh-002" });

      const deps = createMockDeps({
        fetchWebhooks: vi.fn().mockResolvedValue([]),
        createWebhook: vi.fn().mockReturnValueOnce(firstPromise).mockResolvedValueOnce(webhook2),
      });
      const manager = new WebhookManager(deps);

      const p1 = manager.getOrCreate("ch-001");
      const p2 = manager.getOrCreate("ch-002");

      // Channel 2 should resolve independently
      const result2 = await p2;
      expect(result2).toBe(webhook2);

      // Now resolve channel 1
      resolveFirst(webhook1);
      const result1 = await p1;
      expect(result1).toBe(webhook1);

      expect(deps.fetchWebhooks).toHaveBeenCalledTimes(2);
    });
  });
});
