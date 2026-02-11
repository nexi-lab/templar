import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import type {
  CheckPermissionResponse,
  GrantPermissionResponse,
  ListNamespaceToolsResponse,
} from "../../types/permissions.js";

describe("PermissionsResource", () => {
  let originalFetch: typeof global.fetch;
  let client: NexusClient;

  beforeEach(() => {
    originalFetch = global.fetch;
    client = new NexusClient({
      apiKey: "test-key",
      baseUrl: "https://api.test.com",
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetchResponse(data: unknown, status = 200): void {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  function mockFetchError(errorBody: unknown, status: number): void {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(errorBody), { status }));
  }

  // =========================================================================
  // checkPermission()
  // =========================================================================

  describe("checkPermission", () => {
    const mockAllowed: CheckPermissionResponse = { allowed: true };
    const mockDenied: CheckPermissionResponse = { allowed: false, reason: "No matching policy" };

    it("should check permission with minimal params", async () => {
      mockFetchResponse(mockAllowed);

      const result = await client.permissions.checkPermission({
        subject: "session-123",
        action: "execute",
        resource: "web-search",
      });

      expect(result).toEqual(mockAllowed);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/nfs/check_permission",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            subject: "session-123",
            action: "execute",
            resource: "web-search",
          }),
        }),
      );
    });

    it("should check permission with namespace", async () => {
      mockFetchResponse(mockAllowed);

      await client.permissions.checkPermission({
        subject: "session-123",
        action: "execute",
        resource: "web-search",
        namespace: "production",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/nfs/check_permission",
        expect.objectContaining({
          body: JSON.stringify({
            subject: "session-123",
            action: "execute",
            resource: "web-search",
            namespace: "production",
          }),
        }),
      );
    });

    it("should return denied with reason", async () => {
      mockFetchResponse(mockDenied);

      const result = await client.permissions.checkPermission({
        subject: "session-123",
        action: "execute",
        resource: "admin-tool",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("No matching policy");
    });

    it("should propagate API errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "ReBAC unavailable" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(
        singleRetryClient.permissions.checkPermission({
          subject: "session-123",
          action: "execute",
          resource: "web-search",
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // grantPermission()
  // =========================================================================

  describe("grantPermission", () => {
    const mockResponse: GrantPermissionResponse = {
      granted: true,
      permission_id: "perm-abc-123",
    };

    it("should grant permission with minimal params", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.permissions.grantPermission({
        subject: "session-123",
        action: "execute",
        resource: "web-search",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/permissions/grant",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            subject: "session-123",
            action: "execute",
            resource: "web-search",
          }),
        }),
      );
    });

    it("should grant permission with namespace and TTL", async () => {
      mockFetchResponse(mockResponse);

      await client.permissions.grantPermission({
        subject: "session-123",
        action: "execute",
        resource: "web-search",
        namespace: "production",
        ttl_seconds: 3600,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/permissions/grant",
        expect.objectContaining({
          body: JSON.stringify({
            subject: "session-123",
            action: "execute",
            resource: "web-search",
            namespace: "production",
            ttl_seconds: 3600,
          }),
        }),
      );
    });

    it("should return granted with permission_id", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.permissions.grantPermission({
        subject: "session-123",
        action: "execute",
        resource: "web-search",
      });

      expect(result.granted).toBe(true);
      expect(result.permission_id).toBe("perm-abc-123");
    });

    it("should propagate API errors", async () => {
      mockFetchError({ code: "PERMISSION_DENIED", message: "Cannot grant" }, 403);

      await expect(
        client.permissions.grantPermission({
          subject: "session-123",
          action: "execute",
          resource: "admin-tool",
        }),
      ).rejects.toThrow("Cannot grant");
    });
  });

  // =========================================================================
  // listNamespaceTools()
  // =========================================================================

  describe("listNamespaceTools", () => {
    const mockResponse: ListNamespaceToolsResponse = {
      tools: ["web-search", "calculator", "code-exec"],
    };

    it("should list tools for a namespace", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.permissions.listNamespaceTools({
        namespace: "production",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/permissions/namespace/production/tools",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should list tools with subject filter", async () => {
      mockFetchResponse(mockResponse);

      await client.permissions.listNamespaceTools({
        namespace: "production",
        subject: "agent-001",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("subject=agent-001"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should handle empty tools list", async () => {
      mockFetchResponse({ tools: [] });

      const result = await client.permissions.listNamespaceTools({
        namespace: "empty-ns",
      });

      expect(result.tools).toEqual([]);
    });

    it("should encode special characters in namespace", async () => {
      mockFetchResponse(mockResponse);

      await client.permissions.listNamespaceTools({
        namespace: "prod/staging",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("prod%2Fstaging"),
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should propagate API errors", async () => {
      mockFetchError({ code: "NOT_FOUND", message: "Namespace not found" }, 404);

      await expect(
        client.permissions.listNamespaceTools({
          namespace: "nonexistent",
        }),
      ).rejects.toThrow("Namespace not found");
    });
  });

  // =========================================================================
  // Error handling (cross-cutting)
  // =========================================================================

  describe("error handling", () => {
    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(
        client.permissions.checkPermission({
          subject: "s",
          action: "a",
          resource: "r",
        }),
      ).rejects.toThrow("Network error");
    });

    it("should handle 401 unauthorized", async () => {
      mockFetchError({ code: "UNAUTHORIZED", message: "Invalid API key" }, 401);

      await expect(
        client.permissions.checkPermission({
          subject: "s",
          action: "a",
          resource: "r",
        }),
      ).rejects.toThrow("Invalid API key");
    });
  });
});
