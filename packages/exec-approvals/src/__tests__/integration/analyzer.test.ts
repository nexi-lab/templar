import { describe, expect, it } from "vitest";
import { AllowlistStore } from "../../allowlist.js";
import { ExecApprovals, extractPattern } from "../../analyzer.js";
import { resolveExecApprovalsConfig } from "../../config.js";
import type { ExecApprovalsConfig } from "../../types.js";

function setupAnalyzer(overrides?: ExecApprovalsConfig) {
  const config = resolveExecApprovalsConfig(overrides ?? {});
  const allowlist = new AllowlistStore(config.maxPatterns);
  const analyzer = new ExecApprovals(config, allowlist);
  return { analyzer, allowlist, config };
}

describe("ExecApprovals integration: full pipeline", () => {
  it("should fast-allow safe binary through the full pipeline", () => {
    const { analyzer } = setupAnalyzer();
    const result = analyzer.analyze("ls -la /tmp");
    expect(result.action).toBe("allow");
    expect(result.risk).toBe("safe");
    expect(result.matchedRule).toBe("safe-binary");
    expect(result.command.binary).toBe("ls");
    expect(result.command.flags).toContain("-la");
  });

  it("should deny dangerous commands through the full pipeline", () => {
    const { analyzer } = setupAnalyzer();
    const result = analyzer.analyze("rm -rf /");
    expect(result.action).toBe("deny");
    expect(result.risk).toBe("critical");
    expect(result.matchedRule).toBe("never-allow");
  });

  it("should ask for unknown commands through the full pipeline", () => {
    const { analyzer } = setupAnalyzer();
    const result = analyzer.analyze("custom-deploy --env production");
    expect(result.action).toBe("ask");
    expect(result.matchedRule).toBe("unknown");
  });

  describe("progressive promotion lifecycle", () => {
    it("should promote a command after N approvals", () => {
      const { analyzer, allowlist } = setupAnalyzer({
        autoPromoteThreshold: 3,
      });

      // First time: should ask
      let result = analyzer.analyze("custom-deploy --env staging");
      expect(result.action).toBe("ask");

      // Simulate 3 approvals
      const pattern = extractPattern(result.command);
      for (let i = 0; i < 3; i++) {
        analyzer.recordApproval(pattern);
      }

      // After promotion: should allow
      result = analyzer.analyze("custom-deploy --env staging");
      expect(result.action).toBe("allow");
      expect(result.risk).toBe("low");
      expect(result.matchedRule).toBe("allowlist");

      // Verify the entry
      const entry = allowlist.get(pattern);
      expect(entry?.autoPromoted).toBe(true);
      expect(entry?.approvalCount).toBe(3);
    });

    it("should allow non-promoted patterns after first approval", () => {
      const { analyzer } = setupAnalyzer({ autoPromoteThreshold: 5 });

      const result1 = analyzer.analyze("my-tool run");
      expect(result1.action).toBe("ask");

      const pattern = extractPattern(result1.command);
      analyzer.recordApproval(pattern);

      // After 1 approval (not promoted yet): should still allow
      const result2 = analyzer.analyze("my-tool run");
      expect(result2.action).toBe("allow");
      expect(result2.risk).toBe("low");
    });
  });

  describe("safe binary with dangerous flags", () => {
    it("should escalate safe binary git push --force to ask", () => {
      const { analyzer } = setupAnalyzer();
      const result = analyzer.analyze("git push --force origin main");
      expect(result.action).toBe("ask");
      expect(result.risk).toBe("high");
      expect(result.matchedRule).toBe("dangerous-pattern");
    });

    it("should escalate safe binary git reset --hard to ask", () => {
      const { analyzer } = setupAnalyzer();
      const result = analyzer.analyze("git reset --hard HEAD~1");
      expect(result.action).toBe("ask");
      expect(result.risk).toBe("high");
    });

    it("should allow normal git operations", () => {
      const { analyzer } = setupAnalyzer();
      const safeGitCmds = [
        "git status",
        "git log --oneline",
        "git diff",
        "git branch -a",
        "git checkout feature-branch",
        "git add file.ts",
        "git commit -m 'fix'",
        "git pull origin main",
        "git push origin feature",
        "git stash",
        "git stash pop",
      ];

      for (const cmd of safeGitCmds) {
        const result = analyzer.analyze(cmd);
        expect(result.action).toBe("allow");
      }
    });
  });

  describe("custom safe binaries", () => {
    it("should respect custom safe binary additions", () => {
      const { analyzer } = setupAnalyzer({
        safeBinaries: ["my-safe-tool"],
      });
      const result = analyzer.analyze("my-safe-tool --flag");
      expect(result.action).toBe("allow");
      expect(result.risk).toBe("safe");
    });

    it("should respect safe binary removals", () => {
      const { analyzer } = setupAnalyzer({
        removeSafeBinaries: ["git"],
      });
      const result = analyzer.analyze("git status");
      expect(result.action).toBe("ask");
      expect(result.matchedRule).toBe("unknown");
    });
  });
});
