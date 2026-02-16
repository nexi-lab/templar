import { describe, expect, it } from "vitest";
import {
  resolveConfig,
  validateFeature,
  validateFeatureListDocument,
  validateLongRunningConfig,
  validateProgressDocument,
  validateProgressEntry,
} from "../validation.js";

describe("validateLongRunningConfig", () => {
  it("accepts valid minimal config", () => {
    const result = validateLongRunningConfig({ workspace: "/tmp/agent" });
    expect(result.workspace).toBe("/tmp/agent");
  });

  it("accepts valid full config", () => {
    const result = validateLongRunningConfig({
      workspace: "/tmp/agent",
      maxActiveFeatures: 2,
      progressWindowSize: 20,
      gitTimeoutMs: 60_000,
      featureListPath: "custom-features.json",
      progressFilePath: "custom-progress.json",
      progressArchivePath: "custom-archive.json",
      initScriptPath: "setup.sh",
    });
    expect(result.maxActiveFeatures).toBe(2);
    expect(result.progressWindowSize).toBe(20);
  });

  it("rejects empty workspace", () => {
    expect(() => validateLongRunningConfig({ workspace: "" })).toThrow();
  });

  it("rejects missing workspace", () => {
    expect(() => validateLongRunningConfig({})).toThrow();
  });

  it("rejects non-positive maxActiveFeatures", () => {
    expect(() => validateLongRunningConfig({ workspace: "/tmp", maxActiveFeatures: 0 })).toThrow();
  });

  it("rejects gitTimeoutMs exceeding 300000ms", () => {
    expect(() => validateLongRunningConfig({ workspace: "/tmp", gitTimeoutMs: 400_000 })).toThrow();
  });

  it("rejects non-integer progressWindowSize", () => {
    expect(() =>
      validateLongRunningConfig({ workspace: "/tmp", progressWindowSize: 1.5 }),
    ).toThrow();
  });
});

describe("resolveConfig", () => {
  it("applies all defaults", () => {
    const resolved = resolveConfig({ workspace: "/tmp/agent" });
    expect(resolved.maxActiveFeatures).toBe(1);
    expect(resolved.progressWindowSize).toBe(10);
    expect(resolved.gitTimeoutMs).toBe(30_000);
    expect(resolved.featureListPath).toBe("feature-list.json");
    expect(resolved.progressFilePath).toBe("progress.json");
    expect(resolved.progressArchivePath).toBe("progress-archive.json");
    expect(resolved.initScriptPath).toBe("init.sh");
  });

  it("preserves explicit values", () => {
    const resolved = resolveConfig({
      workspace: "/tmp/agent",
      maxActiveFeatures: 3,
      progressWindowSize: 5,
    });
    expect(resolved.maxActiveFeatures).toBe(3);
    expect(resolved.progressWindowSize).toBe(5);
  });
});

describe("validateFeature", () => {
  const validFeature = {
    id: "feat-1",
    category: "functional",
    description: "Add login page",
    priority: 1,
    steps: ["Create form", "Add validation"],
    passes: false,
  };

  it("accepts valid feature", () => {
    const result = validateFeature(validFeature);
    expect(result.id).toBe("feat-1");
    expect(result.passes).toBe(false);
  });

  it("rejects empty id", () => {
    expect(() => validateFeature({ ...validFeature, id: "" })).toThrow();
  });

  it("rejects invalid category", () => {
    expect(() => validateFeature({ ...validFeature, category: "invalid" })).toThrow();
  });

  it("rejects empty steps array", () => {
    expect(() => validateFeature({ ...validFeature, steps: [] })).toThrow();
  });

  it("rejects missing description", () => {
    const { description: _, ...noDesc } = validFeature;
    expect(() => validateFeature(noDesc)).toThrow();
  });
});

describe("validateFeatureListDocument", () => {
  const now = new Date().toISOString();
  const validDoc = {
    features: [
      {
        id: "feat-1",
        category: "functional",
        description: "Test feature",
        priority: 1,
        steps: ["Step 1"],
        passes: false,
      },
    ],
    createdAt: now,
    lastUpdatedAt: now,
  };

  it("accepts valid document", () => {
    const result = validateFeatureListDocument(validDoc);
    expect(result.features).toHaveLength(1);
  });

  it("rejects empty features array", () => {
    expect(() => validateFeatureListDocument({ ...validDoc, features: [] })).toThrow();
  });

  it("rejects invalid createdAt format", () => {
    expect(() => validateFeatureListDocument({ ...validDoc, createdAt: "not-a-date" })).toThrow();
  });
});

describe("validateProgressEntry", () => {
  const validEntry = {
    sessionNumber: 1,
    timestamp: new Date().toISOString(),
    whatWasDone: "Implemented login",
    currentState: "Login works",
    nextSteps: "Add validation",
    gitCommits: ["abc123"],
    featuresCompleted: ["feat-1"],
  };

  it("accepts valid entry", () => {
    const result = validateProgressEntry(validEntry);
    expect(result.sessionNumber).toBe(1);
  });

  it("rejects zero session number", () => {
    expect(() => validateProgressEntry({ ...validEntry, sessionNumber: 0 })).toThrow();
  });

  it("rejects invalid timestamp", () => {
    expect(() => validateProgressEntry({ ...validEntry, timestamp: "not-a-date" })).toThrow();
  });

  it("accepts empty gitCommits array", () => {
    const result = validateProgressEntry({ ...validEntry, gitCommits: [] });
    expect(result.gitCommits).toHaveLength(0);
  });
});

describe("validateProgressDocument", () => {
  it("accepts empty entries", () => {
    const result = validateProgressDocument({ entries: [] });
    expect(result.entries).toHaveLength(0);
  });

  it("accepts document with entries", () => {
    const result = validateProgressDocument({
      entries: [
        {
          sessionNumber: 1,
          timestamp: new Date().toISOString(),
          whatWasDone: "Init",
          currentState: "Started",
          nextSteps: "Continue",
          gitCommits: [],
          featuresCompleted: [],
        },
      ],
    });
    expect(result.entries).toHaveLength(1);
  });
});
