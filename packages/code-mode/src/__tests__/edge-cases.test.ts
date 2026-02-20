import type { SessionContext } from "@templar/core";
import {
  CodeModeError,
  CodeRuntimeError,
  CodeSandboxNotFoundError,
  CodeSyntaxError,
} from "@templar/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCodeModeMiddleware } from "../middleware.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockClient(overrides?: Record<string, unknown>) {
  return {
    sandbox: {
      create: vi.fn().mockResolvedValue({
        sandbox_id: "sbx-edge",
        name: "code-mode-edge",
        status: "running",
        provider: "monty",
        created_at: "2024-06-01T12:00:00Z",
      }),
      runCode: vi.fn().mockResolvedValue({
        stdout: '{"ok": true}',
        stderr: "",
        exit_code: 0,
        execution_time: 0.01,
      }),
      destroy: vi.fn().mockResolvedValue({
        sandbox_id: "sbx-edge",
        status: "destroyed",
        provider: "monty",
        created_at: "2024-06-01T12:00:00Z",
      }),
      ...overrides,
    },
  };
}

function ctx(): SessionContext {
  return { sessionId: "sess-edge" };
}

function codeBlock(code: string): string {
  return `\`\`\`python-code-mode\n${code}\n\`\`\``;
}

describe("edge cases", () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Empty / whitespace code
  // =========================================================================

  describe("empty code", () => {
    it("should handle code block with only whitespace", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: "",
        exit_code: 0,
        execution_time: 0.001,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(ctx());

      // Empty code after trim still gets sent to sandbox
      const next = vi.fn().mockResolvedValue({ content: codeBlock("  "), model: "test" });
      const response = await mw.wrapModelCall?.(
        { messages: [{ role: "user", content: "test" }] },
        next,
      );

      // Empty stdout → raw output
      expect(response.metadata?.codeModeExecuted).toBe(true);
    });
  });

  // =========================================================================
  // Non-JSON output
  // =========================================================================

  describe("non-JSON output", () => {
    it("should handle plain text stdout", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "hello world",
        stderr: "",
        exit_code: 0,
        execution_time: 0.01,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(ctx());

      const next = vi.fn().mockResolvedValue({
        content: codeBlock('print("hello world")'),
        model: "test",
      });
      const response = await mw.wrapModelCall?.(
        { messages: [{ role: "user", content: "test" }] },
        next,
      );

      // Non-JSON output is stringified
      expect(response.content).toBeDefined();
      expect(response.metadata?.codeModeExecuted).toBe(true);
    });
  });

  // =========================================================================
  // Sandbox unavailable
  // =========================================================================

  describe("sandbox unavailable", () => {
    it("should pass through when sandbox was never created", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any, { enabled: false });
      // Never call onSessionStart

      const next = vi.fn().mockResolvedValue({
        content: codeBlock("print(1)"),
        model: "test",
      });

      const response = await mw.wrapModelCall?.(
        { messages: [{ role: "user", content: "test" }] },
        next,
      );

      // Should pass through because disabled
      expect(response.content).toContain("python-code-mode");
      expect(mockClient.sandbox.runCode).not.toHaveBeenCalled();
    });

    it("should handle sandbox create failure gracefully in session start", async () => {
      mockClient.sandbox.create.mockRejectedValue(new Error("Service unavailable"));

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);

      await expect(mw.onSessionStart?.(ctx())).rejects.toThrow("Service unavailable");
    });
  });

  // =========================================================================
  // Multiple code blocks
  // =========================================================================

  describe("multiple code blocks", () => {
    it("should only extract the first code-mode block", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(ctx());

      const content = `First:
\`\`\`python-code-mode
print(json.dumps({"first": true}))
\`\`\`

Second:
\`\`\`python-code-mode
print(json.dumps({"second": true}))
\`\`\``;

      const next = vi.fn().mockResolvedValue({ content, model: "test" });
      await mw.wrapModelCall?.({ messages: [{ role: "user", content: "test" }] }, next);

      expect(mockClient.sandbox.runCode).toHaveBeenCalledTimes(1);
      // biome-ignore lint/style/noNonNullAssertion: test assertion after toHaveBeenCalledTimes(1)
      const calledCode = mockClient.sandbox.runCode.mock.calls[0]![1].code;
      expect(calledCode).toContain('"first"');
    });
  });

  // =========================================================================
  // Sequential sessions
  // =========================================================================

  describe("sequential sessions", () => {
    it("should handle start-end-start-end lifecycle correctly", async () => {
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);

      // Session 1
      await mw.onSessionStart?.(ctx());
      expect(mockClient.sandbox.create).toHaveBeenCalledTimes(1);
      await mw.onSessionEnd?.(ctx());
      expect(mockClient.sandbox.destroy).toHaveBeenCalledTimes(1);

      // Session 2
      mockClient.sandbox.create.mockResolvedValue({
        sandbox_id: "sbx-edge-2",
        name: "code-mode-edge-2",
        status: "running",
        provider: "monty",
        created_at: "2024-06-01T13:00:00Z",
      });

      await mw.onSessionStart?.(ctx());
      expect(mockClient.sandbox.create).toHaveBeenCalledTimes(2);
      await mw.onSessionEnd?.(ctx());
      expect(mockClient.sandbox.destroy).toHaveBeenCalledTimes(2);
      expect(mockClient.sandbox.destroy).toHaveBeenLastCalledWith("sbx-edge-2");
    });
  });

  // =========================================================================
  // Config edge cases
  // =========================================================================

  describe("config edge cases", () => {
    it("should accept minimum valid maxCodeLength", () => {
      expect(() =>
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        createCodeModeMiddleware(mockClient as any, { maxCodeLength: 1 }),
      ).not.toThrow();
    });

    it("should accept maximum valid maxCodeLength", () => {
      expect(() =>
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        createCodeModeMiddleware(mockClient as any, { maxCodeLength: 100_000 }),
      ).not.toThrow();
    });

    it("should accept empty hostFunctions array", () => {
      expect(() =>
        // biome-ignore lint/suspicious/noExplicitAny: test mock
        createCodeModeMiddleware(mockClient as any, { hostFunctions: [] }),
      ).not.toThrow();
    });
  });

  // =========================================================================
  // Error type inheritance
  // =========================================================================

  describe("error inheritance", () => {
    it("all code-mode errors should extend CodeModeError", async () => {
      const errors = [
        new CodeSyntaxError("x", 1, "bad"),
        new CodeRuntimeError("x", "bad"),
        new CodeSandboxNotFoundError("sbx-1"),
      ];

      for (const err of errors) {
        expect(err).toBeInstanceOf(CodeModeError);
        expect(err).toBeInstanceOf(Error);
      }
    });
  });

  // =========================================================================
  // Stderr with line numbers
  // =========================================================================

  describe("line number extraction", () => {
    it("should extract line number from SyntaxError stderr", async () => {
      mockClient.sandbox.runCode.mockResolvedValue({
        stdout: "",
        stderr: '  File "<code>", line 5\n    x =\n       ^\nSyntaxError: invalid syntax',
        exit_code: 1,
        execution_time: 0.001,
      });

      // biome-ignore lint/suspicious/noExplicitAny: test mock
      const mw = createCodeModeMiddleware(mockClient as any);
      await mw.onSessionStart?.(ctx());

      const next = vi.fn().mockResolvedValue({
        content: codeBlock("x ="),
        model: "test",
      });

      try {
        await mw.wrapModelCall?.({ messages: [{ role: "user", content: "test" }] }, next);
        expect.fail("Should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CodeSyntaxError);
        expect((e as CodeSyntaxError).lineNumber).toBe(5);
      }
    });
  });
});
