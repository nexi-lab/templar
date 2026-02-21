import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import { SecretsAuditResource } from "../../resources/secrets-audit.js";
import type {
  SecretsAuditEvent,
  SecretsAuditEventListResponse,
  SecretsAuditExportResponse,
  SecretsAuditIntegrityResponse,
} from "../../types/secrets-audit.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_EVENT: SecretsAuditEvent = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  record_hash: "abc123def456789abc123def456789abc123def456789abc123def456789abcd",
  created_at: "2026-02-20T10:00:00+00:00",
  event_type: "credential_created",
  actor_id: "user-42",
  provider: "github",
  credential_id: "cred-abc",
  token_family_id: null,
  zone_id: "root",
  ip_address: "192.168.1.1",
  details: '{"scope": "repo"}',
  metadata_hash: "def456abc789",
};

const MOCK_EVENT_MINIMAL: SecretsAuditEvent = {
  id: "660e8400-e29b-41d4-a716-446655440001",
  record_hash: "fff000fff000fff000fff000fff000fff000fff000fff000fff000fff000ffff",
  created_at: "2026-02-20T11:00:00+00:00",
  event_type: "key_accessed",
  actor_id: "agent-7",
  provider: null,
  credential_id: null,
  token_family_id: null,
  zone_id: "root",
  ip_address: null,
  details: null,
  metadata_hash: null,
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

describe("SecretsAuditResource", () => {
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

  describe("initialization", () => {
    it("should expose secretsAudit resource on client", () => {
      expect(client.secretsAudit).toBeInstanceOf(SecretsAuditResource);
    });
  });

  // -----------------------------------------------------------------------
  // list()
  // -----------------------------------------------------------------------

  describe("list()", () => {
    it("should list events with no params", async () => {
      const response: SecretsAuditEventListResponse = {
        events: [MOCK_EVENT],
        limit: 100,
        has_more: false,
        total: null,
        next_cursor: null,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.secretsAudit.list();

      expect(result).toEqual(response);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/secrets-audit/events",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should pass all filter parameters as query strings", async () => {
      const response: SecretsAuditEventListResponse = {
        events: [],
        limit: 50,
        has_more: false,
        total: 0,
        next_cursor: null,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.secretsAudit.list({
        since: "2026-01-01T00:00:00Z",
        until: "2026-02-01T00:00:00Z",
        event_type: "credential_created",
        actor_id: "user-42",
        provider: "github",
        credential_id: "cred-abc",
        token_family_id: "fam-xyz",
        limit: 50,
        cursor: "cursor-token",
        include_total: true,
      });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get("since")).toBe("2026-01-01T00:00:00Z");
      expect(url.searchParams.get("until")).toBe("2026-02-01T00:00:00Z");
      expect(url.searchParams.get("event_type")).toBe("credential_created");
      expect(url.searchParams.get("actor_id")).toBe("user-42");
      expect(url.searchParams.get("provider")).toBe("github");
      expect(url.searchParams.get("credential_id")).toBe("cred-abc");
      expect(url.searchParams.get("token_family_id")).toBe("fam-xyz");
      expect(url.searchParams.get("limit")).toBe("50");
      expect(url.searchParams.get("cursor")).toBe("cursor-token");
      expect(url.searchParams.get("include_total")).toBe("true");
    });

    it("should omit undefined parameters from query", async () => {
      const response: SecretsAuditEventListResponse = {
        events: [],
        limit: 100,
        has_more: false,
        total: null,
        next_cursor: null,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.secretsAudit.list({
        event_type: "key_accessed",
      });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get("event_type")).toBe("key_accessed");
      expect(url.searchParams.has("since")).toBe(false);
      expect(url.searchParams.has("until")).toBe(false);
      expect(url.searchParams.has("actor_id")).toBe(false);
      expect(url.searchParams.has("provider")).toBe(false);
      expect(url.searchParams.has("credential_id")).toBe(false);
      expect(url.searchParams.has("token_family_id")).toBe(false);
      expect(url.searchParams.has("limit")).toBe(false);
      expect(url.searchParams.has("cursor")).toBe(false);
      expect(url.searchParams.has("include_total")).toBe(false);
    });

    it("should handle paginated response with next_cursor", async () => {
      const response: SecretsAuditEventListResponse = {
        events: [MOCK_EVENT, MOCK_EVENT_MINIMAL],
        limit: 2,
        has_more: true,
        total: null,
        next_cursor: "eyJpZCI6IjY2MGU4NDAw...",
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.secretsAudit.list({ limit: 2 });

      expect(result.has_more).toBe(true);
      expect(result.next_cursor).toBe("eyJpZCI6IjY2MGU4NDAw...");
      expect(result.events).toHaveLength(2);
    });

    it("should include total count when requested", async () => {
      const response: SecretsAuditEventListResponse = {
        events: [MOCK_EVENT],
        limit: 100,
        has_more: false,
        total: 42,
        next_cursor: null,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.secretsAudit.list({ include_total: true });

      expect(result.total).toBe(42);
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe("get()", () => {
    it("should get a single event by ID", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_EVENT));

      const result = await client.secretsAudit.get(MOCK_EVENT.id);

      expect(result).toEqual(MOCK_EVENT);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v2/secrets-audit/events/${MOCK_EVENT.id}`,
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should URL-encode the record ID", async () => {
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(MOCK_EVENT));

      await client.secretsAudit.get("id/with special&chars");

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("id%2Fwith%20special%26chars");
    });

    it("should throw on 404", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "NOT_FOUND", message: "Audit event not found" }, 404),
        );

      await expect(client.secretsAudit.get("nonexistent")).rejects.toThrow("Audit event not found");
    });
  });

  // -----------------------------------------------------------------------
  // export()
  // -----------------------------------------------------------------------

  describe("export()", () => {
    it("should export events as JSON with default params", async () => {
      const response: SecretsAuditExportResponse = {
        events: [MOCK_EVENT, MOCK_EVENT_MINIMAL],
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.secretsAudit.export();

      expect(result.events).toHaveLength(2);
      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.pathname).toBe("/api/v2/secrets-audit/events/export");
      expect(url.searchParams.get("format")).toBe("json");
    });

    it("should pass filter parameters", async () => {
      const response: SecretsAuditExportResponse = { events: [] };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.secretsAudit.export({
        since: "2026-01-01T00:00:00Z",
        until: "2026-02-01T00:00:00Z",
        event_type: "token_rotated",
        actor_id: "admin-1",
        provider: "google",
        limit: 5000,
      });

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("since")).toBe("2026-01-01T00:00:00Z");
      expect(url.searchParams.get("until")).toBe("2026-02-01T00:00:00Z");
      expect(url.searchParams.get("event_type")).toBe("token_rotated");
      expect(url.searchParams.get("actor_id")).toBe("admin-1");
      expect(url.searchParams.get("provider")).toBe("google");
      expect(url.searchParams.get("limit")).toBe("5000");
    });

    it("should always set format=json", async () => {
      const response: SecretsAuditExportResponse = { events: [] };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.secretsAudit.export({});

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get("format")).toBe("json");
    });
  });

  // -----------------------------------------------------------------------
  // verifyIntegrity()
  // -----------------------------------------------------------------------

  describe("verifyIntegrity()", () => {
    it("should verify a valid record", async () => {
      const response: SecretsAuditIntegrityResponse = {
        record_id: MOCK_EVENT.id,
        is_valid: true,
        record_hash: MOCK_EVENT.record_hash,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.secretsAudit.verifyIntegrity(MOCK_EVENT.id);

      expect(result.is_valid).toBe(true);
      expect(result.record_id).toBe(MOCK_EVENT.id);
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.test.com/api/v2/secrets-audit/integrity/${MOCK_EVENT.id}`,
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should detect tampered record", async () => {
      const response: SecretsAuditIntegrityResponse = {
        record_id: MOCK_EVENT.id,
        is_valid: false,
        record_hash: MOCK_EVENT.record_hash,
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      const result = await client.secretsAudit.verifyIntegrity(MOCK_EVENT.id);

      expect(result.is_valid).toBe(false);
    });

    it("should URL-encode the record ID", async () => {
      const response: SecretsAuditIntegrityResponse = {
        record_id: "id/special",
        is_valid: true,
        record_hash: "abc",
      };
      global.fetch = vi.fn().mockResolvedValue(mockJsonResponse(response));

      await client.secretsAudit.verifyIntegrity("id/special");

      const calledUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
      expect(calledUrl).toContain("id%2Fspecial");
    });

    it("should throw on 404 for nonexistent record", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "NOT_FOUND", message: "Audit event not found" }, 404),
        );

      await expect(client.secretsAudit.verifyIntegrity("nonexistent")).rejects.toThrow(
        "Audit event not found",
      );
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
          mockJsonResponse(
            { code: "INTERNAL_ERROR", message: "Failed to query secrets audit events" },
            500,
          ),
        );

      await expect(client.secretsAudit.list()).rejects.toThrow(
        "Failed to query secrets audit events",
      );
    });

    it("should propagate 401 unauthorized", async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(
          mockJsonResponse({ code: "UNAUTHORIZED", message: "Invalid API key" }, 401),
        );

      await expect(client.secretsAudit.list()).rejects.toThrow("Invalid API key");
    });
  });
});
