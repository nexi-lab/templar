import { describe, expect, it } from "vitest";
import { buildCoderPrompt, buildInitializerPrompt } from "../prompts.js";
import type { ResolvedLongRunningConfig, SessionBootstrapContext } from "../types.js";

function makeConfig(): ResolvedLongRunningConfig {
  return {
    workspace: "/tmp/agent-workspace",
    maxActiveFeatures: 1,
    progressWindowSize: 10,
    gitTimeoutMs: 30_000,
    featureListPath: "feature-list.json",
    progressFilePath: "progress.json",
    progressArchivePath: "progress-archive.json",
    initScriptPath: "init.sh",
  };
}

function makeCoderContext(
  overrides: Partial<SessionBootstrapContext> = {},
): SessionBootstrapContext {
  return {
    mode: "coder",
    featureList: {
      features: [
        {
          id: "feat-1",
          category: "functional",
          description: "Add login page",
          priority: 1,
          steps: ["Create form", "Add validation"],
          passes: true,
        },
        {
          id: "feat-2",
          category: "functional",
          description: "Add dashboard",
          priority: 2,
          steps: ["Create layout", "Add widgets"],
          passes: false,
        },
      ],
      createdAt: "2024-01-01T00:00:00.000Z",
      lastUpdatedAt: "2024-01-02T00:00:00.000Z",
    },
    recentProgress: [
      {
        sessionNumber: 1,
        timestamp: "2024-01-01T00:00:00.000Z",
        whatWasDone: "Created feature list",
        currentState: "Initialized",
        nextSteps: "Implement feat-1",
        gitCommits: ["abc123"],
        featuresCompleted: [],
      },
    ],
    gitLog: ["abc123 feat: init"],
    totalFeatures: 2,
    completedFeatures: 1,
    nextFeatures: [
      {
        id: "feat-2",
        category: "functional",
        description: "Add dashboard",
        priority: 2,
        steps: ["Create layout", "Add widgets"],
        passes: false,
      },
    ],
    ...overrides,
  };
}

describe("buildInitializerPrompt", () => {
  it("contains workspace path", () => {
    const prompt = buildInitializerPrompt(makeConfig());
    expect(prompt).toContain("/tmp/agent-workspace");
  });

  it("contains feature list path", () => {
    const prompt = buildInitializerPrompt(makeConfig());
    expect(prompt).toContain("feature-list.json");
  });

  it("contains init script path", () => {
    const prompt = buildInitializerPrompt(makeConfig());
    expect(prompt).toContain("init.sh");
  });

  it("mentions initializer mode", () => {
    const prompt = buildInitializerPrompt(makeConfig());
    expect(prompt).toContain("Initializer Mode");
  });

  it("instructs NOT to implement features", () => {
    const prompt = buildInitializerPrompt(makeConfig());
    expect(prompt).toContain("Do NOT attempt to implement any features");
  });
});

describe("buildCoderPrompt", () => {
  it("contains progress summary", () => {
    const prompt = buildCoderPrompt(makeCoderContext());
    expect(prompt).toContain("1/2 features passing (50.0%)");
  });

  it("contains next features", () => {
    const prompt = buildCoderPrompt(makeCoderContext());
    expect(prompt).toContain("feat-2");
    expect(prompt).toContain("Add dashboard");
  });

  it("contains recent progress", () => {
    const prompt = buildCoderPrompt(makeCoderContext());
    expect(prompt).toContain("Session 1");
    expect(prompt).toContain("Created feature list");
  });

  it("contains one-feature-per-session constraint", () => {
    const prompt = buildCoderPrompt(makeCoderContext());
    expect(prompt).toContain("Do NOT attempt more than one feature per session");
  });

  it("handles zero features", () => {
    const prompt = buildCoderPrompt(
      makeCoderContext({
        totalFeatures: 0,
        completedFeatures: 0,
        nextFeatures: [],
      }),
    );
    expect(prompt).toContain("0/0 features passing");
  });

  it("handles all features complete", () => {
    const prompt = buildCoderPrompt(
      makeCoderContext({
        totalFeatures: 5,
        completedFeatures: 5,
        nextFeatures: [],
      }),
    );
    expect(prompt).toContain("5/5 features passing (100.0%)");
    expect(prompt).toContain("All features are complete!");
  });

  it("handles no previous progress", () => {
    const prompt = buildCoderPrompt(makeCoderContext({ recentProgress: [] }));
    expect(prompt).toContain("No previous progress entries");
  });
});
