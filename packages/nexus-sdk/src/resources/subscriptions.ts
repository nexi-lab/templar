/**
 * Subscriptions resource for managing webhook notifications
 *
 * Issue #222: Webhook Notifications API (outbound event delivery).
 * Wraps Nexus API: /api/v2/subscriptions/*
 *
 * Subscriptions are zone-scoped (enforced server-side via auth).
 * Webhook payloads are HMAC-SHA256 signed when a secret is configured.
 * Subscriptions auto-disable after 10 consecutive delivery failures.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CreateSubscriptionParams,
  DeleteSubscriptionResponse,
  ListSubscriptionsParams,
  Subscription,
  SubscriptionListResponse,
  TestWebhookResponse,
  UpdateSubscriptionParams,
} from "../types/subscriptions.js";
import { BaseResource } from "./base.js";

const BASE_PATH = "/api/v2/subscriptions";

/**
 * Resource for managing webhook subscriptions
 *
 * Provides full CRUD operations for webhook subscriptions plus
 * a test endpoint for verifying delivery and a static helper
 * for signature verification.
 *
 * @example
 * ```typescript
 * // Create a webhook subscription
 * const sub = await client.subscriptions.create({
 *   url: "https://example.com/webhooks",
 *   event_types: ["file_write", "file_delete"],
 *   secret: "whsec_my-signing-secret",
 * });
 *
 * // List all subscriptions
 * const subs = await client.subscriptions.list();
 *
 * // Test a subscription
 * const result = await client.subscriptions.test(sub.id);
 * console.log(result.success); // true or false
 *
 * // Verify a webhook signature in your handler
 * const isValid = SubscriptionsResource.verifySignature(
 *   rawBody,
 *   "whsec_my-signing-secret",
 *   request.headers["x-nexus-signature"],
 * );
 * ```
 */
export class SubscriptionsResource extends BaseResource {
  /**
   * Create a new webhook subscription.
   *
   * The subscription will begin receiving events matching the specified
   * event types and patterns as soon as it is created.
   *
   * @param params - Subscription configuration
   * @returns The created subscription
   *
   * @example
   * ```typescript
   * const sub = await client.subscriptions.create({
   *   url: "https://example.com/webhooks",
   *   event_types: ["file_write", "file_delete"],
   *   patterns: ["/workspace/**\/*"],
   *   secret: "whsec_my-signing-secret",
   *   name: "Production webhook",
   * });
   * ```
   */
  async create(params: CreateSubscriptionParams): Promise<Subscription> {
    return this.http.request<Subscription>(BASE_PATH, {
      method: "POST",
      body: params,
    });
  }

  /**
   * List webhook subscriptions with optional filters and offset-based pagination.
   *
   * @param params - Optional filter and pagination parameters
   * @returns List of subscriptions
   *
   * @example
   * ```typescript
   * // List all enabled subscriptions
   * const result = await client.subscriptions.list({ enabled_only: true });
   *
   * // Paginate with offset
   * const page2 = await client.subscriptions.list({ limit: 10, offset: 10 });
   * ```
   */
  async list(params?: ListSubscriptionsParams): Promise<SubscriptionListResponse> {
    const query = this.buildQuery(
      params
        ? {
            enabled_only: params.enabled_only,
            limit: params.limit,
            offset: params.offset,
          }
        : undefined,
    );
    return this.http.request<SubscriptionListResponse>(BASE_PATH, {
      method: "GET",
      ...(query ? { query } : {}),
    });
  }

  /**
   * Get a single webhook subscription by ID.
   *
   * Returns 404 if the subscription doesn't exist or belongs to a different zone.
   *
   * @param subscriptionId - The subscription UUID
   * @returns The subscription record
   *
   * @example
   * ```typescript
   * const sub = await client.subscriptions.get("550e8400-e29b-41d4-a716-446655440000");
   * console.log(sub.enabled); // true
   * console.log(sub.consecutive_failures); // 0
   * ```
   */
  async get(subscriptionId: string): Promise<Subscription> {
    return this.http.request<Subscription>(`${BASE_PATH}/${encodeURIComponent(subscriptionId)}`, {
      method: "GET",
    });
  }

