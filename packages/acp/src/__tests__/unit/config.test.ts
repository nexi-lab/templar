import { describe, expect, it } from "vitest";
import { parseACPConfig } from "../../config.js";

describe("ACPConfigSchema", () => {
  it("applies all defaults for empty input", () => {
    const config = parseACPConfig({});

    expect(config).toEqual({
      transport: "stdio",
      agentName: "Templar Agent",
      agentVersion: "0.0.0",
      maxSessions: 1,
      acceptImages: false,
      acceptAudio: false,
      acceptResources: true,
      supportLoadSession: false,
    });
  });

  it("accepts valid overrides", () => {
    const config = parseACPConfig({
      agentName: "My Agent",
      agentVersion: "1.2.3",
      maxSessions: 5,
      acceptImages: true,
      acceptAudio: true,
      acceptResources: false,
      supportLoadSession: true,
    });

    expect(config.agentName).toBe("My Agent");
    expect(config.agentVersion).toBe("1.2.3");
    expect(config.maxSessions).toBe(5);
    expect(config.acceptImages).toBe(true);
    expect(config.acceptAudio).toBe(true);
    expect(config.acceptResources).toBe(false);
    expect(config.supportLoadSession).toBe(true);
  });

  it("rejects empty agentName", () => {
    expect(() => parseACPConfig({ agentName: "" })).toThrow();
  });

  it("rejects non-positive maxSessions", () => {
    expect(() => parseACPConfig({ maxSessions: 0 })).toThrow();
    expect(() => parseACPConfig({ maxSessions: -1 })).toThrow();
  });

  it("rejects non-integer maxSessions", () => {
    expect(() => parseACPConfig({ maxSessions: 1.5 })).toThrow();
  });

  it("rejects invalid transport", () => {
    expect(() => parseACPConfig({ transport: "http" })).toThrow();
  });

  it("only allows stdio transport", () => {
    const config = parseACPConfig({ transport: "stdio" });
    expect(config.transport).toBe("stdio");
  });
});
