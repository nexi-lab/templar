/**
 * createExecApprovalsMiddleware — Templar middleware for command approval.
 *
 * Lifecycle:
 *   onSessionStart: Initialize ExecApprovals, load allowlist
 *   wrapToolCall:   Intercept bash/exec tool calls, run analyze()
 *   onSessionEnd:   Flush dirty allowlist (if Nexus configured)
 */

import type {
  SessionContext,
  TemplarMiddleware,
  ToolHandler,
  ToolRequest,
  ToolResponse,
} from "@templar/core";
import { ExecApprovalCommandBlockedError, ExecApprovalDeniedError } from "@templar/errors";
import { AllowlistStore } from "./allowlist.js";
import { ExecApprovals, extractPattern } from "./analyzer.js";
import { resolveExecApprovalsConfig } from "./config.js";
import { PACKAGE_NAME } from "./constants.js";
import type { AnalysisResult, ExecApprovalsConfig, ResolvedExecApprovalsConfig } from "./types.js";

/**
 * Creates a Templar middleware that analyzes and gates shell command execution.
 */
export function createExecApprovalsMiddleware(config: ExecApprovalsConfig): TemplarMiddleware {
  const resolved = resolveExecApprovalsConfig(config);
  return new ExecApprovalsMiddleware(resolved);
}

class ExecApprovalsMiddleware implements TemplarMiddleware {
  readonly name = PACKAGE_NAME;
  private readonly config: ResolvedExecApprovalsConfig;
  private analyzer: ExecApprovals | undefined;
  private allowlist: AllowlistStore | undefined;

  constructor(config: ResolvedExecApprovalsConfig) {
    this.config = config;
  }

  async onSessionStart(_context: SessionContext): Promise<void> {
    this.allowlist = new AllowlistStore(this.config.maxPatterns);
    this.analyzer = new ExecApprovals(this.config, this.allowlist);
  }

  async wrapToolCall(req: ToolRequest, next: ToolHandler): Promise<ToolResponse> {
    // Only intercept bash/exec tool calls
    if (!this.config.toolNames.has(req.toolName)) {
      return next(req);
    }

    // Lazy initialization (if session start wasn't called)
    if (!this.analyzer || !this.allowlist) {
      this.allowlist = new AllowlistStore(this.config.maxPatterns);
      this.analyzer = new ExecApprovals(this.config, this.allowlist);
    }

    // Extract the command string from the tool input
    const command = extractCommandFromInput(req.input);
    if (command === undefined) {
      // No command found — pass through (non-command tool call)
      return next(req);
    }

    const result = this.analyzer.analyze(command);

    switch (result.action) {
      case "allow":
        return this.passThrough(req, next, result);

      case "deny":
        throw new ExecApprovalCommandBlockedError(command, result.matchedPattern ?? "unknown");

      case "ask":
        return this.handleAsk(req, next, command, result);
    }
  }

  async onSessionEnd(_context: SessionContext): Promise<void> {
    // Flush dirty allowlist if needed
    // (Nexus sync would go here — currently in-memory only)
    this.analyzer = undefined;
    this.allowlist = undefined;
  }

  private async passThrough(
    req: ToolRequest,
    next: ToolHandler,
    result: AnalysisResult,
  ): Promise<ToolResponse> {
    const response = await next(req);
    return attachAnalysisMetrics(response, result);
  }

  private async handleAsk(
    req: ToolRequest,
    next: ToolHandler,
    command: string,
    result: AnalysisResult,
  ): Promise<ToolResponse> {
    if (!this.config.onApprovalRequest) {
      // No approval callback configured — default to ask (pass through with metadata)
      const response = await next(req);
      return attachAnalysisMetrics(response, result);
    }

    const decision = await this.config.onApprovalRequest(result);

    if (decision === "deny") {
      throw new ExecApprovalDeniedError(
        command,
        this.config.agentId,
        "Human operator denied the command",
      );
    }

    // Record approval for auto-promotion
    const pattern = extractPattern(result.command);
    this.analyzer?.recordApproval(pattern);

    const response = await next(req);
    return attachAnalysisMetrics(response, result);
  }
}

/**
 * Extracts a command string from a tool input.
 *
 * Supports:
 *   - string input (the command itself)
 *   - { command: string } object
 *   - { input: string } object
 */
function extractCommandFromInput(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input;
  }

  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === "string") return obj.command;
    if (typeof obj.input === "string") return obj.input;
  }

  return undefined;
}

function attachAnalysisMetrics(response: ToolResponse, result: AnalysisResult): ToolResponse {
  return {
    ...response,
    metadata: {
      ...response.metadata,
      execApproval: {
        action: result.action,
        risk: result.risk,
        reason: result.reason,
        binary: result.command.binary,
        ...(result.matchedPattern ? { matchedPattern: result.matchedPattern } : {}),
        ...(result.matchedRule ? { matchedRule: result.matchedRule } : {}),
      },
    },
  };
}
