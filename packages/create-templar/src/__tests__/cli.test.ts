import { describe, expect, it } from "vitest";
import { parseArgs } from "../cli.js";

describe("parseArgs", () => {
  it("parses positional project name", () => {
    const args = parseArgs(["my-agent"]);
    expect(args.projectName).toBe("my-agent");
  });

  it("returns undefined when no project name given", () => {
    const args = parseArgs([]);
    expect(args.projectName).toBeUndefined();
  });

  it("parses --template flag", () => {
    const args = parseArgs(["--template", "code-builder"]);
    expect(args.template).toBe("code-builder");
  });

  it("parses -t shorthand for template", () => {
    const args = parseArgs(["-t", "daily-digest"]);
    expect(args.template).toBe("daily-digest");
  });

  it("parses --yes flag", () => {
    const args = parseArgs(["my-agent", "--yes"]);
    expect(args.yes).toBe(true);
  });

  it("parses -y shorthand for yes", () => {
    const args = parseArgs(["my-agent", "-y"]);
    expect(args.yes).toBe(true);
  });

  it("parses --overwrite flag", () => {
    const args = parseArgs(["my-agent", "--overwrite"]);
    expect(args.overwrite).toBe(true);
  });

  it("parses -o shorthand for overwrite", () => {
    const args = parseArgs(["my-agent", "-o"]);
    expect(args.overwrite).toBe(true);
  });

  it("defaults yes and overwrite to false", () => {
    const args = parseArgs(["my-agent"]);
    expect(args.yes).toBe(false);
    expect(args.overwrite).toBe(false);
  });

  it("parses all flags together", () => {
    const args = parseArgs(["my-agent", "--template", "research-tracker", "--yes", "--overwrite"]);
    expect(args.projectName).toBe("my-agent");
    expect(args.template).toBe("research-tracker");
    expect(args.yes).toBe(true);
    expect(args.overwrite).toBe(true);
  });
});
