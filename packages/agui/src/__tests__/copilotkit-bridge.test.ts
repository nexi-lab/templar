/**
 * CopilotKit Bridge Tests
 *
 * Validates that the CopilotKit bridge correctly creates
 * agent configuration pointing to the AG-UI server.
 */

import { describe, expect, it } from "vitest";
import { createCopilotKitAgent } from "../copilotkit/bridge.js";

describe("CopilotKit bridge", () => {
  it("creates agent config with correct URL from server options", () => {
    const agent = createCopilotKitAgent({
      name: "templar-agent",
      hostname: "127.0.0.1",
      port: 18790,
    });

    expect(agent.name).toBe("templar-agent");
    expect(agent.url).toBe("http://127.0.0.1:18790");
  });

  it("defaults to localhost:18790 when no host/port provided", () => {
    const agent = createCopilotKitAgent({ name: "templar-agent" });

    expect(agent.url).toBe("http://127.0.0.1:18790");
  });

  it("supports custom port", () => {
    const agent = createCopilotKitAgent({
      name: "templar-agent",
      port: 9999,
    });

    expect(agent.url).toBe("http://127.0.0.1:9999");
  });

  it("supports custom hostname", () => {
    const agent = createCopilotKitAgent({
      name: "templar-agent",
      hostname: "0.0.0.0",
      port: 18790,
    });

    expect(agent.url).toBe("http://0.0.0.0:18790");
  });

  it("includes optional description when provided", () => {
    const agent = createCopilotKitAgent({
      name: "templar-agent",
      description: "Templar AI assistant",
    });

    expect(agent.description).toBe("Templar AI assistant");
  });

  it("omits description when not provided", () => {
    const agent = createCopilotKitAgent({ name: "templar-agent" });

    expect(agent.description).toBeUndefined();
  });
});