  /**
   * Update an existing webhook subscription.
   *
   * Only provided fields are updated. Re-enabling a disabled subscription
   * resets the consecutive failure counter.
   *
   * @param subscriptionId - The subscription UUID
   * @param params - Fields to update
   * @returns The updated subscription
   *
   * @example
   * ```typescript
   * // Disable a subscription
   * const updated = await client.subscriptions.update(sub.id, {
   *   enabled: false,
   * });
   *
   * // Update URL and event types
   * const updated2 = await client.subscriptions.update(sub.id, {
   *   url: "https://new-endpoint.example.com/webhooks",
   *   event_types: ["file_write"],
   * });
   * ```
   */
  async update(subscriptionId: string, params: UpdateSubscriptionParams): Promise<Subscription> {
    return this.http.request<Subscription>(`${BASE_PATH}/${encodeURIComponent(subscriptionId)}`, {
      method: "PATCH",
      body: params,
    });
  }

  /**
   * Delete a webhook subscription.
   *
   * The subscription will immediately stop receiving events.
   * Returns 404 if the subscription doesn't exist.
   *
   * @param subscriptionId - The subscription UUID
   *
   * @example
   * ```typescript
   * const result = await client.subscriptions.delete("550e8400-e29b-41d4-a716-446655440000");
   * console.log(result.deleted); // true
   * ```
   */
  async delete(subscriptionId: string): Promise<DeleteSubscriptionResponse> {
    return this.http.request<DeleteSubscriptionResponse>(
      `${BASE_PATH}/${encodeURIComponent(subscriptionId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Send a test webhook to verify delivery.
   *
   * Sends a synthetic event to the subscription's URL and reports
   * whether delivery was successful.
   *
   * @param subscriptionId - The subscription UUID
   * @returns Test delivery result
   *
   * @example
   * ```typescript
   * const result = await client.subscriptions.test(sub.id);
   * if (!result.success) {
   *   console.error("Webhook endpoint is not reachable");
   * }
   * ```
   */
  async test(subscriptionId: string): Promise<TestWebhookResponse> {
    return this.http.request<TestWebhookResponse>(
      `${BASE_PATH}/${encodeURIComponent(subscriptionId)}/test`,
      { method: "POST" },
    );
  }

  /**
   * Verify an incoming webhook signature (HMAC-SHA256).
   *
   * Uses timing-safe comparison to prevent side-channel attacks.
   * Call this in your webhook handler to verify that payloads
   * were sent by Nexus and not tampered with.
   *
   * @param payload - The raw request body (string or Buffer)
   * @param secret - The HMAC secret configured on the subscription
   * @param signatureHeader - The `X-Nexus-Signature` header value (format: "sha256=..."), or undefined
   * @returns true if the signature is valid
   *
   * @example
   * ```typescript
   * app.post("/webhooks", (req, res) => {
   *   const isValid = SubscriptionsResource.verifySignature(
   *     req.rawBody,
   *     process.env.WEBHOOK_SECRET,
   *     req.headers["x-nexus-signature"],
   *   );
   *   if (!isValid) {
   *     return res.status(401).send("Invalid signature");
   *   }
   *   // Process webhook...
   * });
   * ```
   */
  static verifySignature(
    payload: string | Buffer,
    secret: string,
    signatureHeader: string | undefined,
  ): boolean {
    if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
      return false;
    }

    const expectedSig = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

    const expectedBuf = Buffer.from(expectedSig, "utf-8");
    const receivedBuf = Buffer.from(signatureHeader, "utf-8");

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return timingSafeEqual(expectedBuf, receivedBuf);
  }
}
