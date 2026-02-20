import { describe, expect, it } from "vitest";
import {
  CanvasActionSchema,
  CanvasArtifactContentSchema,
  CanvasBridgeMessageSchema,
  CanvasConfigSchema,
} from "../schemas.js";

// ---------------------------------------------------------------------------
// CanvasActionSchema
// ---------------------------------------------------------------------------

describe("CanvasActionSchema", () => {
  it("accepts valid create action", () => {
    const result = CanvasActionSchema.safeParse({
      action: "create",
      type: "mermaid",
      content: "graph TD; A-->B;",
      title: "My Diagram",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid update action", () => {
    const result = CanvasActionSchema.safeParse({
      action: "update",
      id: "abc-123",
      content: "updated content",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid delete action", () => {
    const result = CanvasActionSchema.safeParse({
      action: "delete",
      id: "abc-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action type", () => {
    const result = CanvasActionSchema.safeParse({
      action: "invalid",
      content: "test",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields for create", () => {
    const result = CanvasActionSchema.safeParse({
      action: "create",
      // missing type and content
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content for create", () => {
    const result = CanvasActionSchema.safeParse({
      action: "create",
      type: "html",
      content: "",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CanvasArtifactContentSchema
// ---------------------------------------------------------------------------

describe("CanvasArtifactContentSchema", () => {
  it("accepts valid mermaid content", () => {
    const result = CanvasArtifactContentSchema.safeParse({
      type: "mermaid",
      content: "graph LR; A-->B;",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid html content with title", () => {
    const result = CanvasArtifactContentSchema.safeParse({
      type: "html",
      content: "<p>Hello</p>",
      title: "Test",
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const result = CanvasArtifactContentSchema.safeParse({
      type: "svg",
      content: "<svg></svg>",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CanvasConfigSchema
// ---------------------------------------------------------------------------

describe("CanvasConfigSchema", () => {
  it("validates and accepts full config", () => {
    const result = CanvasConfigSchema.safeParse({
      maxArtifacts: 50,
      maxContentSize: 2_000_000,
      allowedTypes: ["mermaid", "html"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty config (all optional)", () => {
    const result = CanvasConfigSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects negative maxArtifacts", () => {
    const result = CanvasConfigSchema.safeParse({ maxArtifacts: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects empty allowedTypes array", () => {
    const result = CanvasConfigSchema.safeParse({ allowedTypes: [] });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CanvasBridgeMessageSchema
// ---------------------------------------------------------------------------

describe("CanvasBridgeMessageSchema", () => {
  it("accepts resize message", () => {
    const result = CanvasBridgeMessageSchema.safeParse({ type: "resize", height: 300 });
    expect(result.success).toBe(true);
  });

  it("accepts action message", () => {
    const result = CanvasBridgeMessageSchema.safeParse({
      type: "action",
      action: "click",
      payload: { x: 10 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts error message", () => {
    const result = CanvasBridgeMessageSchema.safeParse({
      type: "error",
      message: "something broke",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ready message", () => {
    const result = CanvasBridgeMessageSchema.safeParse({ type: "ready" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown message type", () => {
    const result = CanvasBridgeMessageSchema.safeParse({ type: "unknown" });
    expect(result.success).toBe(false);
  });
});
