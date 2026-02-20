import { ExecApprovalConfigurationError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { resolveExecApprovalsConfig } from "../../config.js";
import { DEFAULT_AUTO_PROMOTE_THRESHOLD, DEFAULT_MAX_PATTERNS } from "../../constants.js";

describe("resolveExecApprovalsConfig", () => {
  it("should resolve with all defaults", () => {
    const config = resolveExecApprovalsConfig({});
    expect(config.autoPromoteThreshold).toBe(DEFAULT_AUTO_PROMOTE_THRESHOLD);
    expect(config.maxPatterns).toBe(DEFAULT_MAX_PATTERNS);
    expect(config.agentId).toBe("default");
    expect(config.safeBinaries.size).toBeGreaterThan(50);
  });

  it("should accept valid threshold", () => {
    const config = resolveExecApprovalsConfig({ autoPromoteThreshold: 10 });
    expect(config.autoPromoteThreshold).toBe(10);
  });

  it("should throw on threshold < 1", () => {
    expect(() => resolveExecApprovalsConfig({ autoPromoteThreshold: 0 })).toThrow(
      ExecApprovalConfigurationError,
    );
  });

  it("should throw on threshold > 100", () => {
    expect(() => resolveExecApprovalsConfig({ autoPromoteThreshold: 101 })).toThrow(
      ExecApprovalConfigurationError,
    );
  });

  it("should throw on non-integer threshold", () => {
    expect(() => resolveExecApprovalsConfig({ autoPromoteThreshold: 3.5 })).toThrow(
      ExecApprovalConfigurationError,
    );
  });

  it("should accept valid maxPatterns", () => {
    const config = resolveExecApprovalsConfig({ maxPatterns: 1000 });
    expect(config.maxPatterns).toBe(1000);
  });

  it("should throw on maxPatterns < 1", () => {
    expect(() => resolveExecApprovalsConfig({ maxPatterns: 0 })).toThrow(
      ExecApprovalConfigurationError,
    );
  });

  it("should throw on maxPatterns > 10000", () => {
    expect(() => resolveExecApprovalsConfig({ maxPatterns: 10_001 })).toThrow(
      ExecApprovalConfigurationError,
    );
  });

  it("should add custom safe binaries", () => {
    const config = resolveExecApprovalsConfig({
      safeBinaries: ["my-custom-tool"],
    });
    expect(config.safeBinaries.has("my-custom-tool")).toBe(true);
    expect(config.safeBinaries.has("ls")).toBe(true);
  });

  it("should remove safe binaries", () => {
    const config = resolveExecApprovalsConfig({
      removeSafeBinaries: ["ls", "cat"],
    });
    expect(config.safeBinaries.has("ls")).toBe(false);
    expect(config.safeBinaries.has("cat")).toBe(false);
    expect(config.safeBinaries.has("git")).toBe(true);
  });

  it("should include default tool names", () => {
    const config = resolveExecApprovalsConfig({});
    expect(config.toolNames.has("bash")).toBe(true);
    expect(config.toolNames.has("Bash")).toBe(true);
  });

  it("should include custom tool names", () => {
    const config = resolveExecApprovalsConfig({
      toolNames: ["my-shell"],
    });
    expect(config.toolNames.has("my-shell")).toBe(true);
    expect(config.toolNames.has("bash")).toBe(true);
  });
});
