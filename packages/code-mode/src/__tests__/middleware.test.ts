import type { ModelHandler, ModelRequest, ModelResponse, SessionContext } from "@templar/core";
import {
  CodeExecutionTimeoutError,
  CodeResourceExceededError,
  CodeRuntimeError,
  CodeSandboxNotFoundError,
  CodeSyntaxError,
} from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCodeModeMiddleware } from "../middleware.js";

// ---------------------------------------------------------------------------
// Mock NexusClient
// ---------------------------------------------------------------------------

function createMockClient() {
  return {
    sandbox: {
      create: vi.fn().mockResolvedValue({
        sandbox_id: "sbx-test-123",
        name: "code-mode-test",
        status: "running",
        provider: "monty",
        created_at: "2024-06-01T12:00:00Z",
      }),
      runCode: vi.fn().mockResolvedValue({
        stdout: '{"result": 42}',
        stderr: "",
        exit_code: 0,
        execution_time: 0.01,
      }),
      destroy: vi.fn().mockResolvedValue({
        sandbox_id: "sbx-test-123",
        status: "destroyed",
        provider: "monty",
        created_at: "2024-06-01T12:00:00Z",
      }),
    },
  };
}

function createMockContext(overrides?: Partial<SessionContext>): SessionContext {
  return {
    sessionId: "sess-test-123",
    ...overrides,
  };
}

function createMockModelRequest(content?: string): ModelRequest {
  return {
    messages: [{ role: "user", content: content ?? "hello" }],
    model: "claude-3",
  };
}

function createMockNext(responseContent: string): ModelHandler {
  return vi.fn().mockResolvedValue({
    content: responseContent,
    model: "claude-3",
  } satisfies ModelResponse);
}

