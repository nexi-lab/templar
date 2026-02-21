/**
 * Pure scaffold function: options -> files on disk.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isTextFile, replaceTemplateVars } from "./utils.js";

export interface ScaffoldOptions {
  readonly projectName: string;
  readonly template: string;
  readonly description: string;
  readonly targetDir: string;
  readonly overwrite: boolean;
}

export interface ScaffoldResult {
  readonly files: readonly string[];
  readonly targetDir: string;
}

/** File renames applied during scaffolding. */
const FILE_RENAMES: Readonly<Record<string, string>> = {
  _gitignore: ".gitignore",
  "_env.example": ".env.example",
};

function getTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  // In dev: src/ -> packages/create-templar/templates/
  // In dist: dist/ -> packages/create-templar/templates/
  return resolve(currentDir, "..", "templates");
}

function collectFiles(dir: string, base: string = ""): readonly string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...collectFiles(join(dir, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

export function scaffold(options: ScaffoldOptions): ScaffoldResult {
  const { projectName, template, description, targetDir, overwrite } = options;

  const templatesDir = getTemplatesDir();
  const templateDir = join(templatesDir, template);

  if (!existsSync(templateDir)) {
    throw new Error(`Template "${template}" not found at ${templateDir}`);
  }

  // Handle target directory
  if (existsSync(targetDir)) {
    if (overwrite) {
      rmSync(targetDir, { recursive: true, force: true });
    }
  }
  mkdirSync(targetDir, { recursive: true });

  const vars: Record<string, string> = {
    name: projectName,
    description,
  };

  const templateFiles = collectFiles(templateDir);
  const writtenFiles: string[] = [];

  for (const relativePath of templateFiles) {
    // Apply file renames
    const parts = relativePath.split("/");
    const fileName = parts.at(-1) ?? "";
    const renamed = FILE_RENAMES[fileName] ?? fileName;
    parts[parts.length - 1] = renamed;
    const destRelative = parts.join("/");

    const srcPath = join(templateDir, relativePath);
    const destPath = join(targetDir, destRelative);

    // Guard against path traversal
    if (!resolve(srcPath).startsWith(resolve(templateDir))) {
      throw new Error(`Invalid template path: ${relativePath}`);
    }
    if (!resolve(destPath).startsWith(resolve(targetDir))) {
      throw new Error(`Invalid destination path: ${destRelative}`);
    }

    // Ensure parent directory exists
    mkdirSync(dirname(destPath), { recursive: true });

    if (isTextFile(fileName) || isTextFile(renamed)) {
      const content = readFileSync(srcPath, "utf-8");
      const substituted = replaceTemplateVars(content, vars);
      writeFileSync(destPath, substituted, "utf-8");
    } else {
      cpSync(srcPath, destPath);
    }

    writtenFiles.push(destRelative);
  }

  return { files: writtenFiles, targetDir };
}

export function getAvailableTemplates(): readonly string[] {
  const templatesDir = getTemplatesDir();
  if (!existsSync(templatesDir)) return [];
  return readdirSync(templatesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}
