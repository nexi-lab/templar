/**
 * createExecApprovalsMiddleware — Templar middleware for command approval.
 *
 * Lifecycle:
 *   onSessionStart: Initialize ExecApprovals, load allowlist from Nexus (if configured)
 *   wrapToolCall:   Intercept bash/exec tool calls, run analyze()
 *   onSessionEnd:   Flush dirty allowlist to Nexus (if configured)
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
import { mergePolicy } from "./policy-merge.js";
import type {
  AllowlistEntry,
  AnalysisResult,
  ExecApprovalsConfig,
  ResolvedExecApprovalsConfig,
} from "./types.js";

/**
 * Creates a Templar middleware that analyzes and gates shell command execution.
 */
export function createExecApprovalsMiddleware(config: ExecApprovalsConfig): TemplarMiddleware {
  const resolved = resolveExecApprovalsConfig(config);
  return new ExecApprovalsMiddleware(resolved);
}

class ExecApprovalsMiddleware implements TemplarMiddleware {
  readonly name = PACKAGE_NAME;
  private config: ResolvedExecApprovalsConfig;
  private analyzer: ExecApprovals | undefined;
  private allowlist: AllowlistStore | undefined;
  private syncTimer: ReturnType<typeof setInterval> | undefined;

  constructor(config: ResolvedExecApprovalsConfig) {
    this.config = config;
  }

  async onSessionStart(_context: SessionContext): Promise<void> {
    this.allowlist = new AllowlistStore(this.config.maxPatterns);

    if (this.config.nexusClient) {
      await this.loadFromNexus();
    }

    this.analyzer = new ExecApprovals(this.config, this.allowlist);

    // Start periodic sync timer if configured
    if (this.config.nexusClient && this.config.allowlistSyncInterval > 0) {
      this.syncTimer = setInterval(() => {
        void this.flushToNexus();
      }, this.config.allowlistSyncInterval);
    }
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
    // Stop periodic sync timer
    if (this.syncTimer !== undefined) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }

    // Flush dirty allowlist to Nexus
    if (this.config.nexusClient && this.allowlist?.isDirty()) {
      await this.flushToNexus();
    }

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
    // Nexus async approval mode
    if (this.config.approvalMode === "nexus" && this.config.nexusClient) {
      return this.handleNexusApproval(command, result);
    }

    if (!this.config.onApprovalRequest) {
      // No approval callback configured — fail-closed (deny by default)
      throw new ExecApprovalDeniedError(
        command,
        this.config.agentId,
        "No approval handler configured — command denied. Set onApprovalRequest callback or approvalMode: 'nexus'",
      );
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

  /**
   * Submits command for async Nexus approval.
   * Returns a deny response with metadata including the approval_id
   * so the caller can poll or react.
   */
  private async handleNexusApproval(command: string, result: AnalysisResult): Promise<never> {
    const client = this.config.nexusClient;
    if (!client) {
      throw new ExecApprovalDeniedError(
        command,
        this.config.agentId,
        "Nexus approval mode requires nexusClient",
      );
    }

    try {
      const approval = await client.execApprovals.submitApproval({
        agent_id: this.config.agentId,
        command,
        risk: result.risk,
        reason: result.reason,
        session_id: this.config.sessionId,
      });

      // Deny with metadata — caller harness handles interrupt/resume
      throw new ExecApprovalDeniedError(
        command,
        this.config.agentId,
        `Pending async approval: ${approval.approval_id}`,
      );
    } catch (error) {
      if (error instanceof ExecApprovalDeniedError) {
        throw error;
      }
      // Nexus submission failed — fail-closed
      throw new ExecApprovalDeniedError(
        command,
        this.config.agentId,
        "Failed to submit async approval to Nexus — command denied",
      );
    }
  }

  /**
   * Loads policy and allowlist from Nexus with timeout.
   * On failure, logs warning and continues with local defaults.
   */
  private async loadFromNexus(): Promise<void> {
    const client = this.config.nexusClient;
    if (!client || !this.allowlist) return;

    // Fetch policy with timeout
    try {
      const policy = await withTimeout(
        client.execApprovals.getPolicy({ agent_id: this.config.agentId }),
        this.config.policyTimeout,
      );

      if (policy) {
        this.config = mergePolicy(this.config, policy);
      }
    } catch {
      // Policy fetch failed — use local defaults
    }

    // Load allowlist from Nexus
    try {
      const response = await withTimeout(
        client.execApprovals.listAllowlist({ agent_id: this.config.agentId }),
        this.config.policyTimeout,
      );

      const entries: AllowlistEntry[] = response.entries.map((e) => ({
        pattern: e.pattern,
        approvalCount: e.approval_count,
        autoPromoted: e.auto_promoted,
        lastApprovedAt: new Date(e.last_approved_at).getTime(),
      }));

      this.allowlist.loadFrom(entries);
    } catch {
      // Allowlist load failed — start empty
    }
  }

  /**
   * Flushes dirty allowlist entries to Nexus.
   * On failure, logs warning (does not throw).
   */
  private async flushToNexus(): Promise<void> {
    const client = this.config.nexusClient;
    if (!client || !this.allowlist?.isDirty()) return;

    try {
      const dirtyEntries = this.allowlist.toDirtyEntries();
      if (dirtyEntries.length === 0) return;

      await client.execApprovals.batchUpsertAllowlist({
        agent_id: this.config.agentId,
        entries: dirtyEntries.map((e) => ({
          pattern: e.pattern,
          approval_count: e.approvalCount,
          auto_promoted: e.autoPromoted,
          last_approved_at: new Date(e.lastApprovedAt).toISOString(),
        })),
      });

      this.allowlist.markClean();
    } catch {
      // Flush failed — will retry on next interval or session end
    }
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
export function extractCommandFromInput(input: unknown): string | undefined {
  if (typeof input === "string") {
    return input || undefined;
  }

  if (typeof input === "object" && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.command === "string") return obj.command || undefined;
    if (typeof obj.input === "string") return obj.input || undefined;
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

/**
 * Runs a promise with a timeout. Rejects if the timeout elapses first.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
