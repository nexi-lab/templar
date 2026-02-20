import { describe, expect, it } from "vitest";
import { AllowlistStore } from "../../allowlist.js";
import { ExecApprovals } from "../../analyzer.js";
import { resolveExecApprovalsConfig } from "../../config.js";

function createAnalyzer() {
  const config = resolveExecApprovalsConfig({});
  const allowlist = new AllowlistStore(config.maxPatterns);
  return new ExecApprovals(config, allowlist);
}

describe("Performance benchmarks", () => {
  it("should analyze 100 safe binary calls in <100ms", () => {
    const analyzer = createAnalyzer();
    const commands = [
      "ls -la",
      "cat file.txt",
      "git status",
      "node script.js",
      "grep pattern src/",
      "head -10 file.txt",
      "tail -f log.txt",
      "wc -l file.txt",
      "git log --oneline",
      "npm test",
    ];

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const cmd = commands[i % commands.length] as string;
      analyzer.analyze(cmd);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("should analyze 100 full parse calls in <500ms", () => {
    const analyzer = createAnalyzer();
    const commands = [
      "unknown-tool --flag value",
      "custom-deploy --env production --region us-west-2",
      "rsync -avz src/ dest/",
      "docker run -it ubuntu bash",
      "ssh user@host 'cat /etc/passwd'",
      "curl -X POST https://api.example.com/data -d '{}'",
      "echo hello | grep hello",
      "find . -name '*.ts' -exec cat {} +",
      "tar -czf archive.tar.gz src/",
      "make clean && make build",
    ];

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      const cmd = commands[i % commands.length] as string;
      analyzer.analyze(cmd);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });

  it("should lookup in a 500-entry allowlist in <0.5ms average", () => {
    const config = resolveExecApprovalsConfig({});
    const allowlist = new AllowlistStore(config.maxPatterns);

    // Populate 500 entries
    for (let i = 0; i < 500; i++) {
      allowlist.recordApproval(`tool-${i}`, 5);
    }

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      allowlist.has(`tool-${i % 500}`);
    }
    const elapsed = performance.now() - start;

    // Average lookup should be <0.5ms
    expect(elapsed / 1000).toBeLessThan(0.5);
  });

  it("should handle rapid analyze() calls without degradation", () => {
    const analyzer = createAnalyzer();

    // First batch
    const start1 = performance.now();
    for (let i = 0; i < 50; i++) {
      analyzer.analyze("ls -la");
    }
    const elapsed1 = performance.now() - start1;

    // Second batch
    const start2 = performance.now();
    for (let i = 0; i < 50; i++) {
      analyzer.analyze("ls -la");
    }
    const elapsed2 = performance.now() - start2;

    // Second batch should not be significantly slower
    expect(elapsed2).toBeLessThan(elapsed1 * 3 + 1);
  });
});
