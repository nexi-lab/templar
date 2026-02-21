/**
 * Subscription types — mirrors Nexus subscriptions API contract
 *
 * Issue #222: Webhook Notifications API (outbound event delivery)
 * Nexus API: /api/v2/subscriptions/*
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * File system event types that can trigger webhook delivery.
 *
 * Uses union + string escape hatch: known types get autocomplete,
 * but unknown types (added server-side) are accepted without SDK update.
 */
export type FileEventType =
  | "file_write"
  | "file_delete"
  | "file_rename"
  | "metadata_change"
  | "dir_create"
  | "dir_delete"
  | (string & {});

/**
 * Delivery status for a webhook subscription.
 */
export type DeliveryStatus = "success" | "failed";

// ============================================================================
// REQUEST PARAMS
// ============================================================================

/**
 * Parameters for creating a new webhook subscription.
 */
export interface CreateSubscriptionParams {
  /** Webhook URL (must be http or https; SSRF-protected server-side) */
  readonly url: string;

  /** Event types to subscribe to (default: ["file_write", "file_delete", "file_rename"]) */
  readonly event_types?: readonly FileEventType[];

  /** Glob patterns to filter file paths (e.g., ["/workspace/**\/*", "*.txt"]) */
  readonly patterns?: readonly string[];

  /** HMAC-SHA256 secret for payload signing */
  readonly secret?: string;

  /** Human-readable subscription name */
  readonly name?: string;

  /** Description of the subscription's purpose */
  readonly description?: string;

  /** Custom metadata included in webhook payloads */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Parameters for updating an existing webhook subscription.
 *
 * All fields are optional — only provided fields are updated.
 */
export interface UpdateSubscriptionParams {
  /** Update webhook URL */
  readonly url?: string;

  /** Update subscribed event types */
  readonly event_types?: readonly FileEventType[];

  /** Update file path patterns */
  readonly patterns?: readonly string[];

  /** Update HMAC secret */
  readonly secret?: string;

  /** Update subscription name */
  readonly name?: string;

  /** Update description */
  readonly description?: string;

  /** Update custom metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;

  /** Enable or disable the subscription (re-enabling resets failure counter) */
  readonly enabled?: boolean;
}

/**
 * Parameters for listing subscriptions with optional filters.
 *
 * Uses offset-based pagination (not cursor-based).
 */
export interface ListSubscriptionsParams {
  /** Filter to show only enabled subscriptions (default: false = show all) */
  readonly enabled_only?: boolean;

  /** Page size (default: 100) */
  readonly limit?: number;

  /** Offset for pagination (default: 0) */
  readonly offset?: number;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

/**
 * A webhook subscription record.
 */
export interface Subscription {
  /** Unique subscription identifier (UUID) */
  readonly id: string;

  /** Zone ID for multi-tenant isolation */
  readonly zone_id: string;

  /** Webhook URL */
  readonly url: string;

  /** Subscribed event types */
  readonly event_types: readonly string[];

  /** File path glob patterns (null if not filtered) */
  readonly patterns: readonly string[] | null;

  /** Human-readable subscription name */
  readonly name: string | null;

  /** Description */
  readonly description: string | null;

  /** Custom metadata included in webhook payloads */
  readonly metadata: Readonly<Record<string, unknown>> | null;

  /** Whether the subscription is active */
  readonly enabled: boolean;

  /** Timestamp of last delivery attempt (ISO-8601, null if never delivered) */
  readonly last_delivery_at: string | null;

  /** Status of last delivery ("success" or "failed", null if never delivered) */
  readonly last_delivery_status: DeliveryStatus | null;

  /** Count of consecutive delivery failures (auto-disables at 10) */
  readonly consecutive_failures: number;

  /** Creation timestamp (ISO-8601) */
  readonly created_at: string;

  /** Last update timestamp (ISO-8601) */
  readonly updated_at: string;

  /** Creator ID (user or agent) */
  readonly created_by: string | null;
}

/**
 * List of subscriptions.
 */
export interface SubscriptionListResponse {
  /** List of subscriptions */
  readonly subscriptions: readonly Subscription[];
}

/**
 * Response from deleting a webhook subscription.
 */
export interface DeleteSubscriptionResponse {
  /** Whether the subscription was deleted */
  readonly deleted: boolean;
}

/**
 * Response from testing a webhook subscription.
 */
export interface TestWebhookResponse {
  /** Whether the test webhook was delivered successfully */
  readonly success: boolean;

  /** Unique event ID for the test delivery */
  readonly event_id: string;

  /** Subscription ID that was tested */
  readonly subscription_id: string;
}
