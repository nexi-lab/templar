import { describe, expect, it, vi } from "vitest";
import type { HttpClient } from "../../http/index.js";
import { ExecApprovalsResource } from "../../resources/exec-approvals.js";

function createMockHttp(response: unknown) {
  return {
    request: vi.fn().mockResolvedValue(response),
  } as unknown as HttpClient;
}

describe("ExecApprovalsResource", () => {
  describe("listAllowlist", () => {
    it("should fetch allowlist entries for an agent", async () => {
      const mockResponse = {
        entries: [
          {
            pattern: "git commit",
            approval_count: 5,
            auto_promoted: true,
            last_approved_at: "2026-01-01T00:00:00Z",
            agent_id: "agent-1",
          },
        ],
        total: 1,
      };

      const http = createMockHttp(mockResponse);
      const resource = new ExecApprovalsResource(http);

      const result = await resource.listAllowlist({ agent_id: "agent-1" });

      expect(result).toEqual(mockResponse);
      expect(http.request).toHaveBeenCalledWith("/exec-approvals/allowlist", {
        method: "GET",
        query: { agent_id: "agent-1" },
      });
    });
  });

  describe("batchUpsertAllowlist", () => {
    it("should batch upsert entries", async () => {
      const mockResponse = { upserted: 2 };
      const http = createMockHttp(mockResponse);
      const resource = new ExecApprovalsResource(http);

      const params = {
        agent_id: "agent-1",
        entries: [
          {
            pattern: "git commit",
            approval_count: 3,
            auto_promoted: false,
            last_approved_at: "2026-01-01T00:00:00Z",
          },
          {
            pattern: "npm test",
            approval_count: 5,
            auto_promoted: true,
            last_approved_at: "2026-01-02T00:00:00Z",
          },
        ],
      };

      const result = await resource.batchUpsertAllowlist(params);

      expect(result.upserted).toBe(2);
      expect(http.request).toHaveBeenCalledWith("/exec-approvals/allowlist", {
        method: "POST",
        body: params,
      });
    });
  });

  describe("deleteAllowlistEntry", () => {
    it("should delete a single entry", async () => {
      const http = createMockHttp(undefined);
      const resource = new ExecApprovalsResource(http);

      await resource.deleteAllowlistEntry("agent-1", "git commit");

      expect(http.request).toHaveBeenCalledWith(
        `/exec-approvals/allowlist/${encodeURIComponent("git commit")}`,
        {
          method: "DELETE",
          query: { agent_id: "agent-1" },
        },
      );
    });
  });

  describe("getPolicy", () => {
    it("should return policy when found", async () => {
      const mockPolicy = {
        policy_id: "pol-1",
        additional_safe_binaries: ["custom-tool"],
        removed_safe_binaries: [],
        additional_never_allow: [],
        auto_promote_threshold: 10,
        max_patterns: null,
        dangerous_flag_overrides: [],
        updated_at: "2026-01-01T00:00:00Z",
      };

      const http = createMockHttp(mockPolicy);
      const resource = new ExecApprovalsResource(http);

      const result = await resource.getPolicy({ agent_id: "agent-1" });

      expect(result).toEqual(mockPolicy);
      expect(http.request).toHaveBeenCalledWith("/exec-approvals/policy", {
        method: "GET",
        query: { agent_id: "agent-1" },
      });
    });

    it("should return null when no policy found", async () => {
      const http = createMockHttp(null);
      const resource = new ExecApprovalsResource(http);

      const result = await resource.getPolicy();

      expect(result).toBeNull();
      expect(http.request).toHaveBeenCalledWith("/exec-approvals/policy", {
        method: "GET",
        query: undefined,
      });
    });
  });

  describe("submitApproval", () => {
    it("should submit an approval request", async () => {
      const mockResponse = {
        approval_id: "apr-1",
        status: "pending",
        decided_by: null,
        decided_at: null,
      };

      const http = createMockHttp(mockResponse);
      const resource = new ExecApprovalsResource(http);

      const params = {
        agent_id: "agent-1",
        command: "rm -rf build/",
        risk: "high",
        reason: "recursive deletion",
        session_id: "session-1",
      };

      const result = await resource.submitApproval(params);

      expect(result.approval_id).toBe("apr-1");
      expect(result.status).toBe("pending");
      expect(http.request).toHaveBeenCalledWith("/exec-approvals/approvals", {
        method: "POST",
        body: params,
      });
    });
  });

  describe("getApproval", () => {
    it("should get an approval by ID", async () => {
      const mockResponse = {
        approval_id: "apr-1",
        status: "approved",
        decided_by: "admin@example.com",
        decided_at: "2026-01-01T00:01:00Z",
      };

      const http = createMockHttp(mockResponse);
      const resource = new ExecApprovalsResource(http);

      const result = await resource.getApproval("apr-1");

      expect(result.status).toBe("approved");
      expect(result.decided_by).toBe("admin@example.com");
      expect(http.request).toHaveBeenCalledWith("/exec-approvals/approvals/apr-1", {
        method: "GET",
      });
    });
  });
});
