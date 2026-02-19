import { ArtifactInvalidTypeError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { prepareManifest } from "../prepare-manifest.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const AGENT_ARTIFACT = {
  id: "art-1",
  name: "test-agent",
  description: "Test agent artifact",
  type: "agent" as const,
  tags: ["test"],
  version: 3,
  status: "active" as const,
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-02T00:00:00Z",
  manifest: {
    model: "gpt-4",
    tools: [{ name: "calculator" }],
    settings: { temperature: 0.7 },
  },
};

const TOOL_ARTIFACT = {
  id: "art-2",
  name: "test-tool",
  description: "Test tool artifact",
  type: "tool" as const,
  tags: ["test"],
  version: 1,
  status: "active" as const,
  createdBy: "user-1",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  schema: { input: { query: "string" }, output: { result: "string" } },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("prepareManifest", () => {
  it("prepares a manifest from an agent artifact", () => {
    const result = prepareManifest({ artifact: AGENT_ARTIFACT });

    expect(result.artifactId).toBe("art-1");
    expect(result.version).toBe(3);
    expect(result.manifest.model).toBe("gpt-4");
    expect(result.manifest.tools).toEqual([{ name: "calculator" }]);
  });

  it("returns a frozen manifest", () => {
    const result = prepareManifest({ artifact: AGENT_ARTIFACT });

    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(() => {
      (result.manifest as Record<string, unknown>).model = "changed";
    }).toThrow();
  });

  it("deep-freezes nested objects", () => {
    const result = prepareManifest({ artifact: AGENT_ARTIFACT });

    const settings = result.manifest.settings as Record<string, unknown>;
    expect(Object.isFrozen(settings)).toBe(true);
    expect(() => {
      settings.temperature = 0.9;
    }).toThrow();
  });

  it("merges overrides into the manifest", () => {
    const result = prepareManifest({
      artifact: AGENT_ARTIFACT,
      overrides: { model: "gpt-4o", maxTokens: 4096 },
    });

    expect(result.manifest.model).toBe("gpt-4o");
    expect(result.manifest.maxTokens).toBe(4096);
    // Original tools preserved
    expect(result.manifest.tools).toEqual([{ name: "calculator" }]);
  });

  it("does not mutate the original artifact manifest", () => {
    const originalModel = AGENT_ARTIFACT.manifest.model;
    prepareManifest({
      artifact: AGENT_ARTIFACT,
      overrides: { model: "gpt-4o" },
    });

    expect(AGENT_ARTIFACT.manifest.model).toBe(originalModel);
  });

  it("throws ArtifactInvalidTypeError for tool artifacts", () => {
    expect(() => {
      prepareManifest({ artifact: TOOL_ARTIFACT });
    }).toThrow(ArtifactInvalidTypeError);
  });

  it("includes correct error details for wrong type", () => {
    try {
      prepareManifest({ artifact: TOOL_ARTIFACT });
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ArtifactInvalidTypeError);
      if (err instanceof ArtifactInvalidTypeError) {
        expect(err.invalidType).toBe("tool");
        expect(err.code).toBe("ARTIFACT_INVALID_TYPE");
      }
    }
  });

  it("works with empty manifest", () => {
    const artifact = { ...AGENT_ARTIFACT, manifest: {} };
    const result = prepareManifest({ artifact });

    expect(result.manifest).toEqual({});
    expect(Object.isFrozen(result.manifest)).toBe(true);
  });

  it("works with empty overrides", () => {
    const result = prepareManifest({
      artifact: AGENT_ARTIFACT,
      overrides: {},
    });

    expect(result.manifest.model).toBe("gpt-4");
  });
});
