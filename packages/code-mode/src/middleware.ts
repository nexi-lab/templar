/**
 * CodeModeMiddleware — TemplarMiddleware that enables LLM code execution
 *
 * Instead of sequential tool calls, the LLM writes Python code that
 * programmatically calls tools as functions. Pydantic's Monty interpreter
 * (Rust, sub-microsecond startup, deny-by-default) executes this safely.
 */

import type { NexusClient } from "@nexus/sdk";
import type {
  ModelHandler,
  ModelRequest,
  ModelResponse,
  SessionContext,
  TemplarMiddleware,
} from "@templar/core";
import {
  CodeExecutionTimeoutError,
  CodeModeError,
  CodeResourceExceededError,
  CodeRuntimeError,
  CodeSandboxNotFoundError,
  CodeSyntaxError,
} from "@templar/errors";

import { generateCodeModePrompt } from "./prompt.js";
import type { CodeModeConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { extractCodeBlock, validateCodeModeConfig, validateCodeOutput } from "./validation.js";

/**
 * Middleware that intercepts LLM model calls and executes code-mode blocks
 * in a Monty sandbox via the Nexus Sandbox API.
 */
export class CodeModeMiddleware implements TemplarMiddleware {
  readonly name = "code-mode";

  private readonly client: NexusClient;
  private readonly config: CodeModeConfig;
  private readonly codeModePrompt: string;
  private sandboxId: string | null = null;

  constructor(client: NexusClient, config: CodeModeConfig) {
    const errors = validateCodeModeConfig(config);
    if (errors.length > 0) {
      throw new Error(`Invalid code-mode config: ${errors.join("; ")}`);
    }

    this.client = client;
    this.config = config;
    this.codeModePrompt = generateCodeModePrompt(config.hostFunctions);
  }

  /**
   * Create sandbox on session start.
   */
  async onSessionStart(context: SessionContext): Promise<void> {
    if (!this.config.enabled) return;

    const result = await this.client.sandbox.create({
      name: `code-mode-${context.sessionId}`,
      provider: "monty",
      securityProfile: this.config.resourceProfile,
    });

    this.sandboxId = result.sandbox_id;
  }

  /**
   * Destroy sandbox on session end.
   */
  async onSessionEnd(_context: SessionContext): Promise<void> {
    if (this.sandboxId === null) return;

    try {
      await this.client.sandbox.destroy(this.sandboxId);
    } finally {
      this.sandboxId = null;
    }
  }

  /**
   * Intercept model calls to inject code-mode prompt and execute code blocks.
   */
  async wrapModelCall(req: ModelRequest, next: ModelHandler): Promise<ModelResponse> {
    if (!this.config.enabled || this.sandboxId === null) {
      return next(req);
    }

    // Inject code-mode system prompt
    const augmentedReq: ModelRequest = {
      ...req,
      systemPrompt: req.systemPrompt
        ? `${req.systemPrompt}\n\n${this.codeModePrompt}`
        : this.codeModePrompt,
    };

    const response = await next(augmentedReq);

    // Check if response contains a code-mode block
    const code = extractCodeBlock(response.content);
    if (code === null) {
      return response;
    }

    // Validate code length
    if (code.length > this.config.maxCodeLength) {
      throw new CodeSyntaxError(
        code,
        0,
        `Code length ${code.length} exceeds maximum ${this.config.maxCodeLength}`,
      );
    }

    // Execute in sandbox
    const executionResult = await this.executeCode(code);

    // Return a new response with the execution result
    return {
      ...response,
      content: JSON.stringify(executionResult.data ?? executionResult.rawStdout),
      metadata: {
        ...response.metadata,
        codeModeExecuted: true,
        executionStderr: executionResult.stderr,
      },
    };
  }

  /**
   * Execute code in the sandbox and map errors to CodeMode error types.
   */
  private async executeCode(code: string) {
    if (this.sandboxId === null) {
      throw new CodeSandboxNotFoundError("no-sandbox");
    }

    try {
      const result = await this.client.sandbox.runCode(this.sandboxId, {
        language: "python",
        code,
        host_functions: [...this.config.hostFunctions],
      });

      if (result.exit_code !== 0) {
        this.throwCodeError(code, result.stderr, result.exit_code);
      }

      return validateCodeOutput(result.stdout, result.stderr);
    } catch (error) {
      // Re-throw code-mode errors as-is
      if (error instanceof CodeModeError) {
        throw error;
      }

      // Map Nexus API errors
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("not found") || message.includes("404")) {
        throw new CodeSandboxNotFoundError(this.sandboxId);
      }
      if (message.includes("timeout") || message.includes("408")) {
        throw new CodeExecutionTimeoutError(30);
      }
      throw new CodeRuntimeError(code, message);
    }
  }

  /**
   * Map non-zero exit codes to specific error types based on stderr content.
   */
  private throwCodeError(code: string, stderr: string, _exitCode: number): never {
    const lower = stderr.toLowerCase();

    if (lower.includes("syntaxerror") || lower.includes("syntax error")) {
      const lineMatch = /line (\d+)/.exec(stderr);
      const line = lineMatch?.[1] ? Number.parseInt(lineMatch[1], 10) : 0;
      throw new CodeSyntaxError(code, line, stderr);
    }

    if (lower.includes("timeout") || lower.includes("timed out")) {
      throw new CodeExecutionTimeoutError(30);
    }

    if (lower.includes("memory") || lower.includes("memoryerror")) {
      throw new CodeResourceExceededError("memory");
    }

    if (lower.includes("recursion") || lower.includes("recursionerror")) {
      throw new CodeResourceExceededError("recursion");
    }

    throw new CodeRuntimeError(code, stderr);
  }
}

/**
 * Factory function for creating a CodeModeMiddleware instance.
 */
export function createCodeModeMiddleware(
  client: NexusClient,
  config?: Partial<CodeModeConfig>,
): CodeModeMiddleware {
  const merged: CodeModeConfig = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  return new CodeModeMiddleware(client, merged);
}
