/**
 * Shell command parser — lightweight tokenizer for command analysis.
 *
 * This is a UX-layer parser, NOT a security boundary.
 * On parse failure, returns UNPARSEABLE → analyzer treats as high-risk.
 */

import type { ParsedCommand } from "./types.js";

const PIPE_REGEX = /(?<![|])\|(?![|])/;
const REDIRECT_REGEX = /[<>]|>>|2>/;
const SUBSHELL_REGEX = /\$\(|\$\{|`/;
const CHAINING_REGEX = /&&|\|\||(?<![&]); ?/;

/**
 * Parses a raw shell command string into a structured ParsedCommand.
 *
 * On parse failure, returns a ParsedCommand with binary "UNPARSEABLE".
 */
export function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return makeUnparseable(raw);
  }

  // Detect structural features from raw command
  const hasPipes = PIPE_REGEX.test(trimmed);
  const hasRedirects = REDIRECT_REGEX.test(trimmed);
  const hasSubshell = SUBSHELL_REGEX.test(trimmed);
  const hasChaining = CHAINING_REGEX.test(trimmed);

  try {
    const tokens = tokenize(trimmed);

    if (tokens.length === 0) {
      return makeUnparseable(raw);
    }

    const binary = tokens[0] as string;

    // Determine subcommand: second token if it exists and is not a flag
    const secondToken: string | undefined = tokens[1];
    const subcommand =
      secondToken !== undefined && !secondToken.startsWith("-") ? secondToken : undefined;

    // Separate flags from args
    const flags: string[] = [];
    const args: string[] = [];

    for (let i = 1; i < tokens.length; i++) {
      const token = tokens[i] as string;
      if (token.startsWith("-")) {
        flags.push(token);
      } else {
        args.push(token);
      }
    }

    return {
      binary: binary,
      ...(subcommand !== undefined ? { subcommand } : {}),
      args,
      flags,
      hasRedirects,
      hasPipes,
      hasSubshell,
      hasChaining,
      rawCommand: raw,
    };
  } catch {
    return makeUnparseable(raw);
  }
}

/**
 * Creates an UNPARSEABLE ParsedCommand for failed parses.
 */
function makeUnparseable(raw: string): ParsedCommand {
  return {
    binary: "UNPARSEABLE",
    args: [],
    flags: [],
    hasRedirects: false,
    hasPipes: false,
    hasSubshell: false,
    hasChaining: false,
    rawCommand: raw,
  };
}

/**
 * Lightweight shell tokenizer.
 *
 * Handles: single quotes, double quotes, backslash escaping, pipes,
 * redirects, semicolons, &&, ||. Strips operators from the token stream
 * (we detect them via regex on the raw string).
 *
 * For chained/piped commands, only returns tokens from the FIRST command
 * segment, since that determines the primary binary.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    // Single-quoted string: no escape processing
    if (ch === "'") {
      i++;
      while (i < len && input[i] !== "'") {
        current += input[i];
        i++;
      }
      if (i >= len) {
        // Unterminated single quote
        throw new Error("unterminated single quote");
      }
      i++; // skip closing quote
      continue;
    }

    // Double-quoted string: backslash escaping
    if (ch === '"') {
      i++;
      while (i < len && input[i] !== '"') {
        if (input[i] === "\\" && i + 1 < len) {
          const next = input[i + 1];
          if (next === '"' || next === "\\" || next === "$" || next === "`") {
            current += next;
            i += 2;
            continue;
          }
        }
        current += input[i];
        i++;
      }
      if (i >= len) {
        throw new Error("unterminated double quote");
      }
      i++; // skip closing quote
      continue;
    }

    // Backslash escape (outside quotes)
    if (ch === "\\" && i + 1 < len) {
      current += input[i + 1];
      i += 2;
      continue;
    }

    // Operators: stop at first pipe/chain/redirect/semicolon for token extraction
    // We only analyze the first command in a pipeline/chain
    if (ch === "|" || ch === ";" || ch === "&") {
      // Push current token if any
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      // Stop — only analyze first command segment
      break;
    }

    // Redirects: > >> < 2>
    if (ch === ">" || ch === "<") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      // Skip redirect and its target
      i++;
      if (i < len && input[i] === ">") i++; // >>
      // Skip whitespace
      while (i < len && input[i] === " ") i++;
      // Skip the redirect target token
      while (i < len && input[i] !== " " && input[i] !== "|" && input[i] !== ";") {
        i++;
      }
      continue;
    }

    // Whitespace: token separator
    if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      i++;
      continue;
    }

    // Regular character
    current += ch;
    i++;
  }

  // Push final token
  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
