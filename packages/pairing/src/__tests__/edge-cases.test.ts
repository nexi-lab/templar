import { describe, expect, it } from "vitest";
import { PairingGuard } from "../pairing-guard.js";

/** Helper to create guard with fixed clock */
function createGuard(overrides: Record<string, unknown> = {}, startTime: number = 1000000) {
  let now = startTime;
  const guard = new PairingGuard(
    {
      enabled: true,
      codeLength: 8,
      expiryMs: 300_000,
      maxAttempts: 3,
      maxPendingCodes: 1000,
      channels: ["whatsapp", "telegram"],
      ...overrides,
    },
    { now: () => now },
  );
  const advanceTime = (ms: number) => {
    now += ms;
  };
  return { guard, advanceTime };
}

describe("PairingGuard — edge cases", () => {
  it("non-pairing channel messages bypass", () => {
    const { guard } = createGuard({ channels: ["whatsapp"] });
    const result = guard.checkSender("agent-1", "slack", "peer-1", "hello");
    expect(result.status).toBe("bypass");
  });

  it("cross-channel isolation: WhatsApp pair != Telegram access", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    guard.checkSender("agent-1", "whatsapp", "peer-1", code.code);

    // Paired on whatsapp — approved there
    expect(guard.checkSender("agent-1", "whatsapp", "peer-1", "hi").status).toBe("approved");

    // NOT approved on telegram
    expect(guard.checkSender("agent-1", "telegram", "peer-1", "hi").status).toBe("pending");
  });

  it("empty peerId returns 'pending'", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    // Empty peerId — no approved peer match, no code in message
    const result = guard.checkSender("agent-1", "whatsapp", "", "hello");
    expect(result.status).toBe("pending");
  });

  it("disabled guard (enabled: false) returns 'bypass' for everything", () => {
    const { guard } = createGuard({ enabled: false });
    guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "hello");
    expect(result.status).toBe("bypass");
  });

  it("concurrent code gen produces unique codes", () => {
    const { guard } = createGuard();
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const { code } = guard.generateCode("agent-1", "whatsapp");
      codes.add(code);
    }
    // All codes should be unique
    expect(codes.size).toBe(100);
  });

  it("code with spaces in message body extracted", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", `   ${code.formatted}   `);
    expect(result.status).toBe("paired");
  });

  it("unicode peerId works", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "+1-555-123-4567", code.code);
    expect(result.status).toBe("paired");

    // Subsequent check with same unicode peerId
    const check = guard.checkSender("agent-1", "whatsapp", "+1-555-123-4567", "hi");
    expect(check.status).toBe("approved");
  });

  it("multiple codes in message: first valid one wins", () => {
    const { guard } = createGuard();
    const code1 = guard.generateCode("agent-1", "whatsapp");
    const code2 = guard.generateCode("agent-1", "whatsapp");
    // Message contains both codes — first match in text wins
    const result = guard.checkSender(
      "agent-1",
      "whatsapp",
      "peer-1",
      `${code1.formatted} and also ${code2.formatted}`,
    );
    expect(result.status).toBe("paired");
  });

  it("code at start of message extracted", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender(
      "agent-1",
      "whatsapp",
      "peer-1",
      `${code.formatted} is my code`,
    );
    expect(result.status).toBe("paired");
  });

  it("code at end of message extracted", () => {
    const { guard } = createGuard();
    const code = guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender(
      "agent-1",
      "whatsapp",
      "peer-1",
      `my code is ${code.formatted}`,
    );
    expect(result.status).toBe("paired");
  });

  it("empty message body returns 'pending'", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1", "");
    expect(result.status).toBe("pending");
  });

  it("undefined message text returns 'pending'", () => {
    const { guard } = createGuard();
    guard.generateCode("agent-1", "whatsapp");
    const result = guard.checkSender("agent-1", "whatsapp", "peer-1");
    expect(result.status).toBe("pending");
  });
});
