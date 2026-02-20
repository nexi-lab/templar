import { ExecApprovalCommandBlockedError, ExecApprovalDeniedError } from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { createExecApprovalsMiddleware } from "../../middleware.js";

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

    it("should pass through when no approval callback configured", async () => {
      const mw = createExecApprovalsMiddleware({});
      const wrap = getWrapToolCall(mw);
      await mw.onSessionStart?.({ sessionId: "test" });

      const next = vi.fn().mockResolvedValue(toolRes("output"));

      // Unknown command but no callback — should pass through
      const result = await wrap(toolReq("bash", { command: "custom-tool --flag" }), next);
      expect(next).toHaveBeenCalledOnce();
      expect(result.output).toBe("output");
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
