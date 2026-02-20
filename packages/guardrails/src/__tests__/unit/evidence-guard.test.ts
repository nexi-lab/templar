import { describe, expect, it } from "vitest";
import { EvidenceGuard } from "../../guards/evidence-guard.js";
import type { GuardContext } from "../../types.js";

function makeContext(response: unknown): GuardContext {
  return {
    hook: "model",
    response,
    attempt: 1,
    previousIssues: [],
    metadata: {},
  };
}

describe("EvidenceGuard", () => {
  it("passes when all required fields are present", () => {
    const guard = new EvidenceGuard({ requiredFields: ["sources", "reasoning"] });
    const ctx = makeContext({
      content: JSON.stringify({
        sources: ["source1"],
        reasoning: "because...",
      }),
    });

    const result = guard.validate(ctx);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("fails when a required field is missing", () => {
    const guard = new EvidenceGuard({ requiredFields: ["sources", "reasoning"] });
    const ctx = makeContext({
      content: JSON.stringify({ sources: ["source1"] }),
    });

    const result = guard.validate(ctx);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe("EVIDENCE_MISSING");
    expect(result.issues[0]?.path).toEqual(["reasoning"]);
  });

  it("fails when array field has fewer items than minEvidence", () => {
    const guard = new EvidenceGuard({
      requiredFields: ["sources"],
      minEvidence: 3,
    });
    const ctx = makeContext({
      content: JSON.stringify({ sources: ["s1", "s2"] }),
    });

    const result = guard.validate(ctx);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("2 items");
    expect(result.issues[0]?.message).toContain("minimum is 3");
  });

  it("fails when output is not an object", () => {
    const guard = new EvidenceGuard({ requiredFields: ["sources"] });
    const ctx = makeContext({ content: "just a plain string" });

    const result = guard.validate(ctx);
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.message).toContain("not an object");
  });

  it("handles tool response with output field", () => {
    const guard = new EvidenceGuard({ requiredFields: ["data"] });
    const ctx = makeContext({ output: { data: [1, 2, 3] } });

    const result = guard.validate(ctx);
    expect(result.valid).toBe(true);
  });

  it("handles null response", () => {
    const guard = new EvidenceGuard({ requiredFields: ["sources"] });
    const ctx = makeContext(null);

    const result = guard.validate(ctx);
    expect(result.valid).toBe(false);
  });
});
