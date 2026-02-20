import * as fs from "node:fs/promises";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { createCheckResult, createFinding } from "../finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorFinding,
} from "../types.js";

// ---------------------------------------------------------------------------
// Channel security check
// ---------------------------------------------------------------------------

/**
 * Scans templar.yaml for insecure channel configurations:
 * HTTP webhooks, missing allowlists, open DM, and main scoping.
 */
export class ChannelSecurityCheck implements DoctorCheck {
  readonly name = "channel-security";
  readonly requiresNexus = false;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    const start = performance.now();
    const findings: DoctorFinding[] = [];

    const configPath = path.join(context.workspace, "templar.yaml");
    let content: string;
    try {
      content = await fs.readFile(configPath, "utf-8");
    } catch {
      const durationMs = Math.round(performance.now() - start);
      return createCheckResult(this.name, findings, durationMs);
    }

    let config: unknown;
    try {
      config = parseYaml(content);
    } catch {
      const durationMs = Math.round(performance.now() - start);
      return createCheckResult(this.name, findings, durationMs);
    }

    if (!config || typeof config !== "object") {
      const durationMs = Math.round(performance.now() - start);
      return createCheckResult(this.name, findings, durationMs);
    }

    const channels = (config as Record<string, unknown>).channels;
    if (!channels || typeof channels !== "object" || !Array.isArray(channels)) {
      // Also check if channels is an object (map form)
      if (channels && typeof channels === "object") {
        this.scanChannels(Object.values(channels as Record<string, unknown>), findings);
      }
    } else {
      this.scanChannels(channels as unknown[], findings);
    }

    const durationMs = Math.round(performance.now() - start);
    return createCheckResult(this.name, findings, durationMs);
  }

  private scanChannels(channels: unknown[], findings: DoctorFinding[]): void {
    for (const channel of channels) {
      if (!channel || typeof channel !== "object") continue;
      const ch = channel as Record<string, unknown>;

      // CH-003: HTTP webhook (not HTTPS)
      const webhook = ch.webhook ?? ch.webhookUrl ?? ch.url;
      if (typeof webhook === "string" && webhook.startsWith("http://")) {
        findings.push(
          createFinding({
            id: "CH-003",
            checkName: this.name,
            severity: "CRITICAL",
            title: "HTTP webhook URL",
            description: `Channel uses insecure HTTP webhook: ${webhook}`,
            remediation: "Use HTTPS for all webhook URLs",
            location: "templar.yaml:channels",
            owaspRef: ["ASI09"],
          }),
        );
      }

      // CH-001: Open DM (no restrictions on direct messages)
      if (ch.allowDM === true && !ch.allowlist && !ch.allowList) {
        findings.push(
          createFinding({
            id: "CH-001",
            checkName: this.name,
            severity: "HIGH",
            title: "Open DM channel",
            description: "Channel allows direct messages without an allowlist",
            remediation: "Add an allowlist to restrict who can DM the agent",
            location: "templar.yaml:channels",
            owaspRef: ["ASI01", "ASI09"],
          }),
        );
      }

      // CH-002: Missing allowlist
      if (!ch.allowlist && !ch.allowList && !ch.allowedUsers && !ch.allowedChannels) {
        findings.push(
          createFinding({
            id: "CH-002",
            checkName: this.name,
            severity: "MEDIUM",
            title: "Missing channel allowlist",
            description: "Channel has no allowlist for users or channels",
            remediation: "Add an allowlist to restrict channel access",
            location: "templar.yaml:channels",
            owaspRef: ["ASI01"],
          }),
        );
      }

      // CH-004: Session scoping set to "main"
      if (ch.sessionScoping === "main" || ch.scoping === "main") {
        findings.push(
          createFinding({
            id: "CH-004",
            checkName: this.name,
            severity: "MEDIUM",
            title: "Main session scoping",
            description: "Channel uses 'main' session scoping — all users share context",
            remediation: "Use 'user' or 'channel' session scoping for tenant isolation",
            location: "templar.yaml:channels",
            owaspRef: ["ASI01"],
          }),
        );
      }
    }
  }
}
