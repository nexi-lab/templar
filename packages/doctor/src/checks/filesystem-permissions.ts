import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createCheckResult, createFinding, createSkippedResult } from "../finding-factory.js";
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckResult,
  DoctorFinding,
} from "../types.js";

// ---------------------------------------------------------------------------
// Glob patterns for sensitive files
// ---------------------------------------------------------------------------

const SENSITIVE_PATTERNS = [
  "templar.yaml",
  ".env",
  ".env.local",
  ".env.production",
  ".env.staging",
];

const SENSITIVE_EXTENSIONS = [".key", ".pem"];

const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

// ---------------------------------------------------------------------------
// Filesystem permission check
// ---------------------------------------------------------------------------

/**
 * Checks filesystem permissions on sensitive configuration files.
 * Detects world-writable and group-writable files.
 */
export class FilesystemPermissionsCheck implements DoctorCheck {
  readonly name = "filesystem-permissions";
  readonly requiresNexus = false;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    if (process.platform === "win32") {
      return createSkippedResult(this.name, "Not supported on Windows");
    }

    const start = performance.now();
    const findings: DoctorFinding[] = [];

    const files = await this.findSensitiveFiles(context.workspace);

    for (const filePath of files) {
      try {
        const stat = await fs.stat(filePath);
        const mode = stat.mode;
        const relative = path.relative(context.workspace, filePath);

        // World-writable check (0o002)
        if (mode & 0o002) {
          findings.push(
            createFinding({
              id: "FS-001",
              checkName: this.name,
              severity: "CRITICAL",
              title: "World-writable sensitive file",
              description: `File "${relative}" is world-writable (mode: ${mode.toString(8)})`,
              remediation: `Run: chmod o-w "${relative}"`,
              location: relative,
              owaspRef: ["ASI05"],
            }),
          );
        }
        // Group-writable check (0o020)
        else if (mode & 0o020) {
          findings.push(
            createFinding({
              id: "FS-002",
              checkName: this.name,
              severity: "HIGH",
              title: "Group-writable sensitive file",
              description: `File "${relative}" is group-writable (mode: ${mode.toString(8)})`,
              remediation: `Run: chmod g-w "${relative}"`,
              location: relative,
              owaspRef: ["ASI05"],
            }),
          );
        }

        // Directory permission check
        if (stat.isDirectory() && mode & 0o002) {
          findings.push(
            createFinding({
              id: "FS-003",
              checkName: this.name,
              severity: "MEDIUM",
              title: "World-writable directory",
              description: `Directory "${relative}" is world-writable`,
              remediation: `Run: chmod o-w "${relative}"`,
              location: relative,
              owaspRef: ["ASI05"],
            }),
          );
        }
      } catch {
        // File may have been removed between scan and stat
      }
    }

    const durationMs = Math.round(performance.now() - start);
    return createCheckResult(this.name, findings, durationMs);
  }

  private async findSensitiveFiles(dir: string): Promise<string[]> {
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
        const isSensitiveName = SENSITIVE_PATTERNS.some(
          (p) => entry.name === p || entry.name.startsWith(".env"),
        );
        const isSensitiveExt = SENSITIVE_EXTENSIONS.some((ext) => entry.name.endsWith(ext));

        if (isSensitiveName || isSensitiveExt) {
          results.push(fullPath);
        }
      }
    }
  }
}
