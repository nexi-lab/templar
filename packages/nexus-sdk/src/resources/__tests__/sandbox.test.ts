import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NexusClient } from "../../client.js";
import type {
  CreateSandboxResponse,
  RunCodeResponse,
  SandboxInfoResponse,
} from "../../types/sandbox.js";

describe("SandboxResource", () => {
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
  // create()
  // =========================================================================

  describe("create", () => {
    const mockResponse: CreateSandboxResponse = {
      sandbox_id: "sbx-abc123",
      name: "code-mode-session",
      status: "running",
      provider: "monty",
      created_at: "2024-06-01T12:00:00Z",
    };

    it("should create a sandbox with minimal params", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.sandbox.create({
        name: "code-mode-session",
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "code-mode-session" }),
        }),
      );
    });

    it("should create a sandbox with provider", async () => {
      mockFetchResponse(mockResponse);

      await client.sandbox.create({
        name: "code-mode-session",
        provider: "monty",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox",
        expect.objectContaining({
          body: JSON.stringify({
            name: "code-mode-session",
            provider: "monty",
          }),
        }),
      );
    });

    it("should create a sandbox with all optional params", async () => {
      mockFetchResponse(mockResponse);

      await client.sandbox.create({
        name: "code-mode-session",
        provider: "monty",
        timeoutMinutes: 30,
        securityProfile: "strict",
        metadata: { session_id: "sess-123" },
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox",
        expect.objectContaining({
          body: JSON.stringify({
            name: "code-mode-session",
            provider: "monty",
            timeoutMinutes: 30,
            securityProfile: "strict",
            metadata: { session_id: "sess-123" },
          }),
        }),
      );
    });

    it("should return sandbox_id for future operations", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.sandbox.create({
        name: "code-mode-session",
      });

      expect(result.sandbox_id).toBe("sbx-abc123");
      expect(result.status).toBe("running");
      expect(result.provider).toBe("monty");
    });

    it("should propagate API errors on create", async () => {
      mockFetchError({ code: "VALIDATION_ERROR", message: "Invalid provider" }, 400);

      await expect(
        client.sandbox.create({
          name: "code-mode-session",
        }),
      ).rejects.toThrow("Invalid provider");
    });
  });

  // =========================================================================
  // runCode()
  // =========================================================================

  describe("runCode", () => {
    const mockResponse: RunCodeResponse = {
      stdout: '{"result": 42}',
      stderr: "",
      exit_code: 0,
      execution_time: 0.015,
    };

    it("should run code with minimal params", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.sandbox.runCode("sbx-abc123", {
        language: "python",
        code: 'print("hello")',
      });

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox/sbx-abc123/run",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            language: "python",
            code: 'print("hello")',
          }),
        }),
      );
    });

    it("should run code with timeout", async () => {
      mockFetchResponse(mockResponse);

      await client.sandbox.runCode("sbx-abc123", {
        language: "python",
        code: 'print("hello")',
        timeout: 30,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox/sbx-abc123/run",
        expect.objectContaining({
          body: JSON.stringify({
            language: "python",
            code: 'print("hello")',
            timeout: 30,
          }),
        }),
      );
    });

    it("should run code with host functions", async () => {
      mockFetchResponse(mockResponse);

      await client.sandbox.runCode("sbx-abc123", {
        language: "python",
        code: 'result = read_file("src/main.ts")',
        host_functions: ["read_file", "search", "memory_query"],
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox/sbx-abc123/run",
        expect.objectContaining({
          body: JSON.stringify({
            language: "python",
            code: 'result = read_file("src/main.ts")',
            host_functions: ["read_file", "search", "memory_query"],
          }),
        }),
      );
    });

    it("should return execution results", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.sandbox.runCode("sbx-abc123", {
        language: "python",
        code: 'print("hello")',
      });

      expect(result.stdout).toBe('{"result": 42}');
      expect(result.stderr).toBe("");
      expect(result.exit_code).toBe(0);
      expect(result.execution_time).toBe(0.015);
    });

    it("should handle non-zero exit codes", async () => {
      mockFetchResponse({
        stdout: "",
        stderr: "NameError: name 'x' is not defined",
        exit_code: 1,
        execution_time: 0.002,
      });

      const result = await client.sandbox.runCode("sbx-abc123", {
        language: "python",
        code: "print(x)",
      });

      expect(result.exit_code).toBe(1);
      expect(result.stderr).toContain("NameError");
    });

    it("should handle sandbox not found error", async () => {
      mockFetchError({ code: "NOT_FOUND", message: "Sandbox not found: sbx-invalid" }, 404);

      await expect(
        client.sandbox.runCode("sbx-invalid", {
          language: "python",
          code: 'print("hello")',
        }),
      ).rejects.toThrow("Sandbox not found");
    });

    it("should handle timeout errors", async () => {
      mockFetchError({ code: "TIMEOUT", message: "Code execution timed out" }, 408);

      await expect(
        client.sandbox.runCode("sbx-abc123", {
          language: "python",
          code: "while True: pass",
          timeout: 5,
        }),
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // destroy()
  // =========================================================================

  describe("destroy", () => {
    const mockResponse: SandboxInfoResponse = {
      sandbox_id: "sbx-abc123",
      status: "destroyed",
      provider: "monty",
      created_at: "2024-06-01T12:00:00Z",
    };

    it("should destroy a sandbox", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.sandbox.destroy("sbx-abc123");

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.test.com/api/v2/sandbox/sbx-abc123",
        expect.objectContaining({ method: "DELETE" }),
      );
    });

    it("should return sandbox info at time of destruction", async () => {
      mockFetchResponse(mockResponse);

      const result = await client.sandbox.destroy("sbx-abc123");

      expect(result.sandbox_id).toBe("sbx-abc123");
      expect(result.status).toBe("destroyed");
    });

    it("should handle sandbox not found on destroy", async () => {
      mockFetchError({ code: "NOT_FOUND", message: "Sandbox not found: sbx-expired" }, 404);

      await expect(client.sandbox.destroy("sbx-expired")).rejects.toThrow("Sandbox not found");
    });
  });

  // =========================================================================
  // Error handling (cross-cutting)
  // =========================================================================

  describe("error handling", () => {
    it("should handle network errors", async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

      await expect(client.sandbox.create({ name: "test" })).rejects.toThrow("Network error");
    });

    it("should handle 401 unauthorized", async () => {
      mockFetchError({ code: "UNAUTHORIZED", message: "Invalid API key" }, 401);

      await expect(client.sandbox.create({ name: "test" })).rejects.toThrow("Invalid API key");
    });

    it("should handle 500 server errors", async () => {
      mockFetchError({ code: "INTERNAL_ERROR", message: "Server error" }, 500);

      const singleRetryClient = new NexusClient({
        apiKey: "test-key",
        baseUrl: "https://api.test.com",
        retry: { maxAttempts: 1 },
      });

      await expect(singleRetryClient.sandbox.create({ name: "test" })).rejects.toThrow(
        "Server error",
      );
    });
  });

  // =========================================================================
  // Integration scenarios
  // =========================================================================

  describe("integration scenarios", () => {
    it("should handle full create-run-destroy lifecycle", async () => {
      // Step 1: Create sandbox
      const createResponse: CreateSandboxResponse = {
        sandbox_id: "sbx-lifecycle",
        name: "code-mode-session",
        status: "running",
        provider: "monty",
        created_at: "2024-06-01T12:00:00Z",
      };
      mockFetchResponse(createResponse);

      const sandbox = await client.sandbox.create({
        name: "code-mode-session",
        provider: "monty",
      });

      expect(sandbox.sandbox_id).toBe("sbx-lifecycle");

      // Step 2: Run code
      const runResponse: RunCodeResponse = {
        stdout: '{"files": ["main.ts", "utils.ts"]}',
        stderr: "",
        exit_code: 0,
        execution_time: 0.05,
      };
      mockFetchResponse(runResponse);

      const result = await client.sandbox.runCode(sandbox.sandbox_id, {
        language: "python",
        code: 'files = search("*.ts")\nprint(json.dumps({"files": files}))',
        host_functions: ["search"],
      });

      expect(result.exit_code).toBe(0);

      // Step 3: Destroy sandbox
      const destroyResponse: SandboxInfoResponse = {
        sandbox_id: "sbx-lifecycle",
        status: "destroyed",
        provider: "monty",
        created_at: "2024-06-01T12:00:00Z",
      };
      mockFetchResponse(destroyResponse);

      const destroyed = await client.sandbox.destroy(sandbox.sandbox_id);
      expect(destroyed.status).toBe("destroyed");
    });
  });
});
