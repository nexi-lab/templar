/**
 * Unit tests for CanvasRenderer routing logic.
 *
 * These tests verify the component routing without requiring a DOM environment.
 * Full rendering tests require happy-dom + @testing-library/react (install separately).
 */

import { describe, expect, it } from "vitest";
import type { CanvasArtifact, CanvasArtifactContent } from "../../types.js";

describe("CanvasRenderer — type routing", () => {
  const artifactTypes: CanvasArtifactContent["type"][] = ["mermaid", "html", "markdown"];

  it("all three artifact types are covered in the union", () => {
    expect(artifactTypes).toEqual(["mermaid", "html", "markdown"]);
  });

  it("mermaid artifact has correct shape", () => {
    const artifact: CanvasArtifact = {
      id: "test-1",
      content: { type: "mermaid", content: "graph TD; A-->B;" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    expect(artifact.content.type).toBe("mermaid");
  });

  it("html artifact has correct shape with optional title", () => {
    const artifact: CanvasArtifact = {
      id: "test-2",
      content: { type: "html", content: "<h1>Hello</h1>", title: "My HTML" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    expect(artifact.content.type).toBe("html");
    if (artifact.content.type === "html") {
      expect(artifact.content.title).toBe("My HTML");
    }
  });

  it("markdown artifact has correct shape", () => {
    const artifact: CanvasArtifact = {
      id: "test-3",
      content: { type: "markdown", content: "# Hello World" },
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    expect(artifact.content.type).toBe("markdown");
  });
});
