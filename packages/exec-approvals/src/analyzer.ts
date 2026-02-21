/**
 * ExecApprovals — core analysis engine.
 *
 * Three-tier short-circuit pipeline:
 *   1. NEVER_ALLOW check → deny (critical)
 *   2. Safe binary check → allow (safe)
 *   3. Allowlist check → allow (low)
 *   4. Dangerous flag detection → classify risk
 *   5. Unknown binary → ask (risk based on features)
 */

import type { AllowlistStore } from "./allowlist.js";
import {
  DANGEROUS_FLAG_PATTERNS,
  INTERPRETER_BINARIES,
  NETWORK_BINARIES,
  NEVER_ALLOW_PATTERNS,
} from "./constants.js";
import { parseCommand } from "./parser.js";
import type {
  AnalysisResult,
  CommandPattern,
  ParsedCommand,
  ResolvedExecApprovalsConfig,
  RiskLevel,
} from "./types.js";

const MAX_COMMAND_LENGTH = 10_000;

export class ExecApprovals {
  private readonly config: ResolvedExecApprovalsConfig;
  private readonly allowlist: AllowlistStore;
  private readonly normalizedNeverAllow: readonly string[];

  constructor(config: ResolvedExecApprovalsConfig, allowlist: AllowlistStore) {
    this.config = config;
    this.allowlist = allowlist;
    // Pre-normalize NEVER_ALLOW patterns for faster matching
    this.normalizedNeverAllow = NEVER_ALLOW_PATTERNS.map(normalizeForMatch);
  }

  /**
   * Analyzes a shell command and determines the action + risk level.
   */
  analyze(command: string): AnalysisResult {
    // Tier 0: Length validation
    if (command.length > MAX_COMMAND_LENGTH) {
      return {
        action: "deny",
        risk: "critical",
        reason: `Command exceeds maximum length of ${MAX_COMMAND_LENGTH} characters`,
        command: parseCommand(command.slice(0, 200)),
        matchedRule: "never-allow",
      };
    }

    // Tier 1: NEVER_ALLOW check — O(n) pattern match
    const blockedPattern = this.matchNeverAllow(command);
    if (blockedPattern !== undefined) {
      return {
        action: "deny",
        risk: "critical",
        reason: `Command matches NEVER_ALLOW pattern: ${blockedPattern}`,
        command: parseCommand(command),
        matchedPattern: blockedPattern,
        matchedRule: "never-allow",
      };
    }

    // Tier 1b: Pipe-to-interpreter from network commands (curl/wget | sh/bash)
    const pipeToInterpFromNetwork = this.matchNetworkPipeToInterpreter(command);
    if (pipeToInterpFromNetwork !== undefined) {
      return {
        action: "deny",
        risk: "critical",
        reason: `Command pipes network output to interpreter: ${pipeToInterpFromNetwork}`,
        command: parseCommand(command),
        matchedPattern: pipeToInterpFromNetwork,
        matchedRule: "never-allow",
      };
    }

    // Tier 2: Parse command
    const parsed = parseCommand(command);

    // Unparseable → high risk, ask
    if (parsed.binary === "UNPARSEABLE") {
      return {
        action: "ask",
        risk: "high",
        reason: "Command could not be parsed — treating as high risk",
        command: parsed,
        matchedRule: "unknown",
      };
    }

    // Tier 3: Safe binary check — O(1) Set lookup
    if (this.config.safeBinaries.has(parsed.binary)) {
      // Even safe binaries can have dangerous flags
      const flagResult = this.checkDangerousFlags(parsed);
      if (flagResult) {
        return {
          action: "ask",
          risk: flagResult.risk,
          reason: flagResult.reason,
          command: parsed,
          matchedPattern: `${parsed.binary} ${flagResult.flags}`,
          matchedRule: "dangerous-pattern",
        };
      }

      // Check for pipe-to-interpreter pattern
      if (this.isPipeToInterpreter(command)) {
        return {
          action: "ask",
          risk: "high",
          reason: "Command pipes output to an interpreter",
          command: parsed,
          matchedRule: "dangerous-pattern",
        };
      }

      return {
        action: "allow",
        risk: "safe",
        reason: `Binary "${parsed.binary}" is in the safe registry`,
        command: parsed,
        matchedPattern: parsed.binary,
        matchedRule: "safe-binary",
      };
    }

    // Tier 4: Allowlist check — O(1) Map lookup
    const pattern = extractPattern(parsed);
    const allowlistEntry = this.allowlist.get(pattern);
    if (allowlistEntry) {
      return {
        action: "allow",
        risk: "low",
        reason: allowlistEntry.autoPromoted
          ? `Pattern "${pattern}" was auto-promoted after ${allowlistEntry.approvalCount} approvals`
          : `Pattern "${pattern}" was previously approved`,
        command: parsed,
        matchedPattern: pattern,
        matchedRule: "allowlist",
      };
    }

    // Tier 5: Risk classification for unknown binaries
    const risk = this.classifyRisk(parsed, command);
    return {
      action: "ask",
      risk,
      reason: this.buildRiskReason(parsed, risk),
      command: parsed,
      matchedRule: "unknown",
    };
  }

  /**
   * Records an approval for a command pattern.
   */
  recordApproval(pattern: CommandPattern): void {
    this.allowlist.recordApproval(pattern, this.config.autoPromoteThreshold);
  }

