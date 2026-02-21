import { describe, expect, it } from "vitest";
import { parseCommand } from "../../parser.js";

describe("parseCommand", () => {
  describe("simple commands", () => {
    it("should parse a simple command", () => {
      const result = parseCommand("ls -la");
      expect(result.binary).toBe("ls");
      expect(result.flags).toEqual(["-la"]);
      expect(result.args).toEqual([]);
      expect(result.hasPipes).toBe(false);
      expect(result.hasRedirects).toBe(false);
      expect(result.hasSubshell).toBe(false);
      expect(result.hasChaining).toBe(false);
    });

    it("should parse a command with arguments", () => {
      const result = parseCommand("cat file.txt");
      expect(result.binary).toBe("cat");
      expect(result.subcommand).toBe("file.txt");
      expect(result.args).toEqual(["file.txt"]);
    });

    it("should parse a command with flags and args", () => {
      const result = parseCommand("grep -r pattern src/");
      expect(result.binary).toBe("grep");
      expect(result.flags).toEqual(["-r"]);
      expect(result.args).toEqual(["pattern", "src/"]);
    });

    it("should handle git subcommand", () => {
      const result = parseCommand("git commit -m 'message'");
      expect(result.binary).toBe("git");
      expect(result.subcommand).toBe("commit");
      expect(result.flags).toEqual(["-m"]);
    });

    it("should handle npm subcommand", () => {
      const result = parseCommand("npm install express");
      expect(result.binary).toBe("npm");
      expect(result.subcommand).toBe("install");
      expect(result.args).toContain("express");
    });
  });

  describe("pipes", () => {
    it("should detect pipes", () => {
      const result = parseCommand("cat file | grep pattern");
      expect(result.hasPipes).toBe(true);
      expect(result.binary).toBe("cat");
    });

    it("should detect multi-pipe commands", () => {
      const result = parseCommand("ps aux | sort -k3 | head -10");
      expect(result.hasPipes).toBe(true);
      expect(result.binary).toBe("ps");
    });

    it("should not detect || as pipe", () => {
      const result = parseCommand("test -f file || echo missing");
      expect(result.hasPipes).toBe(false);
      expect(result.hasChaining).toBe(true);
    });
  });

  describe("redirects", () => {
    it("should detect output redirect", () => {
      const result = parseCommand('echo "hello" > file.txt');
      expect(result.hasRedirects).toBe(true);
      expect(result.binary).toBe("echo");
    });

    it("should detect input redirect", () => {
      const result = parseCommand("sort < input.txt");
      expect(result.hasRedirects).toBe(true);
    });

    it("should detect append redirect", () => {
      const result = parseCommand("echo 'line' >> file.txt");
      expect(result.hasRedirects).toBe(true);
    });
  });

  describe("subshells", () => {
    it("should detect $() subshell", () => {
      const result = parseCommand("echo $(whoami)");
      expect(result.hasSubshell).toBe(true);
    });

    it("should detect backtick subshell", () => {
      const result = parseCommand("echo `date`");
      expect(result.hasSubshell).toBe(true);
    });

    it("should detect variable expansion", () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: testing literal ${} in shell commands
      const result = parseCommand("echo ${PATH}");
      expect(result.hasSubshell).toBe(true);
    });
  });

  describe("chaining", () => {
    it("should detect && chaining", () => {
      const result = parseCommand("mkdir dir && cd dir");
      expect(result.hasChaining).toBe(true);
      expect(result.binary).toBe("mkdir");
    });

    it("should detect ; chaining", () => {
      const result = parseCommand("echo hello; echo world");
      expect(result.hasChaining).toBe(true);
    });

    it("should detect || chaining", () => {
      const result = parseCommand("test -d dir || mkdir dir");
      expect(result.hasChaining).toBe(true);
    });
  });

  describe("quoting", () => {
    it("should handle single quotes", () => {
      const result = parseCommand("echo 'hello world'");
      expect(result.binary).toBe("echo");
      expect(result.args).toContain("hello world");
    });

    it("should handle double quotes", () => {
      const result = parseCommand('echo "hello world"');
      expect(result.binary).toBe("echo");
      expect(result.args).toContain("hello world");
    });

    it("should handle escaped characters in double quotes", () => {
      const result = parseCommand('echo "hello \\"world\\""');
      expect(result.binary).toBe("echo");
      expect(result.args).toContain('hello "world"');
    });
  });

  describe("parse failure", () => {
    it("should return UNPARSEABLE for empty string", () => {
      const result = parseCommand("");
      expect(result.binary).toBe("UNPARSEABLE");
    });

    it("should return UNPARSEABLE for whitespace-only", () => {
      const result = parseCommand("   ");
      expect(result.binary).toBe("UNPARSEABLE");
    });

    it("should return UNPARSEABLE for unterminated single quote", () => {
      const result = parseCommand("echo 'unterminated");
      expect(result.binary).toBe("UNPARSEABLE");
    });

    it("should return UNPARSEABLE for unterminated double quote", () => {
      const result = parseCommand('echo "unterminated');
      expect(result.binary).toBe("UNPARSEABLE");
    });

    it("should preserve rawCommand on failure", () => {
      const result = parseCommand("echo 'unterminated");
      expect(result.rawCommand).toBe("echo 'unterminated");
    });
  });

  describe("adversarial (Trail of Bits)", () => {
    it("should detect dangerous embedded command in -exec", () => {
      const result = parseCommand('go test -exec "rm -rf /"');
      // The primary binary is "go", but the raw command contains dangerous content
      expect(result.binary).toBe("go");
      expect(result.rawCommand).toContain("rm -rf /");
    });

    it("should parse git show with format string", () => {
      const result = parseCommand("git show --format=%s");
      expect(result.binary).toBe("git");
      expect(result.subcommand).toBe("show");
      expect(result.flags).toContain("--format=%s");
    });
  });
});
