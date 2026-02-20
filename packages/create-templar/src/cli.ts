/**
 * CLI pipeline: parse args -> prompt for missing -> validate -> scaffold -> post-scaffold.
 */

import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgv } from "./args.js";
import { postScaffold } from "./post-scaffold.js";
import * as p from "./prompts.js";
import { getAvailableTemplates, scaffold } from "./scaffold.js";
import { detectPackageManager, formatTargetDir, validateProjectName } from "./utils.js";

export interface CliArgs {
  readonly projectName: string | undefined;
  readonly template: string | undefined;
  readonly yes: boolean;
  readonly overwrite: boolean;
  readonly help: boolean;
}

const TEMPLATE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "code-builder": "Overnight CI agent that builds, tests, and reports",
  "research-tracker": "Publication monitoring every 6 hours",
  "daily-digest": "Morning Slack summary at 8 AM",
  "inbox-assistant": "Email triage every 30 minutes",
  "knowledge-base": "RAG-powered document Q&A",
};

export function parseArgs(argv: readonly string[]): CliArgs {
  const { positionals, flags } = parseArgv(argv);

  return {
    projectName: positionals[0],
    template: typeof flags.template === "string" ? flags.template : undefined,
    yes: flags.yes === true,
    overwrite: flags.overwrite === true,
    help: flags.help === true,
  };
}

function isCi(): boolean {
  return Boolean(process.env.CI);
}

function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true;
  const entries = readdirSync(dir);
  return entries.length === 0;
}

function printHelp(): void {
  console.log(`
  create-templar - Scaffold a new Templar agent project

  Usage:
    create-templar [project-name] [options]

  Options:
    -t, --template <name>  Template to use
    -y, --yes              Skip prompts, use defaults
    -o, --overwrite        Overwrite existing directory
    -h, --help             Show this help message

  Templates:
    code-builder           Overnight CI agent
    research-tracker       Publication monitoring
    daily-digest           Morning Slack summary
    inbox-assistant        Email triage
    knowledge-base         RAG document Q&A

  Examples:
    create-templar my-agent
    create-templar my-agent --template daily-digest --yes
`);
}

export async function main(argv: readonly string[]): Promise<void> {
  const cliArgs = parseArgs(argv);

  if (cliArgs.help) {
    printHelp();
    return;
  }

  const nonInteractive = cliArgs.yes || isCi();

  p.intro("create-templar");

  // 1. Project name
  let projectName = cliArgs.projectName;
  if (!projectName) {
    if (nonInteractive) {
      p.cancel("Project name is required in non-interactive mode.");
      process.exit(1);
    }
    projectName = await p.text({
      message: "Project name",
      placeholder: "my-agent",
      validate(value) {
        const result = validateProjectName(value);
        if (!result.valid) return result.message;
      },
    });
  } else {
    const validation = validateProjectName(projectName);
    if (!validation.valid) {
      p.cancel(validation.message ?? "Invalid project name.");
      process.exit(1);
    }
  }

  // 2. Template selection
  const availableTemplates = getAvailableTemplates();
  let template = cliArgs.template;
  if (!template) {
    if (nonInteractive) {
      template = availableTemplates[0] ?? "code-builder";
    } else {
      template = await p.select({
        message: "Select a template",
        options: availableTemplates.map((t) => ({
          value: t,
          label: t
            .split("-")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" "),
          hint: TEMPLATE_DESCRIPTIONS[t] ?? "",
        })),
      });
    }
  }

  if (!availableTemplates.includes(template)) {
    p.cancel(`Unknown template "${template}". Available: ${availableTemplates.join(", ")}`);
    process.exit(1);
  }

  // 3. Description
  let description: string;
  if (nonInteractive) {
    description = TEMPLATE_DESCRIPTIONS[template] ?? "A Templar agent project";
  } else {
    description = await p.text({
      message: "Description (optional)",
      defaultValue: TEMPLATE_DESCRIPTIONS[template] ?? "A Templar agent project",
    });
  }

  // 4. Target directory
  const targetDir = resolve(process.cwd(), formatTargetDir(projectName));
  let overwrite = cliArgs.overwrite;

  if (!isDirEmpty(targetDir) && !overwrite) {
    if (nonInteractive) {
      p.cancel(`Directory "${projectName}" is not empty. Use --overwrite to replace.`);
      process.exit(1);
    }
    overwrite = await p.confirm({
      message: `Directory "${projectName}" is not empty. Overwrite?`,
      initialValue: false,
    });
    if (!overwrite) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  // 5. Git init
  let initGit: boolean;
  if (nonInteractive) {
    initGit = true;
  } else {
    initGit = await p.confirm({
      message: "Initialize a git repository?",
      initialValue: true,
    });
  }

  // 6. Install deps
  const packageManager = detectPackageManager();
  let installDeps: boolean;
  if (nonInteractive) {
    installDeps = true;
  } else {
    installDeps = await p.confirm({
      message: `Install dependencies? (using ${packageManager})`,
      initialValue: true,
    });
  }

  // Scaffold
  const s = p.spinner();
  s.start("Scaffolding project...");

  const result = scaffold({
    projectName,
    template,
    description,
    targetDir,
    overwrite,
  });

  s.stop(`Scaffolded ${result.files.length} files.`);

  // Post-scaffold
  postScaffold({
    targetDir,
    projectName,
    packageManager,
    initGit,
    installDeps,
  });

  p.outro("Done! Your agent is ready.");
}
