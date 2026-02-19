import { describe, expect, it, vi } from "vitest";
import { interpolateTemplate } from "../template.js";

describe("interpolateTemplate", () => {
  it("should substitute simple variables", () => {
    const result = interpolateTemplate("Hello {{agent.id}}", {
      agent: { id: "agent-1" },
    });
    expect(result).toBe("Hello agent-1");
  });

  it("should substitute nested dot-path variables", () => {
    const result = interpolateTemplate("Task: {{task.description}}, ID: {{task.id}}", {
      task: { description: "fix bug", id: "task-42" },
    });
    expect(result).toBe("Task: fix bug, ID: task-42");
  });

  it("should leave unknown variables as literal and warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = interpolateTemplate("Missing: {{unknown.var}}", {});
    expect(result).toBe("Missing: {{unknown.var}}");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown template variable: {{unknown.var}}"),
    );
    warnSpy.mockRestore();
  });

  it("should handle empty string template", () => {
    const result = interpolateTemplate("", { agent: { id: "test" } });
    expect(result).toBe("");
  });

  it("should handle template with no variables", () => {
    const result = interpolateTemplate("plain text", {});
    expect(result).toBe("plain text");
  });

  it("should handle multiple occurrences of the same variable", () => {
    const result = interpolateTemplate("{{session.id}} and {{session.id}}", {
      session: { id: "s-1" },
    });
    expect(result).toBe("s-1 and s-1");
  });

  it("should ignore prototype/constructor injection attempts", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = interpolateTemplate("{{constructor}}", {});
    expect(result).toBe("{{constructor}}");
    warnSpy.mockRestore();
  });

  it("should handle undefined nested properties", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = interpolateTemplate("{{task.description}}", {
      task: {},
    });
    expect(result).toBe("{{task.description}}");
    warnSpy.mockRestore();
  });

  it("should handle vars with undefined top-level properties", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = interpolateTemplate("{{workspace.root}}", {});
    expect(result).toBe("{{workspace.root}}");
    warnSpy.mockRestore();
  });
});
