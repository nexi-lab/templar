import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import { SubscriptionsResource } from "../../resources/subscriptions.js";
import type {
  DeleteSubscriptionResponse,
  Subscription,
  SubscriptionListResponse,
  TestWebhookResponse,
} from "../../types/subscriptions.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SUBSCRIPTION: Subscription = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  zone_id: "root",
  url: "https://example.com/webhooks",
  event_types: ["file_write", "file_delete"],
  patterns: ["/workspace/**/*"],
  name: "Production webhook",
  description: "Notifies on file changes",
  metadata: { team: "platform" },
  enabled: true,
  last_delivery_at: null,
  last_delivery_status: null,
  consecutive_failures: 0,
  created_at: "2026-02-20T10:00:00+00:00",
  updated_at: "2026-02-20T10:00:00+00:00",
  created_by: "user-42",
};

const MOCK_SUBSCRIPTION_MINIMAL: Subscription = {
  id: "660e8400-e29b-41d4-a716-446655440001",
  zone_id: "root",
  url: "https://example.com/hooks",
  event_types: ["file_write", "file_delete", "file_rename"],
  patterns: null,
  name: null,
  description: null,
  metadata: null,
  enabled: true,
  last_delivery_at: null,
  last_delivery_status: null,
  consecutive_failures: 0,
  created_at: "2026-02-20T11:00:00+00:00",
  updated_at: "2026-02-20T11:00:00+00:00",
  created_by: null,
};

