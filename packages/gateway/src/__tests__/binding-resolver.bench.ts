import { bench, describe } from "vitest";
import { BindingResolver, compileBindings, compilePattern } from "../binding-resolver.js";
import type { AgentBinding } from "../protocol/bindings.js";
import { makeMessage } from "./helpers.js";

// ---------------------------------------------------------------------------
// Pattern compilation
// ---------------------------------------------------------------------------

describe("compilePattern", () => {
  bench("exact pattern", () => {
    compilePattern("slack");
  });

  bench("prefix pattern", () => {
    compilePattern("slack-*");
  });

  bench("suffix pattern", () => {
    compilePattern("*-personal");
  });

  bench("wildcard pattern", () => {
    compilePattern("*");
  });
});

// ---------------------------------------------------------------------------
// Binding compilation at scale
// ---------------------------------------------------------------------------

function generateBindings(count: number): AgentBinding[] {
  return Array.from({ length: count }, (_, i) => ({
    agentId: `agent-${i}`,
    match: { channel: `channel-${i}` },
  }));
}

describe("compileBindings", () => {
  const bindings5 = generateBindings(5);
  const bindings50 = generateBindings(50);
  const bindings500 = generateBindings(500);

  bench("5 bindings", () => {
    compileBindings(bindings5);
  });

  bench("50 bindings", () => {
    compileBindings(bindings50);
  });

  bench("500 bindings", () => {
    compileBindings(bindings500);
  });
});

// ---------------------------------------------------------------------------
// Resolution at scale
// ---------------------------------------------------------------------------

function setupResolver(count: number): BindingResolver {
  const bindings = generateBindings(count);
  const resolver = new BindingResolver();
  resolver.updateBindings(bindings);
  return resolver;
}

describe("BindingResolver.resolve()", () => {
  // --- 5 bindings ---
  const resolver5 = setupResolver(5);
  const msg5Hit = makeMessage({ channelId: "channel-2" });
  const msg5Miss = makeMessage({ channelId: "unknown" });

  bench("5 bindings — hit (middle)", () => {
    resolver5.resolve(msg5Hit);
  });

  bench("5 bindings — miss", () => {
    resolver5.resolve(msg5Miss);
  });

  // --- 50 bindings ---
  const resolver50 = setupResolver(50);
  const msg50Hit = makeMessage({ channelId: "channel-25" });
  const msg50Miss = makeMessage({ channelId: "unknown" });

  bench("50 bindings — hit (middle)", () => {
    resolver50.resolve(msg50Hit);
  });

  bench("50 bindings — miss", () => {
    resolver50.resolve(msg50Miss);
  });

  // --- 500 bindings ---
  const resolver500 = setupResolver(500);
  const msg500Hit = makeMessage({ channelId: "channel-250" });
  const msg500Miss = makeMessage({ channelId: "unknown" });

  bench("500 bindings — hit (middle)", () => {
    resolver500.resolve(msg500Hit);
  });

  bench("500 bindings — miss", () => {
    resolver500.resolve(msg500Miss);
  });
});

// ---------------------------------------------------------------------------
// Mixed pattern types at scale
// ---------------------------------------------------------------------------

describe("BindingResolver.resolve() — mixed patterns", () => {
  const resolver = new BindingResolver();
  resolver.updateBindings([
    ...Array.from({ length: 100 }, (_, i) => ({
      agentId: `exact-${i}`,
      match: { channel: `ch-${i}` },
    })),
    ...Array.from({ length: 100 }, (_, i) => ({
      agentId: `prefix-${i}`,
      match: { channel: `pfx-${i}-*` },
    })),
    ...Array.from({ length: 100 }, (_, i) => ({
      agentId: `suffix-${i}`,
      match: { channel: `*-sfx-${i}` },
    })),
    { agentId: "catch-all", match: {} },
  ]);

  const exactMsg = makeMessage({ channelId: "ch-50" });
  const prefixMsg = makeMessage({ channelId: "pfx-50-workspace" });
  const suffixMsg = makeMessage({ channelId: "workspace-sfx-50" });
  const catchAllMsg = makeMessage({ channelId: "no-match" });

  bench("301 bindings — exact hit", () => {
    resolver.resolve(exactMsg);
  });

  bench("301 bindings — prefix hit", () => {
    resolver.resolve(prefixMsg);
  });

  bench("301 bindings — suffix hit", () => {
    resolver.resolve(suffixMsg);
  });

  bench("301 bindings — catch-all fallback", () => {
    resolver.resolve(catchAllMsg);
  });
});
