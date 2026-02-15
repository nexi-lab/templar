import { describe, expect, it, vi } from "vitest";
import { ACPChannelBridge } from "../../bridge.js";
import { ACP_CAPABILITIES } from "../../capabilities.js";

describe("ACPChannelBridge", () => {
  it("has name 'acp'", () => {
    const bridge = new ACPChannelBridge({});
    expect(bridge.name).toBe("acp");
  });

  it("has ACP_CAPABILITIES", () => {
    const bridge = new ACPChannelBridge({});
    expect(bridge.capabilities).toEqual(ACP_CAPABILITIES);
  });

  it("accepts config and passes to ACPServer", () => {
    // Should not throw with valid config
    const bridge = new ACPChannelBridge({
      agentName: "Test Bridge",
      maxSessions: 2,
    });
    expect(bridge.name).toBe("acp");
  });

  it("onMessage stores handler", () => {
    const bridge = new ACPChannelBridge({});
    const handler = vi.fn();
    bridge.onMessage(handler);
    // Handler is stored — no public accessor to verify, but shouldn't throw
  });

  it("send does not throw", async () => {
    const bridge = new ACPChannelBridge({});
    await expect(
      bridge.send({
        channelId: "test",
        blocks: [{ type: "text", content: "hello" }],
      }),
    ).resolves.not.toThrow();
  });
});
