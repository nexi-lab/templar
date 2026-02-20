/**
 * Minimal argument parser (replaces mri).
 */

export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

const ALIASES: Readonly<Record<string, string>> = {
  y: "yes",
  o: "overwrite",
  t: "template",
  h: "help",
};

const BOOLEAN_FLAGS = new Set(["yes", "overwrite", "help"]);

export function parseArgv(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) break;

    if (arg === "--") {
      // Everything after -- is positional
      positionals.push(...argv.slice(i + 1));
      break;
    }

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      const short = arg.slice(1);
      const long = ALIASES[short] ?? short;
      if (BOOLEAN_FLAGS.has(long)) {
        flags[long] = true;
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          flags[long] = next;
          i++;
        } else {
          flags[long] = true;
        }
      }
    } else {
      positionals.push(arg);
    }

    i++;
  }

  return { positionals, flags };
}
