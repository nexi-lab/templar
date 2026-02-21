/**
 * E2E test for @nexus/sdk Secrets Audit API
 *
 * Requires a running Nexus server on localhost:2028 with:
 * - Static API key: sk-test-e2e-secrets-audit-key-1234
 * - NEXUS_DATABASE_URL set (for record_store)
 * - 3 seeded audit events (credential_created, key_accessed, token_rotated)
 *
 * Run with: NEXUS_E2E=1 npx vitest run src/__tests__/e2e/secrets-audit.e2e.test.ts
 *
 * Note: get() and verifyIntegrity() by ID are skipped due to a known Nexus
 * server-side bug where single-record lookup returns 404 even for existing
 * records (list() works fine for the same IDs).
 */

import { beforeAll, describe, expect, it } from "vitest";
import { NexusClient } from "../../client.js";
import type { SecretsAuditEvent } from "../../types/secrets-audit.js";

const BASE_URL = "http://localhost:2028";
const API_KEY = "sk-test-e2e-secrets-audit-key-1234";

const shouldRun = !!process.env.NEXUS_E2E;

describe.skipIf(!shouldRun)("SecretsAudit E2E", () => {
  let client: NexusClient;
  let allEvents: readonly SecretsAuditEvent[];

  beforeAll(async () => {
    client = new NexusClient({
      apiKey: API_KEY,
      baseUrl: BASE_URL,
      retry: { maxAttempts: 1 },
    });
    // Discover actual events in the DB
    const result = await client.secretsAudit.list({ include_total: true });
    allEvents = result.events;
  });

  describe("list()", () => {
    it("should list all events with no params", async () => {
      const result = await client.secretsAudit.list();
      expect(result.events).toBeInstanceOf(Array);
      expect(result.events.length).toBeGreaterThanOrEqual(3);
      expect(result.limit).toBe(100);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
    });

    it("should filter by event_type and actor_id", async () => {
      const result = await client.secretsAudit.list({
        event_type: "credential_created",
        actor_id: "user-42",
      });
      expect(result.events.length).toBeGreaterThanOrEqual(1);
      expect(result.events[0]?.event_type).toBe("credential_created");
    });

    it("should paginate with limit and cursor", async () => {
      const page1 = await client.secretsAudit.list({ limit: 2 });
      expect(page1.events).toHaveLength(2);
      expect(page1.has_more).toBe(true);
      expect(page1.next_cursor).not.toBeNull();

      const page2 = await client.secretsAudit.list({
        limit: 2,
        cursor: page1.next_cursor ?? "",
      });
      expect(page2.events.length).toBeGreaterThanOrEqual(1);
    });

    it("should include total count when requested", async () => {
      const result = await client.secretsAudit.list({ include_total: true });
      expect(result.total).toBeGreaterThanOrEqual(3);
    });

    it("should filter by provider", async () => {
      const result = await client.secretsAudit.list({ provider: "github" });
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      for (const e of result.events) {
        expect(e.provider).toBe("github");
      }
    });

    it("should filter by token_family_id", async () => {
      const result = await client.secretsAudit.list({ token_family_id: "fam-xyz" });
      expect(result.events.length).toBeGreaterThanOrEqual(1);
      expect(result.events[0]?.event_type).toBe("token_rotated");
    });
  });

  describe("get()", () => {
    // Known Nexus server bug: get_event returns 404 for valid IDs
    it.skip("should get a single event by ID (skipped: server-side bug)", async () => {
      const id = allEvents.find((e) => e.event_type === "credential_created")?.id;
      if (!id) throw new Error("No credential_created event found");
      const event = await client.secretsAudit.get(id);
      expect(event.id).toBe(id);
      expect(event.event_type).toBe("credential_created");
    });

    it("should throw for nonexistent event", async () => {
      await expect(client.secretsAudit.get("nonexistent-id-00000")).rejects.toThrow(/404/);
    });
  });

  describe("export()", () => {
    it("should export all events", async () => {
      const result = await client.secretsAudit.export();
      expect(result.events).toBeInstanceOf(Array);
      expect(result.events.length).toBeGreaterThanOrEqual(3);
    });

    it("should export with filter", async () => {
      const result = await client.secretsAudit.export({
        event_type: "key_accessed",
      });
      expect(result.events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("verifyIntegrity()", () => {
    // Known Nexus server bug: get_event (used internally) returns 404 for valid IDs
    it.skip("should verify a valid record (skipped: server-side bug)", async () => {
      const id = allEvents.find((e) => e.event_type === "credential_created")?.id;
      if (!id) throw new Error("No credential_created event found");
      const result = await client.secretsAudit.verifyIntegrity(id);
      expect(result.record_id).toBe(id);
      expect(result.is_valid).toBe(true);
    });

    it("should throw for nonexistent record", async () => {
      await expect(client.secretsAudit.verifyIntegrity("nonexistent-id-00000")).rejects.toThrow(
        /404/,
      );
    });
  });
});
