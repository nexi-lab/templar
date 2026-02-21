import { ExecApprovalCommandBlockedError, ExecApprovalDeniedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { createExecApprovalsMiddleware, extractCommandFromInput } from "../../middleware.js";

// Minimal ToolRequest/ToolResponse stubs
function toolReq(toolName: string, input: unknown) {
  return { toolName, input, metadata: {} };
}
function toolRes(output: unknown) {
  return { output, metadata: {} };
}

/** Helper: get wrapToolCall with a runtime assertion so TS knows it exists. */
function getWrapToolCall(mw: ReturnType<typeof createExecApprovalsMiddleware>) {
  const fn = mw.wrapToolCall;
  if (!fn) throw new Error("wrapToolCall should be defined");
  return fn.bind(mw);
}

/** Creates a mock NexusClient for testing. */
function createMockNexusClient(overrides?: {
  getPolicy?: () => Promise<unknown>;
  listAllowlist?: () => Promise<unknown>;
  batchUpsertAllowlist?: () => Promise<unknown>;
  submitApproval?: () => Promise<unknown>;
}) {
  return {
    execApprovals: {
      getPolicy: overrides?.getPolicy ?? vi.fn().mockResolvedValue(null),
      listAllowlist:
        overrides?.listAllowlist ?? vi.fn().mockResolvedValue({ entries: [], total: 0 }),
      batchUpsertAllowlist:
        overrides?.batchUpsertAllowlist ?? vi.fn().mockResolvedValue({ upserted: 0 }),
      submitApproval:
        overrides?.submitApproval ??
        vi.fn().mockResolvedValue({
          approval_id: "apr-1",
          status: "pending",
          decided_by: null,
          decided_at: null,
        }),
      deleteAllowlistEntry: vi.fn().mockResolvedValue(undefined),
      getApproval: vi.fn().mockResolvedValue({
        approval_id: "apr-1",
        status: "pending",
        decided_by: null,
        decided_at: null,
      }),
    },
  } as unknown as import("@nexus/sdk").NexusClient;
}

describe("createExecApprovalsMiddleware", () => {
  it("should create a middleware with the correct name", () => {
    const mw = createExecApprovalsMiddleware({});
    expect(mw.name).toBe("@templar/exec-approvals");
  });

  describe("wrapToolCall", () => {
    it("should pass through non-bash tool calls", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));

      const result = await wrap(toolReq("read_file", { path: "test.txt" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("ok");
    });

    it("should allow safe binary commands", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("file list"));
      const result = await wrap(toolReq("bash", { command: "ls -la" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("file list");
      expect(result.metadata).toHaveProperty("execApproval");
    });

    it("should block NEVER_ALLOW commands", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes(""));

      await expect(wrap(toolReq("bash", { command: "rm -rf /" }), next)).rejects.toThrow(
        ExecApprovalCommandBlockedError,
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should call onApprovalRequest for ask action", async () => {
      const onApproval = vi.fn().mockResolvedValue("allow");
      const mw = createExecApprovalsMiddleware({ onApprovalRequest: onApproval });
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("deployed"));

      const result = await wrap(toolReq("bash", { command: "custom-deploy --env staging" }), next);

      expect(onApproval).toHaveBeenCalledOnce();
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("deployed");
    });

    it("should throw when human denies", async () => {
      const onApproval = vi.fn().mockResolvedValue("deny");
      const mw = createExecApprovalsMiddleware({
        onApprovalRequest: onApproval,
        agentId: "agent-1",
      });
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes(""));

      await expect(
        wrap(toolReq("bash", { command: "custom-deploy --env production" }), next),
      ).rejects.toThrow(ExecApprovalDeniedError);
      expect(next).not.toHaveBeenCalled();
    });

    it("should deny when no approval callback configured (fail-closed)", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("output"));

      // Unknown command but no callback — fail-closed
      await expect(wrap(toolReq("bash", { command: "custom-tool --flag" }), next)).rejects.toThrow(
        ExecApprovalDeniedError,
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("should work without calling onSessionStart", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("file list"));

      // Lazy initialization
      const result = await wrap(toolReq("bash", { command: "ls -la" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("file list");
    });

    it("should extract command from string input", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      await wrap(toolReq("bash", "ls -la"), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("should extract command from { input: string }", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      await wrap(toolReq("bash", { input: "ls -la" }), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it("should intercept custom tool names", async () => {
      const mw = createExecApprovalsMiddleware({
        toolNames: ["run_command"],
      });
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      await expect(wrap(toolReq("run_command", { command: "rm -rf /" }), next)).rejects.toThrow(
        ExecApprovalCommandBlockedError,
      );
    });

    it("should attach analysis metrics to response", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      const result = await wrap(toolReq("bash", { command: "git status" }), next);

      const metrics = result.metadata?.execApproval as Record<string, unknown>;
      expect(metrics).toBeDefined();
      expect(metrics.action).toBe("allow");
      expect(metrics.risk).toBe("safe");
      expect(metrics.binary).toBe("git");
    });
  });

  describe("extractCommandFromInput", () => {
    it("should return undefined for null", () => {
      expect(extractCommandFromInput(null)).toBeUndefined();
    });

    it("should return undefined for undefined", () => {
      expect(extractCommandFromInput(undefined)).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
      expect(extractCommandFromInput("")).toBeUndefined();
    });

    it("should extract from string", () => {
      expect(extractCommandFromInput("ls -la")).toBe("ls -la");
    });

    it("should prefer command field over input field", () => {
      expect(extractCommandFromInput({ command: "git status", input: "ls" })).toBe("git status");
    });

    it("should return undefined for non-string fields", () => {
      expect(extractCommandFromInput({ command: 42 })).toBeUndefined();
    });

    it("should return undefined for arrays", () => {
      expect(extractCommandFromInput(["ls", "-la"])).toBeUndefined();
    });

    it("should return undefined for empty command field", () => {
      expect(extractCommandFromInput({ command: "" })).toBeUndefined();
    });
  });

  describe("Nexus integration", () => {
    it("should load allowlist from Nexus on session start", async () => {
      const listAllowlist = vi.fn().mockResolvedValue({
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
      });

      const nexusClient = createMockNexusClient({ listAllowlist });
      const onApproval = vi.fn().mockResolvedValue("allow");

      const mw = createExecApprovalsMiddleware({
        nexusClient,
        agentId: "agent-1",
        onApprovalRequest: onApproval,
      });

      await mw.onSessionStart?.({ sessionId: "test" });
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));

      // "git commit" should be in allowlist from Nexus
      const result = await wrap(toolReq("bash", { command: "git commit -m test" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.metadata?.execApproval).toBeDefined();
      expect(onApproval).not.toHaveBeenCalled();
    });

    it("should flush dirty entries on session end", async () => {
      const batchUpsertAllowlist = vi.fn().mockResolvedValue({ upserted: 1 });
      const nexusClient = createMockNexusClient({ batchUpsertAllowlist });
      const onApproval = vi.fn().mockResolvedValue("allow");

      const mw = createExecApprovalsMiddleware({
        nexusClient,
        agentId: "agent-1",
        onApprovalRequest: onApproval,
      });

      await mw.onSessionStart?.({ sessionId: "test" });
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));

      // Trigger an approval to make the allowlist dirty
      await wrap(toolReq("bash", { command: "custom-deploy --env staging" }), next);

      // Session end should flush
      await mw.onSessionEnd?.({ sessionId: "test" });

      expect(batchUpsertAllowlist).toHaveBeenCalledOnce();
    });

    it("should gracefully handle Nexus timeout on session start", async () => {
      const slowFn = () =>
        new Promise((_resolve, _reject) => {
          // Never resolves — simulates timeout
        });

      const nexusClient = createMockNexusClient({
        getPolicy: slowFn,
        listAllowlist: slowFn,
      });

      const mw = createExecApprovalsMiddleware({
        nexusClient,
        agentId: "agent-1",
        policyTimeout: 100, // 100ms timeout
      });

      // Should not throw — graceful degradation
      await mw.onSessionStart?.({ sessionId: "test" });

      // Middleware should still work with local defaults
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      const result = await wrap(toolReq("bash", { command: "ls -la" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("ok");
    });

    it("should gracefully handle Nexus offline on session start", async () => {
      const nexusClient = createMockNexusClient({
        getPolicy: () => Promise.reject(new Error("Connection refused")),
        listAllowlist: () => Promise.reject(new Error("Connection refused")),
      });

      const mw = createExecApprovalsMiddleware({
        nexusClient,
        agentId: "agent-1",
      });

      // Should not throw — graceful degradation
      await mw.onSessionStart?.({ sessionId: "test" });

      // Middleware should still work
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      const result = await wrap(toolReq("bash", { command: "git status" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("ok");
    });

    it("should submit to Nexus in nexus approval mode", async () => {
      const submitApproval = vi.fn().mockResolvedValue({
        approval_id: "apr-123",
        status: "pending",
        decided_by: null,
        decided_at: null,
      });

      const nexusClient = createMockNexusClient({ submitApproval });

      const mw = createExecApprovalsMiddleware({
        nexusClient,
        approvalMode: "nexus",
        agentId: "agent-1",
        sessionId: "session-1",
      });

      await mw.onSessionStart?.({ sessionId: "test" });
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));

      // Should throw ExecApprovalDeniedError with approval ID in message
      await expect(
        wrap(toolReq("bash", { command: "custom-deploy --env production" }), next),
      ).rejects.toThrow(ExecApprovalDeniedError);

      expect(submitApproval).toHaveBeenCalledOnce();
      expect(submitApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_id: "agent-1",
          command: "custom-deploy --env production",
          session_id: "session-1",
        }),
      );
    });

    it("should merge Nexus policy on session start", async () => {
      const getPolicy = vi.fn().mockResolvedValue({
        policy_id: "pol-1",
        additional_safe_binaries: ["custom-safe-tool"],
        removed_safe_binaries: [],
        additional_never_allow: [],
        auto_promote_threshold: null,
        max_patterns: null,
        dangerous_flag_overrides: [],
        updated_at: "2026-01-01T00:00:00Z",
      });

      const nexusClient = createMockNexusClient({ getPolicy });

      const mw = createExecApprovalsMiddleware({
        nexusClient,
        agentId: "agent-1",
      });

      await mw.onSessionStart?.({ sessionId: "test" });
      const wrap = getWrapToolCall(mw);
      const next = vi.fn().mockResolvedValue(toolRes("ok"));

      // "custom-safe-tool" should now be safe (from merged policy)
      const result = await wrap(toolReq("bash", { command: "custom-safe-tool --version" }), next);
      expect(next).toHaveBeenCalledOnce();

      const metrics = result.metadata?.execApproval as Record<string, unknown>;
      expect(metrics.action).toBe("allow");
      expect(metrics.risk).toBe("safe");
    });
  });

  describe("onSessionEnd", () => {
    it("should clean up state on session end", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });
      await mw.onSessionEnd?.({ sessionId: "test" });

      // Should still work after restart (lazy init)
      const next = vi.fn().mockResolvedValue(toolRes("ok"));
      await wrap(toolReq("bash", { command: "ls" }), next);
      expect(next).toHaveBeenCalledOnce();
    });
  });
});
