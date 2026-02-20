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
// Dangerous code patterns
// ---------------------------------------------------------------------------

const DANGEROUS_PATTERNS: readonly {
  readonly id: string;
  readonly pattern: RegExp;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM";
  readonly title: string;
  readonly owaspRef: readonly ("ASI02" | "ASI04")[];
}[] = [
  {
    id: "SK-001",
    pattern: /\beval\s*\(/,
    severity: "CRITICAL",
    title: "eval() usage detected",
    owaspRef: ["ASI02"],
  },
  {
    id: "SK-001",
    pattern: /\bnew\s+Function\s*\(/,
    severity: "CRITICAL",
    title: "new Function() usage detected",
    owaspRef: ["ASI02"],
  },
  {
    id: "SK-002",
    pattern: /\bchild_process\b/,
    severity: "CRITICAL",
    title: "child_process usage detected",
    owaspRef: ["ASI02", "ASI04"],
  },
  {
    id: "SK-002",
    pattern: /\bexec\s*\(/,
    severity: "CRITICAL",
    title: "exec() usage detected",
    owaspRef: ["ASI02"],
  },
  {
    id: "SK-002",
    pattern: /\bspawn\s*\(/,
    severity: "CRITICAL",
    title: "spawn() usage detected",
    owaspRef: ["ASI02"],
  },
  {
    id: "SK-003",
    pattern: /\bfs\.(?:rm|rmdir|unlink|writeFile)\s*\(/,
    severity: "HIGH",
    title: "Destructive filesystem operation",
    owaspRef: ["ASI02"],
  },
  {
    id: "SK-004",
    pattern: /\bprocess\.env\b/,
    severity: "MEDIUM",
    title: "process.env access detected",
    owaspRef: ["ASI04"],
  },
  {
    id: "SK-005",
    pattern: /\bimport\s*\(/,
    severity: "HIGH",
    title: "Dynamic import() detected",
    owaspRef: ["ASI04"],
  },
];

const SKILL_GLOBS = ["SKILL.md"];
const CODE_EXTENSIONS = new Set([".ts", ".js"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", ".git", "coverage"]);

// ---------------------------------------------------------------------------
// Skill code safety check
// ---------------------------------------------------------------------------

/**
 * Scans skill definitions and code for dangerous patterns:
 * eval, child_process, exec, spawn, dynamic import, env access.
 */
export class SkillCodeSafetyCheck implements DoctorCheck {
  readonly name = "skill-code-safety";
  readonly requiresNexus = false;

  async run(context: DoctorCheckContext): Promise<DoctorCheckResult> {
    const start = performance.now();
    const findings: DoctorFinding[] = [];

    // Scan SKILL.md files for code fences
    const skillFiles = await this.findFiles(context.workspace, SKILL_GLOBS, true);
    for (const filePath of skillFiles) {
      const codeBlocks = await this.extractCodeFromMarkdown(filePath);
      const relative = path.relative(context.workspace, filePath);
      for (const code of codeBlocks) {
        this.scanCode(code, relative, findings);
      }
    }

    // Scan skills/**/*.{ts,js} files
    const skillsDir = path.join(context.workspace, "skills");
    const codeFiles = await this.findCodeFiles(skillsDir);
    for (const filePath of codeFiles) {
      let content: string;
      try {
        content = await fs.readFile(filePath, "utf-8");
      } catch {
        continue;
      }
      const relative = path.relative(context.workspace, filePath);
      this.scanCode(content, relative, findings);
    }

    const durationMs = Math.round(performance.now() - start);
    return createCheckResult(this.name, findings, durationMs);
  }

  private scanCode(content: string, location: string, findings: DoctorFinding[]): void {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.pattern.test(content)) {
        findings.push(
          createFinding({
            id: pattern.id,
            checkName: this.name,
            severity: pattern.severity,
            title: pattern.title,
            description: `${pattern.title} in ${location}`,
            remediation: "Remove or sandbox dangerous code patterns in skills",
            location,
            owaspRef: pattern.owaspRef,
          }),
        );
      }
    }
  }

  private async extractCodeFromMarkdown(filePath: string): Promise<string[]> {
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return [];
    }

    const codeBlocks: string[] = [];
    const fenceRegex = /```(?:typescript|javascript|ts|js)?\n([\s\S]*?)```/g;
    for (const match of content.matchAll(fenceRegex)) {
      const block = match[1];
      if (block) {
        codeBlocks.push(block);
      }
    }
    return codeBlocks;
  }

  private async findFiles(
    dir: string,
    names: readonly string[],
    recurse: boolean,
  ): Promise<string[]> {
    const results: string[] = [];
    await this.walkForNames(dir, new Set(names), results, recurse ? 5 : 0, 0);
    return results;
  }

  private async walkForNames(
    dir: string,
    names: ReadonlySet<string>,
    results: string[],
    maxDepth: number,
    depth: number,
  ): Promise<void> {
    if (depth > maxDepth) return;

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
        await this.walkForNames(fullPath, names, results, maxDepth, depth + 1);
      } else if (entry.isFile() && names.has(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  private async findCodeFiles(dir: string): Promise<string[]> {
    const results: string[] = [];
    await this.walkForExtensions(dir, results, 0);
    return results;
  }

  private async walkForExtensions(dir: string, results: string[], depth: number): Promise<void> {
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
        await this.walkForExtensions(fullPath, results, depth + 1);
      } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }
}