  /**
   * Returns the allowlist store for persistence operations.
   */
  getAllowlist(): AllowlistStore {
    return this.allowlist;
  }

  /**
   * Classifies the risk level of a parsed command.
   */
  classifyRisk(parsed: ParsedCommand, rawCommand?: string): RiskLevel {
    // Subshells are always high risk
    if (parsed.hasSubshell) {
      return "high";
    }

    // Pipe to interpreter is high risk
    if (rawCommand && this.isPipeToInterpreter(rawCommand)) {
      return "high";
    }

    // Check dangerous flag patterns
    const flagResult = this.checkDangerousFlags(parsed);
    if (flagResult) {
      return flagResult.risk;
    }

    // Chaining with unknown commands is medium risk
    if (parsed.hasChaining) {
      return "medium";
    }

    // Piping is medium risk (data flow)
    if (parsed.hasPipes) {
      return "medium";
    }

    // Redirects to files are low-medium risk
    if (parsed.hasRedirects) {
      return "medium";
    }

    return "low";
  }

  /**
   * Checks if the command matches a NEVER_ALLOW pattern.
   */
  private matchNeverAllow(command: string): string | undefined {
    const normalized = normalizeForMatch(command);

    for (let i = 0; i < this.normalizedNeverAllow.length; i++) {
      const pattern = this.normalizedNeverAllow[i] as string;
      const idx = normalized.indexOf(pattern);
      if (idx === -1) continue;

      // Boundary check for patterns ending with "." or ".." (filesystem tokens).
      // "rm -rf ." should NOT match "rm -rf ./build", but "mkfs" SHOULD match "mkfs.ext4".
      if (pattern.endsWith(" .") || pattern.endsWith(" ..")) {
        const afterIdx = idx + pattern.length;
        const charAfter = normalized[afterIdx];
        if (
          charAfter !== undefined &&
          charAfter !== " " &&
          charAfter !== "|" &&
          charAfter !== ";" &&
          charAfter !== "&" &&
          charAfter !== ")"
        ) {
          continue;
        }
      }

      return NEVER_ALLOW_PATTERNS[i] as string;
    }

    return undefined;
  }

  /**
   * Checks if a command pipes network tool output (curl/wget) to an interpreter.
   * This is categorically dangerous — always deny.
   */
  private matchNetworkPipeToInterpreter(rawCommand: string): string | undefined {
    const normalized = normalizeForMatch(rawCommand);

    for (const net of NETWORK_BINARIES) {
      if (
        !normalized.startsWith(net) &&
        !normalized.includes(` ${net} `) &&
        !normalized.includes(` ${net}`)
      ) {
        continue;
      }
      for (const interp of INTERPRETER_BINARIES) {
        if (normalized.includes(`| ${interp}`) || normalized.includes(`|${interp}`)) {
          return `${net} | ${interp}`;
        }
      }
    }
    return undefined;
  }

  /**
   * Checks if a command pipes output to an interpreter.
   */
  private isPipeToInterpreter(rawCommand: string): boolean {
    const normalized = normalizeForMatch(rawCommand);
    for (const interp of INTERPRETER_BINARIES) {
      if (normalized.includes(`|${interp}`) || normalized.includes(`| ${interp}`)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks for dangerous binary+flag combinations.
   */
  private checkDangerousFlags(
    parsed: ParsedCommand,
  ): { risk: RiskLevel; reason: string; flags: string } | undefined {
    const allFlags = parsed.flags.join(" ");
    const allArgs = [...parsed.args, ...parsed.flags].join(" ");

    for (const pattern of DANGEROUS_FLAG_PATTERNS) {
      if (parsed.binary !== pattern.binary) continue;

      // If the pattern has no flags, the binary itself is the risk
      if (pattern.flags.length === 0) {
        return { risk: pattern.risk, reason: pattern.reason, flags: "" };
      }

      for (const flag of pattern.flags) {
        // Check if the flag/subcommand combo appears
        if (flag.includes(" ")) {
          // Multi-word pattern like "push --force" — check in full args string
          if (allArgs.includes(flag) || `${parsed.subcommand ?? ""} ${allFlags}`.includes(flag)) {
            return { risk: pattern.risk, reason: pattern.reason, flags: flag };
          }
        } else if (allFlags.includes(flag) || allArgs.includes(flag)) {
          return { risk: pattern.risk, reason: pattern.reason, flags: flag };
        }
      }
    }

    return undefined;
  }

  private buildRiskReason(parsed: ParsedCommand, risk: RiskLevel): string {
    const parts: string[] = [`Unknown binary "${parsed.binary}"`];

    if (parsed.hasSubshell) parts.push("contains subshell");
    if (parsed.hasPipes) parts.push("uses pipes");
    if (parsed.hasChaining) parts.push("chains commands");
    if (parsed.hasRedirects) parts.push("uses redirects");

    return `${parts.join(", ")} — risk: ${risk}`;
  }
}

/**
 * Extracts a command pattern from a parsed command.
 * Returns "binary subcommand" for commands with subcommands, "binary" otherwise.
 */
export function extractPattern(parsed: ParsedCommand): CommandPattern {
  if (parsed.binary === "UNPARSEABLE") return "UNKNOWN";
  if (parsed.subcommand) return `${parsed.binary} ${parsed.subcommand}`;
  return parsed.binary;
}

/**
 * Normalizes a string for pattern matching: lowercase, collapse whitespace,
 * strip surrounding whitespace.
 */
function normalizeForMatch(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}
