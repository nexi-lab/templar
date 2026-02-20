/**
 * Constants for @templar/exec-approvals
 */

import type { DangerousFlagPattern } from "./types.js";

export const PACKAGE_NAME = "@templar/exec-approvals";

export const DEFAULT_AUTO_PROMOTE_THRESHOLD = 5;
export const DEFAULT_MAX_PATTERNS = 500;
export const DEFAULT_AGENT_ID = "default";

// ---------------------------------------------------------------------------
// Default tool names to intercept
// ---------------------------------------------------------------------------

export const DEFAULT_TOOL_NAMES: readonly string[] = ["bash", "exec", "shell", "terminal", "Bash"];

// ---------------------------------------------------------------------------
// Safe binaries — organized by category
// ---------------------------------------------------------------------------

export const DEFAULT_SAFE_BINARIES: readonly string[] = [
  // Filesystem (read-only or non-destructive)
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "du",
  "df",
  "file",
  "stat",
  "find",
  "tree",
  "pwd",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "md5sum",
  "sha256sum",

  // Text processing
  "grep",
  "rg",
  "awk",
  "sed",
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "less",
  "more",
  "jq",
  "yq",
  "xargs",
  "tee",
  "fmt",
  "column",

  // VCS
  "git",

  // Package managers
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "pip",
  "pip3",
  "cargo",
  "go",

  // Build
  "tsc",
  "node",
  "python",
  "python3",
  "deno",
  "make",
  "cmake",
  "rustc",
  "javac",

  // Dev tools
  "echo",
  "printf",
  "date",
  "env",
  "which",
  "whereis",
  "whoami",
  "hostname",
  "uname",
  "id",
  "true",
  "false",
  "test",

  // Network (read-only)
  "ping",
  "dig",
  "nslookup",
  "traceroute",
  "host",

  // Container (info only — NOT run/exec)
  "kubectl",
];

// ---------------------------------------------------------------------------
// NEVER_ALLOW patterns — hard-blocked, categorically destructive
// ---------------------------------------------------------------------------

export const NEVER_ALLOW_PATTERNS: readonly string[] = [
  // Recursive forced deletion of root/home/current
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  "rm -rf $HOME",
  "rm -rf .",
  "rm -rf ..",
  "rm -fr /",
  "rm -r -f /",

  // Dangerous chmod
  "chmod 777 /",
  "chmod -R 777 /",
  "chmod +s",
  "chmod u+s",
  "chmod g+s",

  // Disk destruction
  "mkfs",
  "dd if=/dev/zero of=/dev/sd",
  "dd if=/dev/zero of=/dev/nvme",
  "dd if=/dev/random of=/dev",
  "wipefs",

  // Eval from network
  "eval $(curl",
  "eval $(wget",

  // Fork bomb
  ":(){ :|:& };:",

  // System control
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "init 0",
  "init 6",

  // Firewall flush
  "iptables -F",
  "iptables --flush",
];

// ---------------------------------------------------------------------------
// Dangerous flag patterns — binary + flag combos that escalate risk
// ---------------------------------------------------------------------------

export const DANGEROUS_FLAG_PATTERNS: readonly DangerousFlagPattern[] = [
  {
    binary: "rm",
    flags: ["-rf", "-fr", "--recursive"],
    risk: "high",
    reason: "recursive forced deletion",
  },
  {
    binary: "chmod",
    flags: ["777"],
    risk: "high",
    reason: "world-writable permissions",
  },
  {
    binary: "git",
    flags: ["push --force", "push -f", "reset --hard"],
    risk: "high",
    reason: "destructive git operation",
  },
  {
    binary: "docker",
    flags: ["run", "exec"],
    risk: "medium",
    reason: "container execution",
  },
  {
    binary: "curl",
    flags: ["-o", "--output", "-O"],
    risk: "medium",
    reason: "network download to file",
  },
  {
    binary: "wget",
    flags: [],
    risk: "medium",
    reason: "network download",
  },
  {
    binary: "ssh",
    flags: [],
    risk: "medium",
    reason: "remote connection",
  },
  {
    binary: "scp",
    flags: [],
    risk: "medium",
    reason: "remote file transfer",
  },
  {
    binary: "rsync",
    flags: [],
    risk: "medium",
    reason: "remote sync",
  },
  {
    binary: "find",
    flags: ["-exec", "-execdir"],
    risk: "medium",
    reason: "command execution for each match",
  },
  {
    binary: "xargs",
    flags: [],
    risk: "medium",
    reason: "command execution from stdin",
  },
  {
    binary: "tar",
    flags: ["-x", "--extract"],
    risk: "medium",
    reason: "archive extraction (potential path traversal)",
  },
];

// ---------------------------------------------------------------------------
// Sensitive environment variable patterns
// ---------------------------------------------------------------------------

export const DEFAULT_SENSITIVE_ENV_PATTERNS: readonly string[] = [
  "*API_KEY*",
  "*SECRET*",
  "*TOKEN*",
  "*PASSWORD*",
  "*CREDENTIAL*",
  "*PRIVATE_KEY*",
  "AWS_*",
  "GITHUB_TOKEN",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DATABASE_URL",
  "REDIS_URL",
  "*_DSN",
];
