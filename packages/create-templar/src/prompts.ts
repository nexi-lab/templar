/**
 * Minimal interactive prompt helpers using node:readline.
 */

import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import pc from "picocolors";

function createRl() {
  return createInterface({ input: stdin, output: stdout });
}

export async function text(opts: {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly validate?: (value: string) => string | undefined;
}): Promise<string> {
  const rl = createRl();
  const suffix = opts.defaultValue ? pc.dim(` (${opts.defaultValue})`) : "";
  try {
    for (;;) {
      const answer = await rl.question(`${pc.cyan("?")} ${opts.message}${suffix}: `);
      const value = answer.trim() || opts.defaultValue || "";
      if (opts.validate) {
        const error = opts.validate(value);
        if (error) {
          console.log(`  ${pc.red(error)}`);
          continue;
        }
      }
      return value;
    }
  } finally {
    rl.close();
  }
}

export async function select<T extends string>(opts: {
  readonly message: string;
  readonly options: ReadonlyArray<{
    readonly value: T;
    readonly label: string;
    readonly hint?: string;
  }>;
}): Promise<T> {
  const rl = createRl();
  try {
    console.log(`${pc.cyan("?")} ${opts.message}`);
    for (let i = 0; i < opts.options.length; i++) {
      const opt = opts.options[i];
      if (!opt) continue;
      const hint = opt.hint ? pc.dim(` — ${opt.hint}`) : "";
      console.log(`  ${pc.bold(`${i + 1})`)} ${opt.label}${hint}`);
    }
    for (;;) {
      const answer = await rl.question(`${pc.cyan("?")} Choose [1-${opts.options.length}]: `);
      const num = Number.parseInt(answer.trim(), 10);
      if (num >= 1 && num <= opts.options.length) {
        const selected = opts.options[num - 1];
        if (selected) return selected.value;
      }
      console.log(`  ${pc.red(`Please enter a number between 1 and ${opts.options.length}`)}`);
    }
  } finally {
    rl.close();
  }
}

export async function confirm(opts: {
  readonly message: string;
  readonly initialValue?: boolean;
}): Promise<boolean> {
  const rl = createRl();
  const hint = opts.initialValue ? "Y/n" : "y/N";
  try {
    const answer = await rl.question(`${pc.cyan("?")} ${opts.message} (${hint}): `);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "") return opts.initialValue ?? false;
    return trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

export function intro(title: string): void {
  console.log();
  console.log(`  ${pc.bgCyan(pc.black(` ${title} `))}`);
  console.log();
}

export function outro(message: string): void {
  console.log();
  console.log(`  ${message}`);
  console.log();
}

export function cancel(message: string): void {
  console.log();
  console.log(`  ${pc.red(message)}`);
}

export function spinner() {
  let timer: ReturnType<typeof setInterval> | undefined;
  const frames = [".", "..", "..."];
  let i = 0;

  return {
    start(message: string) {
      process.stdout.write(`  ${message}`);
      timer = setInterval(() => {
        process.stdout.write(`\r  ${message}${frames[i++ % frames.length] ?? ""}`);
      }, 300);
    },
    stop(message: string) {
      if (timer) clearInterval(timer);
      process.stdout.write(`\r  ${pc.green("✓")} ${message}\n`);
    },
  };
}