describe("CodeModeMiddleware", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Factory
  // =========================================================================

  describe("createCodeModeMiddleware", () => {
    it("should create middleware with default config", () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      expect(mw.name).toBe("code-mode");
    });

    it("should create middleware with partial config override", () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, {
        maxCodeLength: 5000,
      });
      expect(mw.name).toBe("code-mode");
    });

    it("should throw on invalid config", () => {
      expect(() =>
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        createCodeModeMiddleware(mockClient as any, {
          maxCodeLength: -1,
        }),
      ).toThrow("Invalid code-mode config");
    });
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  describe("onSessionStart", () => {
    it("should create sandbox on session start", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      expect(mockClient.sandbox.create).toHaveBeenCalledWith({
        name: "code-mode-sess-test-123",
        provider: "monty",
        securityProfile: "standard",
      });
    });

    it("should skip sandbox creation when disabled", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, {
        enabled: false,
      });
      await mw.onSessionStart?.(createMockContext());

      expect(mockClient.sandbox.create).not.toHaveBeenCalled();
    });

    it("should use configured security profile", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, {
        resourceProfile: "strict",
      });
      await mw.onSessionStart?.(createMockContext());

      expect(mockClient.sandbox.create).toHaveBeenCalledWith(
        expect.objectContaining({ securityProfile: "strict" }),
      );
    });
  });

  describe("onSessionEnd", () => {
    it("should destroy sandbox on session end", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());
      await mw.onSessionEnd?.(createMockContext());

      expect(mockClient.sandbox.destroy).toHaveBeenCalledWith("sbx-test-123");
    });

    it("should handle no sandbox gracefully", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, {
        enabled: false,
      });

      // No session start — should not throw
      await expect(mw.onSessionEnd?.(createMockContext())).resolves.toBeUndefined();
      expect(mockClient.sandbox.destroy).not.toHaveBeenCalled();
    });

    it("should clear sandboxId even if destroy fails", async () => {
      mockClient.sandbox.destroy.mockRejectedValue(new Error("destroy failed"));
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      await expect(mw.onSessionEnd?.(createMockContext())).rejects.toThrow("destroy failed");

      // sandboxId should be null now — subsequent destroy should not call API
      mockClient.sandbox.destroy.mockReset();
      await mw.onSessionEnd?.(createMockContext());
      expect(mockClient.sandbox.destroy).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // wrapModelCall
  // =========================================================================

  describe("wrapModelCall — passthrough", () => {
    it("should pass through normal text responses unchanged", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const req = createMockModelRequest();
      const next = createMockNext("Just a normal response.");

      const response = await mw.wrapModelCall?.(req, next);
      expect(response.content).toBe("Just a normal response.");
    });

    it("should inject code-mode prompt into system prompt", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const req: ModelRequest = {
        messages: [{ role: "user", content: "hello" }],
        systemPrompt: "You are helpful.",
      };
      const next = createMockNext("Normal response");
      await mw.wrapModelCall?.(req, next);

      // biome-ignore lint/style/noNonNullAssertion: test assertion after mock call
      const calledReq = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ModelRequest;
      expect(calledReq.systemPrompt).toContain("You are helpful.");
      expect(calledReq.systemPrompt).toContain("## Code Mode");
    });

    it("should set code-mode prompt when no system prompt exists", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const req = createMockModelRequest();
      const next = createMockNext("Normal response");
      await mw.wrapModelCall?.(req, next);

      // biome-ignore lint/style/noNonNullAssertion: test assertion after mock call
      const calledReq = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ModelRequest;
      expect(calledReq.systemPrompt).toContain("## Code Mode");
    });

    it("should pass through when disabled", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, { enabled: false });

      const req = createMockModelRequest();
      const next = createMockNext("Normal response");
      const response = await mw.wrapModelCall?.(req, next);

      expect(response.content).toBe("Normal response");
      // biome-ignore lint/style/noNonNullAssertion: test assertion after mock call
      const calledReq = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ModelRequest;
      // Should NOT inject code-mode prompt
      expect(calledReq.systemPrompt).toBeUndefined();
    });
  });

  describe("wrapModelCall — code execution", () => {
    it("should execute code blocks and return parsed result", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = `Here's the result:

\`\`\`python-code-mode
result = read_file("src/main.ts")
print(json.dumps({"content": result}))
\`\`\``;

      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      const response = await mw.wrapModelCall?.(req, next);

      expect(mockClient.sandbox.runCode).toHaveBeenCalledWith("sbx-test-123", {
        language: "python",
        code: 'result = read_file("src/main.ts")\nprint(json.dumps({"content": result}))',
        host_functions: ["read_file", "search", "memory_query"],
      });
      expect(response.metadata?.codeModeExecuted).toBe(true);
    });

    it("should throw CodeSyntaxError for syntax errors in execution", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: "SyntaxError: invalid syntax at line 3",
        exit_code: 1,
        execution_time: 0.001,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = "```python-code-mode\nx =\n```";
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      await expect(mw.wrapModelCall?.(req, next)).rejects.toBeInstanceOf(CodeSyntaxError);
    });

    it("should throw CodeRuntimeError for runtime errors", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: "NameError: name 'x' is not defined",
        exit_code: 1,
        execution_time: 0.001,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = "```python-code-mode\nprint(x)\n```";
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      await expect(mw.wrapModelCall?.(req, next)).rejects.toBeInstanceOf(CodeRuntimeError);
    });

    it("should throw CodeSyntaxError for oversized code", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, {
        maxCodeLength: 10,
      });
      await mw.onSessionStart?.(createMockContext());

      const longCode = "x = 1\n".repeat(100);
      const codeResponse = `\`\`\`python-code-mode\n${longCode}\`\`\``;
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      await expect(mw.wrapModelCall?.(req, next)).rejects.toBeInstanceOf(CodeSyntaxError);
    });
  });

  // =========================================================================
  // Error mapping
  // =========================================================================

  describe("error mapping", () => {
    it("should map timeout stderr to CodeExecutionTimeoutError", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: "TimeoutError: execution timed out",
        exit_code: 1,
        execution_time: 30,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = "```python-code-mode\nwhile True: pass\n```";
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      await expect(mw.wrapModelCall?.(req, next)).rejects.toBeInstanceOf(CodeExecutionTimeoutError);
    });

    it("should map memory stderr to CodeResourceExceededError", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: "MemoryError: out of memory",
        exit_code: 1,
        execution_time: 0.5,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = "```python-code-mode\nx = [0] * 10**9\n```";
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      const error = await mw.wrapModelCall?.(req, next).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CodeResourceExceededError);
      expect((error as CodeResourceExceededError).resource).toBe("memory");
    });

    it("should map recursion stderr to CodeResourceExceededError", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: "RecursionError: maximum recursion depth exceeded",
        exit_code: 1,
        execution_time: 0.1,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = "```python-code-mode\ndef f(): f()\nf()\n```";
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      const error = await mw.wrapModelCall?.(req, next).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CodeResourceExceededError);
      expect((error as CodeResourceExceededError).resource).toBe("recursion");
    });

    it("should map 404 API error to CodeSandboxNotFoundError", async () => {
      mockClient.sandbox.runCode.mockRejectedValue(new Error("HTTP 404: not found"));

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(createMockContext());

      const codeResponse = "```python-code-mode\nprint(1)\n```";
      const req = createMockModelRequest();
      const next = createMockNext(codeResponse);

      await expect(mw.wrapModelCall?.(req, next)).rejects.toBeInstanceOf(CodeSandboxNotFoundError);
    });
  });
});
