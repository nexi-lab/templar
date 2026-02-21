/**
 * E2E test for @nexus/sdk Subscriptions (Webhook Notifications) API
 *
 * Requires a running Nexus server on localhost:2028 with:
 * - Subscriptions feature enabled
 * - Open access mode (no auth) or a valid API key
 *
 * Run with: NEXUS_E2E=1 npx vitest run src/__tests__/e2e/subscriptions.e2e.test.ts
 *
 * Tests exercise the full subscription lifecycle:
 * create → get → list → update → test → delete
 *
 * Note: Server-side SSRF protection blocks private IPs (RFC 1918, loopback,
 * cloud metadata). We use https://httpbin.org/post as the webhook URL for
 * E2E tests since the non-routable TEST-NET ranges may also be blocked.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NexusClient } from "../../client.js";
import type { Subscription } from "../../types/subscriptions.js";

const BASE_URL = process.env.NEXUS_E2E_URL ?? "http://localhost:2028";
const API_KEY = process.env.NEXUS_E2E_KEY ?? "sk-test-e2e-subscriptions-key-1234";

const shouldRun = !!process.env.NEXUS_E2E;

describe.skipIf(!shouldRun)("Subscriptions E2E", () => {
  let client: NexusClient;
  let createdSubscription: Subscription;

  beforeAll(() => {
    client = new NexusClient({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      retry: { maxAttempts: 1 },
    });
  });

  afterAll(async () => {
    // Cleanup: delete the test subscription if it was created
    if (createdSubscription?.id) {
      try {
        await client.subscriptions.delete(createdSubscription.id);
      } catch {
        // Ignore cleanup errors — subscription may already be deleted by test
      }
    }
  });

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------

  describe("create()", () => {
    it("should create a subscription with required fields only", async () => {
      createdSubscription = await client.subscriptions.create({
        url: "https://httpbin.org/post",
        event_types: ["file_write", "file_delete"],
        name: `e2e-test-${Date.now()}`,
        description: "SDK E2E test subscription",
      });

      expect(createdSubscription.id).toBeDefined();
      expect(createdSubscription.url).toBe("https://httpbin.org/post");
      expect(createdSubscription.event_types).toEqual(
        expect.arrayContaining(["file_write", "file_delete"]),
      );
      expect(createdSubscription.enabled).toBe(true);
      expect(createdSubscription.consecutive_failures).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe("get()", () => {
    it("should get the created subscription by ID", async () => {
      const sub = await client.subscriptions.get(createdSubscription.id);

      expect(sub.id).toBe(createdSubscription.id);
      expect(sub.url).toBe(createdSubscription.url);
      expect(sub.name).toBe(createdSubscription.name);
    });

    it("should throw for nonexistent subscription", async () => {
      await expect(client.subscriptions.get("nonexistent-id-00000")).rejects.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // list()
  // -----------------------------------------------------------------------

  describe("list()", () => {
    it("should list subscriptions including the created one", async () => {
      const result = await client.subscriptions.list();

      expect(result.subscriptions).toBeInstanceOf(Array);
      expect(result.subscriptions.length).toBeGreaterThanOrEqual(1);

      const found = result.subscriptions.find((s) => s.id === createdSubscription.id);
      expect(found).toBeDefined();
    });

    it("should paginate with limit and offset", async () => {
      const page1 = await client.subscriptions.list({ limit: 1 });
      expect(page1.subscriptions).toHaveLength(1);

      const page2 = await client.subscriptions.list({ limit: 1, offset: 1 });
      // May have 0 or more results depending on total count
      expect(page2.subscriptions.length).toBeLessThanOrEqual(1);
    });

    it("should filter by enabled_only", async () => {
      const result = await client.subscriptions.list({ enabled_only: true });

      for (const sub of result.subscriptions) {
        expect(sub.enabled).toBe(true);
      }
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------

  describe("update()", () => {
    it("should update the subscription name", async () => {
      const newName = `e2e-updated-${Date.now()}`;
      const updated = await client.subscriptions.update(createdSubscription.id, {
        name: newName,
      });

      expect(updated.id).toBe(createdSubscription.id);
      expect(updated.name).toBe(newName);
    });

    it("should disable and re-enable a subscription", async () => {
      const disabled = await client.subscriptions.update(createdSubscription.id, {
        enabled: false,
      });
      expect(disabled.enabled).toBe(false);

      const reenabled = await client.subscriptions.update(createdSubscription.id, {
        enabled: true,
      });
      expect(reenabled.enabled).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // test()
  // -----------------------------------------------------------------------

  describe("test()", () => {
    it("should test webhook delivery", async () => {
      const result = await client.subscriptions.test(createdSubscription.id);

      expect(result.subscription_id).toBe(createdSubscription.id);
      expect(result.event_id).toBeDefined();
      // httpbin.org/post should accept the webhook, so success is likely
      // but we don't assert success=true since network conditions vary
      expect(typeof result.success).toBe("boolean");
    });
  });

  // -----------------------------------------------------------------------
  // delete()
  // -----------------------------------------------------------------------

  describe("delete()", () => {
    it("should delete the subscription", async () => {
      const result = await client.subscriptions.delete(createdSubscription.id);
      expect(result.deleted).toBe(true);

      // Verify it's gone
      await expect(client.subscriptions.get(createdSubscription.id)).rejects.toThrow();

      // Prevent afterAll cleanup from trying to delete again
      createdSubscription = undefined as unknown as Subscription;
    });
  });
});
