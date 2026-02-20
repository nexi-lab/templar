/**
 * Post-scaffold actions: git init, dependency install, next steps.
 */

import { spawnSync } from "node:child_process";
import pc from "picocolors";
import type { PackageManager } from "./utils.js";

export interface PostScaffoldOptions {
  readonly targetDir: string;
  readonly projectName: string;
  readonly packageManager: PackageManager;
  readonly initGit: boolean;
  readonly installDeps: boolean;
}

function exec(command: string, args: readonly string[], cwd: string): { ok: boolean } {
  const result = spawnSync(command, [...args], { cwd, stdio: "ignore" });
  return { ok: result.status === 0 };
}

export function postScaffold(options: PostScaffoldOptions): void {
  const { targetDir, projectName, packageManager, initGit, installDeps } = options;

  if (initGit) {
    const init = exec("git", ["init"], targetDir);
    if (init.ok) {
      exec("git", ["add", "-A"], targetDir);
      exec("git", ["commit", "-m", "Initial commit from create-templar"], targetDir);
    } else {
      console.log(`  ${pc.yellow("!")} Failed to initialize git repository`);
    }
  }

  if (installDeps) {
    const install = exec(packageManager, ["install"], targetDir);
    if (!install.ok) {
      console.log(
        `  ${pc.yellow("!")} Failed to install dependencies. Run ${packageManager} install manually.`,
      );
    }
  }

  printNextSteps({ projectName, packageManager, installDeps });
}

function printNextSteps(opts: {
  readonly projectName: string;
  readonly packageManager: PackageManager;
  readonly installDeps: boolean;
}): void {
  const { projectName, packageManager, installDeps } = opts;

  console.log();
  console.log(`  ${pc.bold("Next steps:")}`);
  console.log();
  console.log(`  ${pc.cyan(`cd ${projectName}`)}`);
  if (!installDeps) {
    console.log(`  ${pc.cyan(`${packageManager} install`)}`);
  }
  console.log(`  ${pc.cyan(`${packageManager} start`)}`);
  console.log();
}
