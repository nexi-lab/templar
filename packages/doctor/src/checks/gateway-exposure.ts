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
// Gateway exposure check
// ---------------------------------------------------------------------------

/**
 * Scans gateway.yaml for insecure configurations:
 * legacy auth, wildcard bind, TOFU, exposed API keys, missing rate limiting.
 */
export class GatewayExposureCheck implements DoctorCheck {
  readonly name = "gateway-exposure";
  readonly requiresNexus = false;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    const start = performance.now();
    const findings: DoctorFinding[] = [];

    const configPath = path.join(context.workspace, "gateway.yaml");
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

    const gw = config as Record<string, unknown>;

    // GW-001: Legacy auth mode
    const authMode = gw.authMode ?? gw.auth;
    if (authMode === "legacy" || authMode === "none") {
      findings.push(
        createFinding({
          id: "GW-001",
          checkName: this.name,
          severity: "HIGH",
          title: "Legacy or no authentication",
          description: `Gateway uses "${String(authMode)}" authentication mode`,
          remediation: "Configure device-key or mTLS authentication",
          location: "gateway.yaml:authMode",
          owaspRef: ["ASI07"],
        }),
      );
    }

    // GW-002: Wildcard bind without TLS
    const bind = gw.bind ?? gw.host ?? gw.listen;
    const tls = gw.tls ?? gw.ssl;
    if (typeof bind === "string" && bind.includes("0.0.0.0") && !tls) {
      findings.push(
        createFinding({
          id: "GW-002",
          checkName: this.name,
          severity: "CRITICAL",
          title: "Wildcard bind without TLS",
          description: "Gateway binds to 0.0.0.0 without TLS enabled",
          remediation: "Enable TLS or bind to a specific interface (127.0.0.1)",
          location: "gateway.yaml:bind",
          owaspRef: ["ASI05", "ASI07"],
        }),
      );
    }

    // GW-003: TOFU enabled
    const tofu = gw.tofu ?? gw.trustOnFirstUse;
    if (tofu === true) {
      findings.push(
        createFinding({
          id: "GW-003",
          checkName: this.name,
          severity: "HIGH",
          title: "Trust-On-First-Use enabled",
          description: "Gateway allows TOFU device key registration",
          remediation: "Pre-register device keys and disable TOFU in production",
          location: "gateway.yaml:tofu",
          owaspRef: ["ASI07"],
        }),
      );
    }

    // GW-004: Exposed API key in config
    const apiKey = gw.apiKey ?? gw.api_key;
    if (typeof apiKey === "string" && apiKey.length > 0 && !apiKey.startsWith("${")) {
      findings.push(
        createFinding({
          id: "GW-004",
          checkName: this.name,
          severity: "CRITICAL",
          title: "API key exposed in gateway config",
          description: "Gateway config contains a hardcoded API key",
          remediation: `Use environment variable interpolation: \${API_KEY}`,
          location: "gateway.yaml:apiKey",
          owaspRef: ["ASI05"],
        }),
      );
    }

    // GW-005: No rate limiting
    const rateLimit = gw.rateLimit ?? gw.rateLimiting ?? gw.throttle;
    if (!rateLimit) {
      findings.push(
        createFinding({
          id: "GW-005",
          checkName: this.name,
          severity: "MEDIUM",
          title: "No rate limiting configured",
          description: "Gateway has no rate limiting configuration",
          remediation: "Add rate limiting to prevent abuse",
          location: "gateway.yaml",
          owaspRef: ["ASI07"],
        }),
      );
    }

    const durationMs = Math.round(performance.now() - start);
    return createCheckResult(this.name, findings, durationMs);
  }
}
