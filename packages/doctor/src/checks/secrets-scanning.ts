import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCheckResult, createFinding } from "../finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorFinding,
} from "../types.js";

// ---------------------------------------------------------------------------
// Secret patterns
// ---------------------------------------------------------------------------

const SECRET_PATTERNS: readonly {
  readonly id: string;
  readonly pattern: RegExp;
  readonly severity: "CRITICAL" | "HIGH";
  readonly title: string;
  readonly description: string;
}[] = [
  {
    id: "SEC-001",
    pattern: /sk-[A-Za-z0-9]{20,}/,
    severity: "CRITICAL",
    title: "OpenAI API key detected",
    description: "Found what appears to be an OpenAI API key",
  },
  {
    id: "SEC-001",
    pattern: /AKIA[0-9A-Z]{16}/,
    severity: "CRITICAL",
    title: "AWS access key detected",
    description: "Found what appears to be an AWS access key ID",
  },
  {
    id: "SEC-001",
    pattern: /ghp_[A-Za-z0-9]{36}/,
    severity: "CRITICAL",
    title: "GitHub personal access token detected",
    description: "Found what appears to be a GitHub personal access token",
  },
  {
    id: "SEC-003",
    pattern: /(?:password|passwd|pwd)["']?\s*[:=]\s*["'][^"']{4,}["']/i,
    severity: "CRITICAL",
    title: "Hardcoded password detected",
    description: "Found what appears to be a hardcoded password",
  },
  {
    id: "SEC-004",
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    severity: "CRITICAL",
    title: "Private key detected",
    description: "Found what appears to be a private key",
  },
  {
    id: "SEC-001",
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9+/=]{16,}["']/i,
    severity: "CRITICAL",
    title: "Generic API key detected",
    description: "Found what appears to be a hardcoded API key or secret",
  },
];

const SCAN_EXTENSIONS = new Set([".ts", ".js", ".yaml", ".yml", ".json", ".env"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", "coverage", "__tests__", "test"]);
const MAX_FILE_SIZE = 1_048_576; // 1MB

// ---------------------------------------------------------------------------
// Secrets scanning check
// ---------------------------------------------------------------------------

/**
 * Scans workspace files for hardcoded secrets, API keys, and credentials.
 */
export class SecretsScanningCheck implements DoctorCheck {
  readonly name = "secrets-scanning";
  readonly requiresNexus = false;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    const start = performance.now();
    const findings: DoctorFinding[] = [];

    // Check .env in .gitignore
    await this.checkGitignore(context.workspace, findings);

    // Scan files for secrets
    const files = await this.findFiles(context.workspace);
    for (const filePath of files) {
      await this.scanFile(filePath, context.workspace, findings);
    }

    const durationMs = Math.round(performance.now() - start);
    return createCheckResult(this.name, findings, durationMs);
  }

  private async checkGitignore(workspace: string, findings: DoctorFinding[]): Promise<void> {
    const gitignorePath = path.join(workspace, ".gitignore");
    const envPath = path.join(workspace, ".env");

    let envExists: boolean;
    try {
      await fs.access(envPath);
      envExists = true;
    } catch {
      envExists = false;
    }

    if (!envExists) return;

    let gitignoreContent: string;
    try {
      gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
    } catch {
      findings.push(
        createFinding({
          id: "SEC-002",
          checkName: this.name,
          severity: "HIGH",
          title: ".env file not in .gitignore",
          description: ".env file exists but .gitignore is missing or unreadable",
          remediation: "Add .env to .gitignore to prevent accidental commits",
          location: ".gitignore",
          owaspRef: ["ASI03"],
        }),
      );
      return;
    }

    const lines = gitignoreContent.split("\n").map((l) => l.trim());
    const hasEnvPattern = lines.some(
      (l) => l === ".env" || l === ".env*" || l === "*.env" || l === ".env.*",
    );

    if (!hasEnvPattern) {
      findings.push(
        createFinding({
          id: "SEC-002",
          checkName: this.name,
          severity: "HIGH",
          title: ".env file not in .gitignore",
          description: ".env file exists but is not excluded by .gitignore",
          remediation: "Add .env to .gitignore to prevent accidental commits",
          location: ".gitignore",
          owaspRef: ["ASI03"],
        }),
      );
    }
  }

  private async scanFile(
    filePath: string,
    workspace: string,
    findings: DoctorFinding[],
  ): Promise<void> {
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(filePath);
    } catch {
      return;
    }

    if (stat.size > MAX_FILE_SIZE) return;

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return;
    }

    const relative = path.relative(workspace, filePath);

    for (const pattern of SECRET_PATTERNS) {
      if (pattern.pattern.test(content)) {
        findings.push(
          createFinding({
            id: pattern.id,
            checkName: this.name,
            severity: pattern.severity,
            title: pattern.title,
            description: `${pattern.description} in ${relative}`,
            remediation: "Move secrets to environment variables or a secret manager",
            location: relative,
            owaspRef: ["ASI03"],
          }),
        );
      }
    }
  }

  private async findFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkDir(dir, results, 0);
    return results;
  }

  private async walkDir(dir: string, results: string[], depth: number): Promise<void> {
    if (depth > 5) return;

    let entries: Dirent[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.walkDir(fullPath, results, depth + 1);
        continue;
      }

      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        const isEnvFile = entry.name.startsWith(".env");
        if (SCAN_EXTENSIONS.has(ext) || isEnvFile) {
          results.push(fullPath);
        }
      }
    }
  }
}
