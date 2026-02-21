/**
 * Pure utility functions for the create-templar CLI.
 */

const INVALID_NAME_CHARS = /[^a-z0-9\-._~]/;
const RESERVED_NAMES = new Set([
  "node_modules",
  "favicon.ico",
  "package.json",
  "package-lock.json",
]);

export interface ValidationResult {
  readonly valid: boolean;
  readonly message?: string;
}

export function validateProjectName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, message: "Project name cannot be empty" };
  }

  const trimmed = name.trim();

  if (/^\.+$/.test(trimmed)) {
    return { valid: false, message: "Project name cannot be only dots" };
  }

  if (trimmed.startsWith(".") || trimmed.startsWith("-")) {
    return {
      valid: false,
      message: "Project name cannot start with a dot or hyphen",
    };
  }

  if (trimmed !== trimmed.toLowerCase()) {
    return { valid: false, message: "Project name must be lowercase" };
  }

  if (INVALID_NAME_CHARS.test(trimmed)) {
    return {
      valid: false,
      message:
        "Project name can only contain lowercase letters, numbers, hyphens, dots, underscores, and tildes",
    };
  }

  if (trimmed.length > 214) {
    return {
      valid: false,
      message: "Project name must be 214 characters or fewer",
    };
  }

  if (RESERVED_NAMES.has(trimmed)) {
    return { valid: false, message: `"${trimmed}" is a reserved name` };
  }

  return { valid: true };
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export function detectPackageManager(): PackageManager {
  const agent = process.env.npm_config_user_agent ?? "";
  if (agent.startsWith("pnpm/")) return "pnpm";
  if (agent.startsWith("yarn/")) return "yarn";
  if (agent.startsWith("bun/")) return "bun";
  return "npm";
}

export function replaceTemplateVars(
  content: string,
  vars: Readonly<Record<string, string>>,
): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

const TEXT_EXTENSIONS = new Set([
  ".yaml",
  ".yml",
  ".md",
  ".json",
  ".ts",
  ".js",
  ".mjs",
  ".cjs",
  ".env",
  ".example",
  ".txt",
  ".gitignore",
  ".npmrc",
  ".editorconfig",
]);

export function isTextFile(filename: string): boolean {
  const lower = filename.toLowerCase();
  for (const ext of TEXT_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  // Dotfiles without extension are typically text
  if (lower.startsWith("_") || lower.startsWith(".")) return true;
  return false;
}

export function formatTargetDir(name: string): string {
  return name.trim().replace(/\/+$/g, "");
}
