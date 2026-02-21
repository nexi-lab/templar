import { ReactionPatternInvalidError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { createEventMatcher, matchesFilters } from "../../reaction/matcher.js";

describe("createEventMatcher", () => {
  it("should match exact event types", () => {
    const matcher = createEventMatcher("nexus.file.created");
    expect(matcher("nexus.file.created")).toBe(true);
    expect(matcher("nexus.file.deleted")).toBe(false);
  });

  it("should match wildcard patterns", () => {
    const matcher = createEventMatcher("nexus.file.*");
    expect(matcher("nexus.file.created")).toBe(true);
    expect(matcher("nexus.file.deleted")).toBe(true);
    expect(matcher("nexus.agent.mentioned")).toBe(false);
  });

  it("should match globstar patterns", () => {
    const matcher = createEventMatcher("nexus.**");
    expect(matcher("nexus.file.created")).toBe(true);
    expect(matcher("nexus.agent.mentioned")).toBe(true);
    expect(matcher("other.event")).toBe(false);
  });

  it("should match dot-separated paths", () => {
    const matcher = createEventMatcher("nexus.*.created");
    expect(matcher("nexus.file.created")).toBe(true);
    expect(matcher("nexus.agent.created")).toBe(true);
    expect(matcher("nexus.file.deleted")).toBe(false);
  });

  it("should throw on empty pattern", () => {
    expect(() => createEventMatcher("")).toThrow(ReactionPatternInvalidError);
    expect(() => createEventMatcher("  ")).toThrow(ReactionPatternInvalidError);
  });
});

describe("matchesFilters", () => {
  it("should return true when no filters provided", () => {
    expect(matchesFilters(undefined, { path: "/docs/test.md" })).toBe(true);
  });

  it("should match exact filter values", () => {
    expect(matchesFilters({ channel: "slack" }, { channel: "slack" })).toBe(true);
    expect(matchesFilters({ channel: "slack" }, { channel: "discord" })).toBe(false);
  });

  it("should require all filters to match", () => {
    expect(
      matchesFilters({ channel: "slack", type: "message" }, { channel: "slack", type: "message" }),
    ).toBe(true);
    expect(
      matchesFilters({ channel: "slack", type: "message" }, { channel: "slack", type: "file" }),
    ).toBe(false);
  });

  it("should handle missing payload keys", () => {
    expect(matchesFilters({ channel: "slack" }, {})).toBe(false);
  });
});