function mockJsonResponse<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubscriptionsResource", () => {
  let client: NexusClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new NexusClient({
      apiKey: "test-key",
      baseUrl: "https://api.test.com",
      retry: { maxAttempts: 1 },
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // initialization
  // -----------------------------------------------------------------------

  describe("initialization", () => {
    it("should expose subscriptions resource on client", () => {
      expect(client.subscriptions).toBeInstanceOf(SubscriptionsResource);
    });
  });

  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------

  describe("create()", () => {
    it("should create a subscription with all fields", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_SUBSCRIPTION, 201));

      const result = await client.subscriptions.create({
        url: "https://example.com/webhooks",
        event_types: ["file_write", "file_delete"],
        patterns: ["/workspace/**/*"],
        secret: "whsec_test-secret",
        name: "Production webhook",
        description: "Notifies on file changes",
        metadata: { team: "platform" },
      });

      expect(result).toEqual(MOCK_SUBSCRIPTION);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/subscriptions",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should send request body as JSON", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_SUBSCRIPTION_MINIMAL, 201));

      await client.subscriptions.create({
        url: "https://example.com/hooks",
      });

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.url).toBe("https://example.com/hooks");
    });

    it("should include event_types array in request body", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_SUBSCRIPTION, 201));

      await client.subscriptions.create({
        url: "https://example.com/webhooks",
        event_types: ["file_write", "file_delete"],
      });

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.event_types).toEqual(["file_write", "file_delete"]);
    });

    it("should omit optional fields when not provided", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_SUBSCRIPTION_MINIMAL, 201));

      await client.subscriptions.create({
        url: "https://example.com/hooks",
      });

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.url).toBe("https://example.com/hooks");
      expect(body.secret).toBeUndefined();
      expect(body.name).toBeUndefined();
      expect(body.patterns).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // list()
  // -----------------------------------------------------------------------

  describe("list()", () => {
    it("should list subscriptions with no params", async () => {
      const response: SubscriptionListResponse = {
        subscriptions: [MOCK_SUBSCRIPTION],
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.subscriptions.list();

      expect(result).toEqual(response);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/subscriptions",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should pass all filter parameters as query strings", async () => {
      const response: SubscriptionListResponse = {
        subscriptions: [],
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.subscriptions.list({
        enabled_only: true,
        limit: 50,
        offset: 10,
      });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get("enabled_only")).toBe("true");
      expect(url.searchParams.get("limit")).toBe("50");
      expect(url.searchParams.get("offset")).toBe("10");
    });

    it("should omit undefined parameters from query", async () => {
      const response: SubscriptionListResponse = {
        subscriptions: [],
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.subscriptions.list({ enabled_only: true });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get("enabled_only")).toBe("true");
      expect(url.searchParams.has("limit")).toBe(false);
      expect(url.searchParams.has("offset")).toBe(false);
    });

    it("should handle multiple subscriptions in response", async () => {
      const response: SubscriptionListResponse = {
        subscriptions: [MOCK_SUBSCRIPTION, MOCK_SUBSCRIPTION_MINIMAL],
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.subscriptions.list();

      expect(result.subscriptions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe("get()", () => {
    it("should get a single subscription by ID", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_SUBSCRIPTION));

      const result = await client.subscriptions.get(MOCK_SUBSCRIPTION.id);

      expect(result).toEqual(MOCK_SUBSCRIPTION);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v2/subscriptions/${MOCK_SUBSCRIPTION.id}`,
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should URL-encode the subscription ID", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_SUBSCRIPTION));

      await client.subscriptions.get("id/with special&chars");

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("id%2Fwith%20special%26chars");
    });

    it("should throw on 404", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "NOT_FOUND", message: "Subscription not found" }, 404),
        );

      await expect(client.subscriptions.get("nonexistent")).rejects.toThrow(
        "Subscription not found",
      );
    });
  });

  // -----------------------------------------------------------------------
  // update()
  // -----------------------------------------------------------------------

  describe("update()", () => {
    it("should update a subscription with PATCH", async () => {
      const updated = { ...MOCK_SUBSCRIPTION, url: "https://new.example.com/hooks" };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(updated));

      const result = await client.subscriptions.update(MOCK_SUBSCRIPTION.id, {
        url: "https://new.example.com/hooks",
      });

      expect(result.url).toBe("https://new.example.com/hooks");
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v2/subscriptions/${MOCK_SUBSCRIPTION.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });

    it("should send partial update body", async () => {
      const updated = { ...MOCK_SUBSCRIPTION, enabled: false };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(updated));

      await client.subscriptions.update(MOCK_SUBSCRIPTION.id, {
        enabled: false,
      });

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.enabled).toBe(false);
      expect(body.url).toBeUndefined();
    });

    it("should update event_types array", async () => {
      const updated = { ...MOCK_SUBSCRIPTION, event_types: ["file_write"] };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(updated));

      await client.subscriptions.update(MOCK_SUBSCRIPTION.id, {
        event_types: ["file_write"],
      });

      const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.event_types).toEqual(["file_write"]);
    });
  });

  // -----------------------------------------------------------------------
  // delete()
  // -----------------------------------------------------------------------

  describe("delete()", () => {
    it("should delete a subscription and return confirmation", async () => {
      const response: DeleteSubscriptionResponse = { deleted: true };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.subscriptions.delete(MOCK_SUBSCRIPTION.id);

      expect(result.deleted).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v2/subscriptions/${MOCK_SUBSCRIPTION.id}`,
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("should throw on 404 for nonexistent subscription", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "NOT_FOUND", message: "Subscription not found" }, 404),
        );

      await expect(client.subscriptions.delete("nonexistent")).rejects.toThrow(
        "Subscription not found",
      );
    });
  });

  // -----------------------------------------------------------------------
  // test()
  // -----------------------------------------------------------------------

  describe("test()", () => {
    it("should test a subscription and return success", async () => {
      const response: TestWebhookResponse = {
        success: true,
        event_id: "evt_test_abc123",
        subscription_id: MOCK_SUBSCRIPTION.id,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.subscriptions.test(MOCK_SUBSCRIPTION.id);

      expect(result.success).toBe(true);
      expect(result.event_id).toBe("evt_test_abc123");
      expect(result.subscription_id).toBe(MOCK_SUBSCRIPTION.id);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v2/subscriptions/${MOCK_SUBSCRIPTION.id}/test`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should handle failed test delivery", async () => {
      const response: TestWebhookResponse = {
        success: false,
        event_id: "evt_test_def456",
        subscription_id: MOCK_SUBSCRIPTION.id,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.subscriptions.test(MOCK_SUBSCRIPTION.id);

      expect(result.success).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // verifySignature()
  // -----------------------------------------------------------------------

  describe("verifySignature()", () => {
    // Known test vector: HMAC-SHA256("test payload", "test-secret")
    const TEST_PAYLOAD = "test payload";
    const TEST_SECRET = "test-secret";
    const TEST_SIGNATURE =
      "sha256=2f94a757d2246073e26781d117ce0183ebd87b4d66c460494376d5c37d71985b";

    it("should return true for valid signature", () => {
      const result = SubscriptionsResource.verifySignature(
        TEST_PAYLOAD,
        TEST_SECRET,
        TEST_SIGNATURE,
      );
      expect(result).toBe(true);
    });

    it("should return false for wrong secret", () => {
      const result = SubscriptionsResource.verifySignature(
        TEST_PAYLOAD,
        "wrong-secret",
        TEST_SIGNATURE,
      );
      expect(result).toBe(false);
    });

    it("should return false for tampered payload", () => {
      const result = SubscriptionsResource.verifySignature(
        "tampered payload",
        TEST_SECRET,
        TEST_SIGNATURE,
      );
      expect(result).toBe(false);
    });

    it("should return false for malformed signature header", () => {
      const result = SubscriptionsResource.verifySignature(
        TEST_PAYLOAD,
        TEST_SECRET,
        "not-a-valid-signature",
      );
      expect(result).toBe(false);
    });

    it("should handle Buffer payload", () => {
      const result = SubscriptionsResource.verifySignature(
        Buffer.from(TEST_PAYLOAD),
        TEST_SECRET,
        TEST_SIGNATURE,
      );
      expect(result).toBe(true);
    });

    it("should return false for undefined signature header", () => {
      const result = SubscriptionsResource.verifySignature(TEST_PAYLOAD, TEST_SECRET, undefined);
      expect(result).toBe(false);
    });

    it("should return false for empty signature header", () => {
      const result = SubscriptionsResource.verifySignature(TEST_PAYLOAD, TEST_SECRET, "");
      expect(result).toBe(false);
    });

    it("should return false for wrong algorithm prefix", () => {
      const result = SubscriptionsResource.verifySignature(
        TEST_PAYLOAD,
        TEST_SECRET,
        "md5=2f94a757d2246073e26781d117ce0183ebd87b4d66c460494376d5c37d71985b",
      );
      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe("error handling", () => {
    it("should propagate 500 errors", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "INTERNAL_ERROR", message: "Internal server error" }, 500),
        );

      await expect(client.subscriptions.list()).rejects.toThrow("Internal server error");
    });

    it("should propagate 401 unauthorized", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "UNAUTHORIZED", message: "Invalid API key" }, 401),
        );

      await expect(client.subscriptions.create({ url: "https://x.com" })).rejects.toThrow(
        "Invalid API key",
      );
    });
  });
});
